-- 0401_billing: cobrança da papelaria (S21, trilha Comércio). Leads grátis por papelaria, crédito pré-pago por lead
-- (preço por faixa de itens), passe de temporada parcelável e livro-razão IMUTÁVEL. O débito só acontece quando o
-- lead é entregue: gatilho `AFTER INSERT ... enable always` em `public.leads` (leads_billing_charge) que chama
-- billing_charge_lead_delivery() na MESMA transação do lead_create (S14/0303) — sem passe com cota, sem grátis e
-- sem saldo, a inserção do lead inteiro é desfeita (nem itens, consentimento, evento ou notificação nascem).
-- Fonte de verdade no banco; escrita só pelas funções SECURITY DEFINER abaixo (EXECUTE só service_role); nenhuma
-- tabela tem grant de INSERT/UPDATE/DELETE para authenticated nem service_role. Valores (grátis, faixas, pacotes,
-- passe, parcelas, meses da temporada) só em `plans`/filhas, nunca fixos no código (ver features/billing/limits.ts).
-- Moeda em centavos inteiros (integer). Erros com errcode + hint estáveis: forbidden, not_found, invalid_input,
-- invalid_plan, billing_required, billing_unavailable, stationery_unavailable, provider_invalid, consent_required,
-- amount_mismatch, invalid_state, installments_unavailable.
-- Sem FK para tabelas de outras trilhas alem de leads/stationeries/plans* (já em main, ADR-004 item 7).

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version >= 1),
  status text not null default 'active' check (status in ('active', 'archived')),
  free_leads integer not null check (free_leads between 0 and 10000),
  free_leads_validity_days integer check (free_leads_validity_days is null or free_leads_validity_days between 1 and 3650),
  pass_price_cents integer check (pass_price_cents is null or pass_price_cents between 1 and 10000000),
  pass_included_leads integer check (pass_included_leads is null or pass_included_leads >= 1),
  pass_max_installments integer check (pass_max_installments is null or pass_max_installments between 1 and 3),
  season_start_month integer not null check (season_start_month between 1 and 12),
  season_end_month integer not null check (season_end_month between 1 and 12),
  published_by uuid, -- sem FK: exclusão da conta do admin não pode disparar UPDATE (o guard de plans só permite active->archived)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((pass_price_cents is null) = (pass_included_leads is null) and (pass_price_cents is null) = (pass_max_installments is null))
);
-- um único plano ativo por vez (o valor da coluna filtrado é sempre 'active': unique vale como "no máximo um").
create unique index plans_one_active_idx on public.plans (status) where status = 'active';

create table public.plan_price_tiers (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete restrict,
  position integer not null check (position >= 1),
  min_items integer not null check (min_items >= 1),
  max_items integer check (max_items is null or max_items >= min_items),
  price_cents integer not null check (price_cents between 1 and 10000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, position)
);
create index plan_price_tiers_plan_idx on public.plan_price_tiers (plan_id, min_items);

create table public.plan_credit_packages (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete restrict,
  position integer not null check (position >= 1),
  amount_cents integer not null check (amount_cents between 1 and 10000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, position)
);
create index plan_credit_packages_plan_idx on public.plan_credit_packages (plan_id);

create table public.stationery_wallets (
  id uuid primary key default gen_random_uuid(),
  stationery_id uuid not null unique references public.stationeries (id) on delete restrict,
  plan_id uuid not null references public.plans (id) on delete restrict,
  free_leads_granted integer not null check (free_leads_granted >= 0),
  free_leads_expires_at timestamptz,
  is_demo boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.season_passes (
  id uuid primary key default gen_random_uuid(),
  stationery_id uuid not null references public.stationeries (id) on delete restrict,
  plan_id uuid not null references public.plans (id) on delete restrict,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'active', 'cancelled')),
  price_cents integer not null check (price_cents between 1 and 10000000),
  included_leads integer not null check (included_leads >= 1),
  installments integer not null check (installments between 1 and 3),
  season_start date not null,
  season_end date not null check (season_end >= season_start),
  activated_at timestamptz,
  is_demo boolean not null,
  actor_id uuid,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index season_passes_stationery_idx on public.season_passes (stationery_id);
-- um passe não cancelado por papelaria e temporada (o valor de season_start identifica a temporada).
create unique index season_passes_one_open_per_season on public.season_passes (stationery_id, season_start) where status <> 'cancelled';

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  stationery_id uuid not null references public.stationeries (id) on delete restrict,
  kind text not null check (kind in ('credit_package', 'season_pass_installment')),
  package_id uuid references public.plan_credit_packages (id) on delete restrict,
  season_pass_id uuid references public.season_passes (id) on delete restrict,
  installment_no integer check (installment_no is null or installment_no >= 1),
  amount_cents integer not null check (amount_cents between 1 and 10000000),
  due_date date not null,
  status text not null default 'open' check (status in ('open', 'paid', 'cancelled')),
  provider text not null check (provider in ('fake', 'demo', 'pix')),
  is_demo boolean not null,
  provider_charge_id text,
  pix_copy_paste text,
  charge_expires_at timestamptz,
  paid_at timestamptz,
  paid_amount_cents integer,
  idempotency_key text not null,
  consent_id uuid references public.consents (id) on delete set null,
  actor_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stationery_id, idempotency_key),
  unique (provider, provider_charge_id),
  check (provider = 'pix' or is_demo), -- dinheiro de mentira nunca vira crédito real
  check ((kind = 'credit_package') = (package_id is not null)),
  check ((kind = 'season_pass_installment') = (season_pass_id is not null and installment_no is not null))
);
create index invoices_stationery_idx on public.invoices (stationery_id, created_at desc);
create index invoices_season_pass_idx on public.invoices (season_pass_id);

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.stationery_wallets (id) on delete restrict,
  entry_type text not null check (entry_type in ('topup', 'lead_debit', 'free_lead', 'pass_lead', 'reversal')),
  amount_cents integer not null,
  balance_after_cents integer not null check (balance_after_cents >= 0),
  lead_id uuid references public.leads (id) on delete restrict,
  invoice_id uuid references public.invoices (id) on delete restrict,
  plan_id uuid references public.plans (id) on delete restrict,
  tier_id uuid references public.plan_price_tiers (id) on delete restrict,
  season_pass_id uuid references public.season_passes (id) on delete restrict,
  reverses_entry_id uuid references public.credit_ledger (id) on delete restrict,
  item_count integer check (item_count is null or item_count between 1 and 300),
  actor_id uuid,
  actor_role text check (actor_role is null or actor_role in ('admin', 'system')),
  reason text check (reason is null or length(reason) <= 500),
  idempotency_key text not null unique,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (
    (entry_type = 'topup' and amount_cents > 0)
    or (entry_type = 'lead_debit' and amount_cents < 0)
    or (entry_type in ('free_lead', 'pass_lead') and amount_cents = 0)
    or (entry_type = 'reversal' and reverses_entry_id is not null)
  )
);
create index credit_ledger_wallet_idx on public.credit_ledger (wallet_id, created_at, id);
create index credit_ledger_lead_idx on public.credit_ledger (lead_id);
create index credit_ledger_season_pass_idx on public.credit_ledger (season_pass_id) where season_pass_id is not null;
create index credit_ledger_reverses_idx on public.credit_ledger (reverses_entry_id) where reverses_entry_id is not null;

-- ---------------------------------------------------------------------------
-- Guardas de imutabilidade
-- ---------------------------------------------------------------------------
-- plan_price_tiers, plan_credit_packages e stationery_wallets: nunca mudam depois de criados, nem para o dono do banco.
create function public.billing_rows_block_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% é imutável (% bloqueado)', tg_table_name, tg_op using errcode = '42501';
end;
$$;
create trigger plan_price_tiers_no_update_delete before update or delete on public.plan_price_tiers
  for each row execute function public.billing_rows_block_mutation();
create trigger plan_credit_packages_no_update_delete before update or delete on public.plan_credit_packages
  for each row execute function public.billing_rows_block_mutation();
create trigger stationery_wallets_no_update_delete before update or delete on public.stationery_wallets
  for each row execute function public.billing_rows_block_mutation();

-- plans: só a transição status active -> archived (nada mais muda), feita por billing_plan_publish; qualquer outra
-- coisa (inclusive pelo dono do banco) é recusada. DELETE nunca.
create function public.billing_plan_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'plans é imutável' using errcode = '42501';
  end if;
  if old.status = 'active' and new.status = 'archived'
     and new.version = old.version
     and new.free_leads = old.free_leads
     and new.free_leads_validity_days is not distinct from old.free_leads_validity_days
     and new.pass_price_cents is not distinct from old.pass_price_cents
     and new.pass_included_leads is not distinct from old.pass_included_leads
     and new.pass_max_installments is not distinct from old.pass_max_installments
     and new.season_start_month = old.season_start_month
     and new.season_end_month = old.season_end_month
     and new.published_by is not distinct from old.published_by
     and new.created_at = old.created_at
  then
    return new;
  end if;
  raise exception 'plans é imutável (só a transição active -> archived, pela função billing_plan_publish)' using errcode = '42501';
end;
$$;
create trigger plans_guard before update or delete on public.plans
  for each row execute function public.billing_plan_guard();
alter table public.plans enable always trigger plans_guard;
alter table public.plan_price_tiers enable always trigger plan_price_tiers_no_update_delete;
alter table public.plan_credit_packages enable always trigger plan_credit_packages_no_update_delete;
alter table public.stationery_wallets enable always trigger stationery_wallets_no_update_delete;

-- credit_ledger: livro-razão imutável. Nem update/delete (linha) nem truncate (comando), nem em session_replication_role
-- = replica (enable always), nem pelo dono do banco.
create function public.credit_ledger_no_update_delete() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'credit_ledger é imutável (% bloqueado)', tg_op using errcode = '42501';
end;
$$;
create function public.credit_ledger_no_truncate() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'credit_ledger é imutável (truncate bloqueado)' using errcode = '42501';
end;
$$;
create trigger credit_ledger_no_update_delete before update or delete on public.credit_ledger
  for each row execute function public.credit_ledger_no_update_delete();
create trigger credit_ledger_no_truncate before truncate on public.credit_ledger
  for each statement execute function public.credit_ledger_no_truncate();
alter table public.credit_ledger enable always trigger credit_ledger_no_update_delete;
alter table public.credit_ledger enable always trigger credit_ledger_no_truncate;

create trigger stationery_wallets_set_updated_at before update on public.stationery_wallets
  for each row execute function public.set_updated_at(); -- nunca dispara (guarda bloqueia updates); mantido por padrão.
create trigger season_passes_set_updated_at before update on public.season_passes
  for each row execute function public.set_updated_at();
create trigger invoices_set_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

-- auditoria (append-only, já existe desde a 0001): idempotency_key/pix_copy_paste ficam fora (sensíveis/internos).
create trigger plans_audit after insert or update or delete on public.plans
  for each row execute function public.audit_row_change();
alter table public.plans enable always trigger plans_audit;
create trigger plan_price_tiers_audit after insert or delete on public.plan_price_tiers
  for each row execute function public.audit_row_change();
alter table public.plan_price_tiers enable always trigger plan_price_tiers_audit;
create trigger plan_credit_packages_audit after insert or delete on public.plan_credit_packages
  for each row execute function public.audit_row_change();
alter table public.plan_credit_packages enable always trigger plan_credit_packages_audit;
create trigger stationery_wallets_audit after insert or delete on public.stationery_wallets
  for each row execute function public.audit_row_change();
alter table public.stationery_wallets enable always trigger stationery_wallets_audit;
create trigger season_passes_audit after insert or update or delete on public.season_passes
  for each row execute function public.audit_row_change('idempotency_key');
alter table public.season_passes enable always trigger season_passes_audit;
create trigger invoices_audit after insert or update or delete on public.invoices
  for each row execute function public.audit_row_change('pix_copy_paste', 'idempotency_key');
alter table public.invoices enable always trigger invoices_audit;

-- ---------------------------------------------------------------------------
-- Funções internas
-- ---------------------------------------------------------------------------
create function public.billing_jwt_sub() returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  return nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
exception when others then
  return null;
end;
$$;

-- Janela da temporada (America/Cuiaba, sem horário de verão) do plano, contendo p_at (ou a próxima, se p_at estiver
-- fora): season_start/season_end (datas locais), starts_at/ends_at (instantes UTC do início e do fim + 1 dia), in_season.
create function public.billing_season_window(p_plan_id uuid, p_at timestamptz default now())
returns table (season_start date, season_end date, starts_at timestamptz, ends_at timestamptz, in_season boolean)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_ms integer;
  v_me integer;
  v_local date;
  v_local_m integer;
  v_local_y integer;
  v_start_y integer;
  v_end_y integer;
  v_in boolean;
begin
  select p.season_start_month, p.season_end_month into v_ms, v_me from public.plans p where p.id = p_plan_id;
  if v_ms is null then
    raise exception 'plano não encontrado' using errcode = 'P0002', hint = 'not_found';
  end if;
  v_local := (p_at at time zone 'America/Cuiaba')::date;
  v_local_m := extract(month from v_local)::integer;
  v_local_y := extract(year from v_local)::integer;
  if v_ms <= v_me then
    if v_local_m between v_ms and v_me then
      v_start_y := v_local_y; v_end_y := v_local_y; v_in := true;
    elsif v_local_m < v_ms then
      v_start_y := v_local_y; v_end_y := v_local_y; v_in := false;
    else
      v_start_y := v_local_y + 1; v_end_y := v_local_y + 1; v_in := false;
    end if;
  else
    if v_local_m >= v_ms then
      v_start_y := v_local_y; v_end_y := v_local_y + 1; v_in := true;
    elsif v_local_m <= v_me then
      v_start_y := v_local_y - 1; v_end_y := v_local_y; v_in := true;
    else
      v_start_y := v_local_y; v_end_y := v_local_y + 1; v_in := false;
    end if;
  end if;
  season_start := make_date(v_start_y, v_ms, 1);
  season_end := (make_date(v_end_y, v_me, 1) + interval '1 month' - interval '1 day')::date;
  starts_at := (season_start::timestamp) at time zone 'America/Cuiaba';
  ends_at := ((season_end + 1)::timestamp) at time zone 'America/Cuiaba';
  in_season := v_in;
  return next;
end;
$$;

-- Escolhe a fonte de cobrança de um lead com p_item_count itens para a papelaria, sem gravar nada. Com p_lock, trava a
-- carteira (for update) para quem for gravar em seguida (chamado só depois de billing_ensure_wallet garantir a linha).
-- ok=false e hint indicam por que (billing_unavailable = sem plano ativo; billing_required = sem passe/grátis/saldo).
create function public.billing_eval_source(p_stationery_id uuid, p_item_count integer, p_lock boolean)
returns table (
  ok boolean, hint text, wallet_id uuid, plan_id uuid, source text, amount_cents integer, tier_id uuid, season_pass_id uuid
)
language plpgsql
set search_path = ''
as $$
declare
  v_plan public.plans%rowtype;
  v_wallet public.stationery_wallets%rowtype;
  v_tier public.plan_price_tiers%rowtype;
  v_pass public.season_passes%rowtype;
  v_found boolean;
  v_used integer;
  v_balance integer;
begin
  select * into v_plan from public.plans p where p.status = 'active';
  if not found then
    ok := false; hint := 'billing_unavailable';
    return next; return;
  end if;
  plan_id := v_plan.id;

  select * into v_tier from public.plan_price_tiers t
   where t.plan_id = v_plan.id and t.min_items <= p_item_count and (t.max_items is null or p_item_count <= t.max_items)
   limit 1;

  if p_lock then
    select * into v_wallet from public.stationery_wallets w where w.stationery_id = p_stationery_id for update;
  else
    select * into v_wallet from public.stationery_wallets w where w.stationery_id = p_stationery_id;
  end if;
  v_found := found;

  if v_found then
    wallet_id := v_wallet.id;
    -- 1) passe ativo cuja janela contém agora, com cota (leads líquidos < included_leads)
    select * into v_pass from public.season_passes sp
     where sp.stationery_id = p_stationery_id and sp.status = 'active'
       and (now() at time zone 'America/Cuiaba')::date between sp.season_start and sp.season_end
     order by sp.season_start desc
     limit 1;
    if found then
      select count(*) into v_used from public.credit_ledger e
       where e.season_pass_id = v_pass.id and e.entry_type = 'pass_lead'
         and not exists (select 1 from public.credit_ledger r where r.reverses_entry_id = e.id);
      if v_used < v_pass.included_leads then
        ok := true; hint := null; source := 'pass_lead'; amount_cents := 0; season_pass_id := v_pass.id;
        return next; return;
      end if;
    end if;
    -- 2) grátis: líquidos < concedidos e (sem validade ou ainda dentro do prazo)
    select count(*) into v_used from public.credit_ledger e
     where e.wallet_id = v_wallet.id and e.entry_type = 'free_lead'
       and not exists (select 1 from public.credit_ledger r where r.reverses_entry_id = e.id);
    if v_used < v_wallet.free_leads_granted and (v_wallet.free_leads_expires_at is null or now() < v_wallet.free_leads_expires_at) then
      ok := true; hint := null; source := 'free_lead'; amount_cents := 0;
      return next; return;
    end if;
    -- 3) crédito: saldo cobre a faixa do item_count
    if v_tier.id is not null then
      select coalesce(sum(e.amount_cents), 0) into v_balance from public.credit_ledger e where e.wallet_id = v_wallet.id;
      if v_balance >= v_tier.price_cents then
        ok := true; hint := null; source := 'lead_debit'; amount_cents := -v_tier.price_cents; tier_id := v_tier.id;
        return next; return;
      end if;
    end if;
    ok := false; hint := 'billing_required';
    return next; return;
  else
    -- sem carteira ainda: usa o snapshot do plano diretamente, sem gravar (sem passe, pois carteira não existe).
    if v_plan.free_leads > 0 then
      ok := true; hint := null; source := 'free_lead'; amount_cents := 0;
      return next; return;
    end if;
    ok := false; hint := 'billing_required';
    return next; return;
  end if;
end;
$$;

-- Grava um lançamento sob a trava já obtida pelo chamador na carteira (for update); calcula balance_after = soma
-- anterior + amount. Idempotência real vem do unique(idempotency_key); o chamador escolhe a chave por caso de uso.
create function public.billing_append_entry(
  p_wallet_id uuid,
  p_entry_type text,
  p_amount_cents integer,
  p_idempotency_key text,
  p_lead_id uuid default null,
  p_invoice_id uuid default null,
  p_plan_id uuid default null,
  p_tier_id uuid default null,
  p_season_pass_id uuid default null,
  p_reverses_entry_id uuid default null,
  p_item_count integer default null,
  p_actor_id uuid default null,
  p_actor_role text default null,
  p_reason text default null
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_balance integer;
  v_id uuid;
begin
  select coalesce(sum(amount_cents), 0) into v_balance from public.credit_ledger where wallet_id = p_wallet_id;
  insert into public.credit_ledger (
    wallet_id, entry_type, amount_cents, balance_after_cents, lead_id, invoice_id, plan_id, tier_id, season_pass_id,
    reverses_entry_id, item_count, actor_id, actor_role, reason, idempotency_key
  ) values (
    p_wallet_id, p_entry_type, p_amount_cents, v_balance + p_amount_cents, p_lead_id, p_invoice_id, p_plan_id, p_tier_id,
    p_season_pass_id, p_reverses_entry_id, p_item_count, p_actor_id, p_actor_role, p_reason, p_idempotency_key
  ) returning id into v_id;
  return v_id;
end;
$$;

-- Consentimento de cobrança (checkbox "Li e aceito as condições de cobrança"): p_terms não vazio grava um novo
-- registro; vazio reaproveita o mais recente já dado pelo ator (senão consent_required).
create function public.billing_ensure_consent(p_actor_id uuid, p_terms text) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_terms text := nullif(btrim(coalesce(p_terms, '')), '');
  v_id uuid;
begin
  if v_terms is not null then
    insert into public.consents (profile_id, purpose, text_version) values (p_actor_id, 'billing_terms', v_terms) returning id into v_id;
    return v_id;
  end if;
  select id into v_id from public.consents
   where profile_id = p_actor_id and purpose = 'billing_terms'
   order by created_at desc limit 1;
  if not found then
    raise exception 'consentimento de cobrança obrigatório' using errcode = '22023', hint = 'consent_required';
  end if;
  return v_id;
end;
$$;

-- Ator (dono/staff) da papelaria, com papelaria active; confere sub do JWT quando presente. Levanta forbidden /
-- stationery_unavailable / not_found.
create function public.billing_check_member(p_actor_id uuid, p_stationery_id uuid) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_sub text := public.billing_jwt_sub();
  v_status public.stationery_status;
begin
  if v_sub is not null and v_sub is distinct from p_actor_id::text then
    raise exception 'ator diferente do usuário autenticado' using errcode = '42501', hint = 'forbidden';
  end if;
  select s.status into v_status from public.stationeries s where s.id = p_stationery_id;
  if not found then
    raise exception 'papelaria não encontrada' using errcode = 'P0002', hint = 'not_found';
  end if;
  if p_actor_id is null or not exists (
    select 1 from public.stationery_members m where m.stationery_id = p_stationery_id and m.profile_id = p_actor_id
  ) then
    raise exception 'ator não é membro da papelaria' using errcode = '42501', hint = 'forbidden';
  end if;
  if v_status <> 'active' then
    raise exception 'papelaria indisponível' using errcode = '23514', hint = 'stationery_unavailable';
  end if;
end;
$$;

-- Ator com papel admin (profiles.role = 'admin'); confere sub do JWT quando presente.
create function public.billing_check_admin(p_actor_id uuid) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_sub text := public.billing_jwt_sub();
  v_role public.user_role;
begin
  if v_sub is not null and v_sub is distinct from p_actor_id::text then
    raise exception 'ator diferente do usuário autenticado' using errcode = '42501', hint = 'forbidden';
  end if;
  select p.role into v_role from public.profiles p where p.id = p_actor_id;
  if v_role is distinct from 'admin' then
    raise exception 'ator não é admin' using errcode = '42501', hint = 'forbidden';
  end if;
end;
$$;

-- Provedor válido para o tipo de papelaria: demo -> fake/demo; real -> pix (bate com o CHECK de invoices).
create function public.billing_check_provider(p_provider text, p_is_demo boolean) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_is_demo then
    if p_provider not in ('fake', 'demo') then
      raise exception 'provedor inválido para papelaria de demonstração' using errcode = '22023', hint = 'provider_invalid';
    end if;
  else
    if p_provider <> 'pix' then
      raise exception 'provedor inválido para papelaria real' using errcode = '22023', hint = 'provider_invalid';
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- billing_plan_publish: só admin; cria plano + faixas + pacotes e arquiva o ativo anterior, na mesma transação.
-- ---------------------------------------------------------------------------
create function public.billing_plan_publish(p_actor_id uuid, p_plan jsonb) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_free_leads integer;
  v_free_validity integer;
  v_season_start integer;
  v_season_end integer;
  v_pass jsonb;
  v_pass_price integer;
  v_pass_leads integer;
  v_pass_installments integer;
  v_tiers jsonb;
  v_packages jsonb;
  v_n integer;
  v_plan_id uuid;
  v_version integer;
  v_prev_max integer;
  t record;
  i integer;
  v_amount integer;
begin
  perform public.billing_check_admin(p_actor_id);

  if p_plan is null or jsonb_typeof(p_plan) is distinct from 'object' then
    raise exception 'plano inválido' using errcode = '22023', hint = 'invalid_plan';
  end if;

  begin
    v_free_leads := (p_plan ->> 'free_leads')::integer;
    v_free_validity := case when p_plan -> 'free_leads_validity_days' is null or p_plan -> 'free_leads_validity_days' = 'null'::jsonb
      then null else (p_plan ->> 'free_leads_validity_days')::integer end;
    v_season_start := (p_plan -> 'season' ->> 'start_month')::integer;
    v_season_end := (p_plan -> 'season' ->> 'end_month')::integer;
    v_tiers := p_plan -> 'tiers';
    v_packages := p_plan -> 'packages';
    v_pass := case when p_plan -> 'pass' is null or p_plan -> 'pass' = 'null'::jsonb then null else p_plan -> 'pass' end;
  exception when others then
    raise exception 'plano com campos inválidos' using errcode = '22023', hint = 'invalid_plan';
  end;

  if v_free_leads is null or v_free_leads not between 0 and 10000 then
    raise exception 'free_leads inválido' using errcode = '22023', hint = 'invalid_plan';
  end if;
  if v_free_validity is not null and v_free_validity not between 1 and 3650 then
    raise exception 'free_leads_validity_days inválido' using errcode = '22023', hint = 'invalid_plan';
  end if;
  if v_season_start is null or v_season_start not between 1 and 12 or v_season_end is null or v_season_end not between 1 and 12 then
    raise exception 'meses da temporada inválidos' using errcode = '22023', hint = 'invalid_plan';
  end if;

  if v_pass is not null then
    if jsonb_typeof(v_pass) is distinct from 'object' then
      raise exception 'passe inválido' using errcode = '22023', hint = 'invalid_plan';
    end if;
    begin
      v_pass_price := (v_pass ->> 'price_cents')::integer;
      v_pass_leads := (v_pass ->> 'included_leads')::integer;
      v_pass_installments := (v_pass ->> 'max_installments')::integer;
    exception when others then
      raise exception 'passe com campos inválidos' using errcode = '22023', hint = 'invalid_plan';
    end;
    if v_pass_price is null or v_pass_price not between 1 and 10000000
       or v_pass_leads is null or v_pass_leads < 1
       or v_pass_installments is null or v_pass_installments not between 1 and 3 then
      raise exception 'passe fora dos limites' using errcode = '22023', hint = 'invalid_plan';
    end if;
  end if;

  if v_tiers is null or jsonb_typeof(v_tiers) is distinct from 'array' or jsonb_array_length(v_tiers) < 1 then
    raise exception 'faixas de preço inválidas' using errcode = '22023', hint = 'invalid_plan';
  end if;
  v_n := jsonb_array_length(v_tiers);
  v_prev_max := null;
  i := 0;
  for t in
    select (e ->> 'min_items')::integer as min_items, (e ->> 'max_items')::integer as max_items, (e ->> 'price_cents')::integer as price_cents
      from jsonb_array_elements(v_tiers) e
     order by (e ->> 'min_items')::integer
  loop
    i := i + 1;
    if t.min_items is null or t.price_cents is null or t.price_cents not between 1 and 10000000 then
      raise exception 'faixa inválida' using errcode = '22023', hint = 'invalid_plan';
    end if;
    if t.max_items is not null and t.max_items < t.min_items then
      raise exception 'faixa com max_items < min_items' using errcode = '22023', hint = 'invalid_plan';
    end if;
    if i = 1 and t.min_items <> 1 then
      raise exception 'faixas não começam em 1' using errcode = '22023', hint = 'invalid_plan';
    end if;
    if i > 1 and t.min_items <> v_prev_max + 1 then
      raise exception 'faixas com buraco ou sobreposição' using errcode = '22023', hint = 'invalid_plan';
    end if;
    if i < v_n and t.max_items is null then
      raise exception 'faixa aberta antes da última' using errcode = '22023', hint = 'invalid_plan';
    end if;
    if i = v_n and t.max_items is not null then
      raise exception 'última faixa precisa ser aberta' using errcode = '22023', hint = 'invalid_plan';
    end if;
    v_prev_max := t.max_items;
  end loop;

  if v_packages is null or jsonb_typeof(v_packages) is distinct from 'array' or jsonb_array_length(v_packages) not between 1 and 6 then
    raise exception 'pacotes de crédito inválidos' using errcode = '22023', hint = 'invalid_plan';
  end if;
  for i in 0 .. jsonb_array_length(v_packages) - 1 loop
    v_amount := (v_packages -> i ->> 'amount_cents')::integer;
    if v_amount is null or v_amount not between 1 and 10000000 then
      raise exception 'pacote de crédito inválido' using errcode = '22023', hint = 'invalid_plan';
    end if;
  end loop;

  select coalesce(max(version), 0) + 1 into v_version from public.plans;

  update public.plans set status = 'archived' where status = 'active';

  insert into public.plans (
    version, status, free_leads, free_leads_validity_days, pass_price_cents, pass_included_leads, pass_max_installments,
    season_start_month, season_end_month, published_by
  ) values (
    v_version, 'active', v_free_leads, v_free_validity, v_pass_price, v_pass_leads, v_pass_installments,
    v_season_start, v_season_end, p_actor_id
  ) returning id into v_plan_id;

  i := 0;
  for t in
    select (e ->> 'min_items')::integer as min_items, (e ->> 'max_items')::integer as max_items, (e ->> 'price_cents')::integer as price_cents
      from jsonb_array_elements(v_tiers) e
     order by (e ->> 'min_items')::integer
  loop
    i := i + 1;
    insert into public.plan_price_tiers (plan_id, position, min_items, max_items, price_cents) values (v_plan_id, i, t.min_items, t.max_items, t.price_cents);
  end loop;

  for i in 0 .. jsonb_array_length(v_packages) - 1 loop
    insert into public.plan_credit_packages (plan_id, position, amount_cents)
      values (v_plan_id, i + 1, (v_packages -> i ->> 'amount_cents')::integer);
  end loop;

  return v_plan_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- billing_ensure_wallet: cria a carteira (idempotente) com snapshot do plano ativo. not_found / billing_unavailable.
-- ---------------------------------------------------------------------------
create function public.billing_ensure_wallet(p_stationery_id uuid) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_demo boolean;
  v_plan public.plans%rowtype;
  v_first timestamptz;
  v_id uuid;
begin
  select s.is_demo into v_is_demo from public.stationeries s where s.id = p_stationery_id;
  if not found then
    raise exception 'papelaria não encontrada' using errcode = 'P0002', hint = 'not_found';
  end if;

  select id into v_id from public.stationery_wallets where stationery_id = p_stationery_id;
  if found then
    return v_id;
  end if;

  select * into v_plan from public.plans where status = 'active';
  if not found then
    raise exception 'sem plano ativo' using errcode = 'P0001', hint = 'billing_unavailable';
  end if;

  select min(e.created_at) into v_first from public.stationery_status_events e
   where e.stationery_id = p_stationery_id and e.to_status = 'active';

  insert into public.stationery_wallets (stationery_id, plan_id, free_leads_granted, free_leads_expires_at, is_demo)
  values (
    p_stationery_id, v_plan.id, v_plan.free_leads,
    case when v_plan.free_leads_validity_days is null then null
         else coalesce(v_first, now()) + (v_plan.free_leads_validity_days || ' days')::interval end,
    v_is_demo
  )
  on conflict (stationery_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.stationery_wallets where stationery_id = p_stationery_id;
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- billing_wallet_summary: leitura agregada para a tela Pap06 (saldo, grátis, passe ativo, faixa mínima).
-- ---------------------------------------------------------------------------
create function public.billing_wallet_summary(p_stationery_id uuid) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans%rowtype;
  v_wallet_id uuid;
  v_wallet public.stationery_wallets%rowtype;
  v_free_used integer;
  v_free_left integer;
  v_min_tier public.plan_price_tiers%rowtype;
  v_min_ok boolean;
  v_pass public.season_passes%rowtype;
  v_pass_used integer;
  v_active_pass jsonb := 'null'::jsonb;
begin
  select * into v_plan from public.plans where status = 'active';
  if not found then
    return jsonb_build_object('available', false);
  end if;

  v_wallet_id := public.billing_ensure_wallet(p_stationery_id);
  select * into v_wallet from public.stationery_wallets where id = v_wallet_id;

  select count(*) into v_free_used from public.credit_ledger e
   where e.wallet_id = v_wallet_id and e.entry_type = 'free_lead'
     and not exists (select 1 from public.credit_ledger r where r.reverses_entry_id = e.id);
  if v_wallet.free_leads_expires_at is not null and now() >= v_wallet.free_leads_expires_at then
    v_free_left := 0;
  else
    v_free_left := greatest(v_wallet.free_leads_granted - v_free_used, 0);
  end if;

  select * into v_min_tier from public.plan_price_tiers where plan_id = v_plan.id and min_items = 1;
  select ok into v_min_ok from public.billing_eval_source(p_stationery_id, 1, false);

  select * into v_pass from public.season_passes sp
   where sp.stationery_id = p_stationery_id and sp.status = 'active'
     and (now() at time zone 'America/Cuiaba')::date between sp.season_start and sp.season_end
   order by sp.season_start desc limit 1;
  if found then
    select count(*) into v_pass_used from public.credit_ledger e
     where e.season_pass_id = v_pass.id and e.entry_type = 'pass_lead'
       and not exists (select 1 from public.credit_ledger r where r.reverses_entry_id = e.id);
    v_active_pass := jsonb_build_object(
      'id', v_pass.id, 'included_leads', v_pass.included_leads, 'leads_left', greatest(v_pass.included_leads - v_pass_used, 0),
      'season_start', v_pass.season_start, 'season_end', v_pass.season_end
    );
  end if;

  return jsonb_build_object(
    'available', true,
    'balance_cents', (select coalesce(sum(amount_cents), 0) from public.credit_ledger where wallet_id = v_wallet_id),
    'free_granted', v_wallet.free_leads_granted,
    'free_left', v_free_left,
    'free_expires_at', v_wallet.free_leads_expires_at,
    'plan', jsonb_build_object('id', v_plan.id, 'version', v_plan.version),
    'active_pass', v_active_pass,
    'can_receive_min_tier', coalesce(v_min_ok, false),
    'min_tier_price_cents', v_min_tier.price_cents
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- billing_can_receive_lead: dry-run por papelaria (usado pelo App21 para não oferecer quem não pode receber).
-- ---------------------------------------------------------------------------
create function public.billing_can_receive_lead(p_stationery_ids uuid[], p_item_count integer)
returns table (stationery_id uuid, can_receive boolean)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  return query
    select s.id, coalesce(e.ok, false)
      from public.stationeries s
      cross join lateral public.billing_eval_source(s.id, p_item_count, false) e
     where s.id = any (p_stationery_ids);
end;
$$;

-- ---------------------------------------------------------------------------
-- billing_charge_lead_delivery: gatilho AFTER INSERT em leads (enable always). Débito só na entrega.
-- ---------------------------------------------------------------------------
create function public.billing_charge_lead_delivery() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_wallet_id uuid;
  v_eval record;
begin
  v_wallet_id := public.billing_ensure_wallet(new.stationery_id);
  select * into v_eval from public.billing_eval_source(new.stationery_id, new.item_count, true);
  if not v_eval.ok then
    raise exception 'cobrança indisponível para o lead %', new.id using errcode = 'P0001', hint = v_eval.hint;
  end if;
  perform public.billing_append_entry(
    v_wallet_id, v_eval.source, v_eval.amount_cents, 'lead:' || new.id::text,
    p_lead_id => new.id, p_plan_id => v_eval.plan_id, p_tier_id => v_eval.tier_id, p_season_pass_id => v_eval.season_pass_id,
    p_item_count => new.item_count, p_actor_role => 'system', p_actor_id => public.system_profile_id()
  );
  return null;
end;
$$;
create trigger leads_billing_charge after insert on public.leads
  for each row execute function public.billing_charge_lead_delivery();
alter table public.leads enable always trigger leads_billing_charge;

-- ---------------------------------------------------------------------------
-- billing_create_package_invoice: fatura de recarga (pacote de crédito), idempotente por (papelaria, chave).
-- ---------------------------------------------------------------------------
create function public.billing_create_package_invoice(
  p_actor_id uuid, p_stationery_id uuid, p_package_id uuid, p_provider text, p_idempotency_key uuid, p_terms_version text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid;
  v_is_demo boolean;
  v_amount integer;
  v_consent uuid;
  v_id uuid;
begin
  perform public.billing_check_member(p_actor_id, p_stationery_id);

  select id into v_existing from public.invoices where stationery_id = p_stationery_id and idempotency_key = p_idempotency_key::text;
  if found then
    return v_existing;
  end if;

  select s.is_demo into v_is_demo from public.stationeries s where s.id = p_stationery_id;
  perform public.billing_check_provider(p_provider, v_is_demo);

  select k.amount_cents into v_amount from public.plan_credit_packages k
    join public.plans p on p.id = k.plan_id and p.status = 'active'
   where k.id = p_package_id;
  if not found then
    raise exception 'pacote não encontrado' using errcode = 'P0002', hint = 'not_found';
  end if;

  v_consent := public.billing_ensure_consent(p_actor_id, p_terms_version);

  insert into public.invoices (
    stationery_id, kind, package_id, amount_cents, due_date, provider, is_demo, idempotency_key, consent_id, actor_id
  ) values (
    p_stationery_id, 'credit_package', p_package_id, v_amount, (now() at time zone 'America/Cuiaba')::date + 3, p_provider,
    v_is_demo, p_idempotency_key::text, v_consent, p_actor_id
  ) returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- billing_purchase_season_pass: compra/retoma o passe pendente da temporada corrente ou próxima; gera as parcelas.
-- ---------------------------------------------------------------------------
create function public.billing_purchase_season_pass(
  p_actor_id uuid, p_stationery_id uuid, p_installments integer, p_provider text, p_idempotency_key uuid, p_terms_version text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_demo boolean;
  v_plan public.plans%rowtype;
  v_window record;
  v_existing uuid;
  v_consent uuid;
  v_pass_id uuid;
  v_base integer;
  v_rest integer;
  v_amount integer;
  v_due date;
  v_today date;
  n integer;
begin
  perform public.billing_check_member(p_actor_id, p_stationery_id);
  select s.is_demo into v_is_demo from public.stationeries s where s.id = p_stationery_id;
  perform public.billing_check_provider(p_provider, v_is_demo);

  select * into v_plan from public.plans where status = 'active';
  if not found or v_plan.pass_price_cents is null then
    raise exception 'passe indisponível' using errcode = 'P0001', hint = 'billing_unavailable';
  end if;

  -- serializa por papelaria: evita corrida na criação do passe/parcelas.
  perform pg_advisory_xact_lock(hashtextextended('billing_purchase_season_pass:' || p_stationery_id::text, 0));

  select * into v_window from public.billing_season_window(v_plan.id, now());

  select id into v_existing from public.season_passes
   where stationery_id = p_stationery_id and season_start = v_window.season_start and status <> 'cancelled';
  if found then
    return v_existing;
  end if;

  if p_installments is null or p_installments not between 1 and v_plan.pass_max_installments then
    raise exception 'número de parcelas inválido' using errcode = '22023', hint = 'invalid_input';
  end if;

  v_today := (now() at time zone 'America/Cuiaba')::date;
  -- todas as parcelas (vencimentos mensais a partir de hoje) precisam caber até o fim da temporada.
  if (v_today + ((p_installments - 1) || ' months')::interval)::date > v_window.season_end then
    raise exception 'parcelas não cabem na temporada' using errcode = '23514', hint = 'installments_unavailable';
  end if;

  v_consent := public.billing_ensure_consent(p_actor_id, p_terms_version);

  insert into public.season_passes (
    stationery_id, plan_id, price_cents, included_leads, installments, season_start, season_end, is_demo, actor_id, idempotency_key
  ) values (
    p_stationery_id, v_plan.id, v_plan.pass_price_cents, v_plan.pass_included_leads, p_installments,
    v_window.season_start, v_window.season_end, v_is_demo, p_actor_id, p_idempotency_key::text
  ) returning id into v_pass_id;

  v_base := v_plan.pass_price_cents / p_installments;
  v_rest := v_plan.pass_price_cents - v_base * p_installments;
  for n in 0 .. p_installments - 1 loop
    v_amount := v_base + case when n = 0 then v_rest else 0 end;
    v_due := (v_today + (n || ' months')::interval)::date;
    insert into public.invoices (
      stationery_id, kind, season_pass_id, installment_no, amount_cents, due_date, provider, is_demo, idempotency_key, consent_id, actor_id
    ) values (
      p_stationery_id, 'season_pass_installment', v_pass_id, n + 1, v_amount, v_due, p_provider, v_is_demo,
      p_idempotency_key::text || ':' || (n + 1)::text, v_consent, p_actor_id
    );
  end loop;

  return v_pass_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- billing_attach_charge: grava txid/BR Code/validade de uma cobrança Pix numa fatura aberta do mesmo provedor.
-- ---------------------------------------------------------------------------
create function public.billing_attach_charge(
  p_invoice_id uuid, p_provider text, p_provider_charge_id text, p_pix_copy_paste text, p_charge_expires_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'fatura não encontrada' using errcode = 'P0002', hint = 'not_found';
  end if;
  if p_provider <> v_invoice.provider then
    raise exception 'provedor não bate com a fatura' using errcode = '22023', hint = 'provider_invalid';
  end if;
  if v_invoice.status <> 'open' then
    raise exception 'fatura não está aberta' using errcode = '23514', hint = 'invalid_state';
  end if;
  update public.invoices
     set provider_charge_id = p_provider_charge_id, pix_copy_paste = p_pix_copy_paste, charge_expires_at = p_charge_expires_at
   where id = p_invoice_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- billing_confirm_invoice_payment: confirma pagamento (chamado só após o adapter RECONSULTAR o PSP). Idempotente.
-- ---------------------------------------------------------------------------
create function public.billing_confirm_invoice_payment(
  p_invoice_id uuid, p_provider text, p_provider_ref text, p_amount_cents integer, p_paid_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
  v_wallet_id uuid;
  v_pass public.season_passes%rowtype;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'fatura não encontrada' using errcode = 'P0002', hint = 'not_found';
  end if;
  if v_invoice.status <> 'open' then
    return false;
  end if;
  if p_provider <> v_invoice.provider then
    raise exception 'provedor não bate com a fatura' using errcode = '22023', hint = 'provider_invalid';
  end if;
  if p_amount_cents <> v_invoice.amount_cents then
    raise exception 'valor não bate com a fatura' using errcode = '22023', hint = 'amount_mismatch';
  end if;

  update public.invoices
     set status = 'paid', paid_at = p_paid_at, paid_amount_cents = p_amount_cents,
         provider_charge_id = coalesce(provider_charge_id, p_provider_ref)
   where id = p_invoice_id;

  if v_invoice.kind = 'credit_package' then
    v_wallet_id := public.billing_ensure_wallet(v_invoice.stationery_id);
    perform 1 from public.stationery_wallets where id = v_wallet_id for update;
    perform public.billing_append_entry(
      v_wallet_id, 'topup', v_invoice.amount_cents, 'invoice:' || v_invoice.id::text,
      p_invoice_id => v_invoice.id, p_actor_id => v_invoice.actor_id, p_actor_role => 'system'
    );
  else
    select * into v_pass from public.season_passes where id = v_invoice.season_pass_id for update;
    if v_invoice.installment_no = 1 and v_pass.status = 'pending_payment' then
      update public.season_passes set status = 'active', activated_at = p_paid_at where id = v_pass.id;
    end if;
  end if;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- billing_reverse_entry: lançamento compensatório de um débito/grátis/passe (contestação aceita, S22). Idempotente.
-- ---------------------------------------------------------------------------
create function public.billing_reverse_entry(p_entry_id uuid, p_actor_id uuid, p_actor_role text, p_reason text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.credit_ledger%rowtype;
  v_existing uuid;
  v_role public.user_role;
  v_id uuid;
begin
  if p_actor_role is null or p_actor_role not in ('admin', 'system') then
    raise exception 'ator inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  if p_actor_role = 'admin' then
    if p_actor_id is null then
      raise exception 'ator ausente' using errcode = '42501', hint = 'forbidden';
    end if;
    select role into v_role from public.profiles where id = p_actor_id;
    if v_role is distinct from 'admin' then
      raise exception 'ator não é admin' using errcode = '42501', hint = 'forbidden';
    end if;
  end if;

  select * into v_entry from public.credit_ledger where id = p_entry_id;
  if not found then
    raise exception 'lançamento não encontrado' using errcode = 'P0002', hint = 'not_found';
  end if;
  if v_entry.entry_type not in ('lead_debit', 'free_lead', 'pass_lead') then
    raise exception 'lançamento não pode ser estornado' using errcode = '22023', hint = 'invalid_input';
  end if;

  -- trava a carteira (mesma ordem das demais escritas) antes de checar duplicidade e gravar.
  perform 1 from public.stationery_wallets where id = v_entry.wallet_id for update;

  select id into v_existing from public.credit_ledger where reverses_entry_id = p_entry_id;
  if found then
    return v_existing;
  end if;

  v_id := public.billing_append_entry(
    v_entry.wallet_id, 'reversal', -v_entry.amount_cents, 'reversal:' || p_entry_id::text,
    p_lead_id => v_entry.lead_id, p_invoice_id => v_entry.invoice_id, p_plan_id => v_entry.plan_id, p_tier_id => v_entry.tier_id,
    p_season_pass_id => v_entry.season_pass_id, p_reverses_entry_id => p_entry_id, p_item_count => v_entry.item_count,
    p_actor_id => p_actor_id, p_actor_role => p_actor_role, p_reason => nullif(btrim(coalesce(p_reason, '')), '')
  );
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.billing_jwt_sub() from public, anon, authenticated, service_role;
revoke execute on function public.billing_season_window(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke execute on function public.billing_eval_source(uuid, integer, boolean) from public, anon, authenticated, service_role;
revoke execute on function public.billing_append_entry(uuid, text, integer, text, uuid, uuid, uuid, uuid, uuid, uuid, integer, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.billing_charge_lead_delivery() from public, anon, authenticated, service_role;
revoke execute on function public.billing_ensure_consent(uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.billing_check_member(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.billing_check_admin(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.billing_check_provider(text, boolean) from public, anon, authenticated, service_role;
revoke execute on function public.billing_rows_block_mutation() from public, anon, authenticated, service_role;
revoke execute on function public.billing_plan_guard() from public, anon, authenticated, service_role;
revoke execute on function public.credit_ledger_no_update_delete() from public, anon, authenticated, service_role;
revoke execute on function public.credit_ledger_no_truncate() from public, anon, authenticated, service_role;

revoke execute on function public.billing_plan_publish(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.billing_plan_publish(uuid, jsonb) to service_role;
revoke execute on function public.billing_ensure_wallet(uuid) from public, anon, authenticated, service_role;
grant execute on function public.billing_ensure_wallet(uuid) to service_role;
revoke execute on function public.billing_wallet_summary(uuid) from public, anon, authenticated, service_role;
grant execute on function public.billing_wallet_summary(uuid) to service_role;
revoke execute on function public.billing_can_receive_lead(uuid[], integer) from public, anon, authenticated, service_role;
grant execute on function public.billing_can_receive_lead(uuid[], integer) to service_role;
revoke execute on function public.billing_create_package_invoice(uuid, uuid, uuid, text, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.billing_create_package_invoice(uuid, uuid, uuid, text, uuid, text) to service_role;
revoke execute on function public.billing_purchase_season_pass(uuid, uuid, integer, text, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.billing_purchase_season_pass(uuid, uuid, integer, text, uuid, text) to service_role;
revoke execute on function public.billing_attach_charge(uuid, text, text, text, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.billing_attach_charge(uuid, text, text, text, timestamptz) to service_role;
revoke execute on function public.billing_confirm_invoice_payment(uuid, text, text, integer, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.billing_confirm_invoice_payment(uuid, text, text, integer, timestamptz) to service_role;
revoke execute on function public.billing_reverse_entry(uuid, uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.billing_reverse_entry(uuid, uuid, text, text) to service_role;

revoke all on public.plans, public.plan_price_tiers, public.plan_credit_packages, public.stationery_wallets,
  public.credit_ledger, public.season_passes, public.invoices from public, anon, authenticated, service_role;

grant select on public.plans, public.plan_price_tiers, public.plan_credit_packages to authenticated, service_role;
grant select on public.stationery_wallets to authenticated, service_role;
grant select (id, wallet_id, entry_type, amount_cents, balance_after_cents, lead_id, invoice_id, plan_id, tier_id,
              season_pass_id, reverses_entry_id, item_count, actor_role, reason, created_at, updated_at)
  on public.credit_ledger to authenticated;
grant select on public.credit_ledger to service_role;
grant select (id, stationery_id, plan_id, status, price_cents, included_leads, installments, season_start, season_end,
              activated_at, is_demo, created_at, updated_at)
  on public.season_passes to authenticated;
grant select on public.season_passes to service_role;
grant select (id, stationery_id, kind, package_id, season_pass_id, installment_no, amount_cents, due_date, status,
              provider, is_demo, pix_copy_paste, charge_expires_at, paid_at, paid_amount_cents, created_at, updated_at)
  on public.invoices to authenticated;
grant select on public.invoices to service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.plan_price_tiers enable row level security;
alter table public.plan_credit_packages enable row level security;
alter table public.stationery_wallets enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.season_passes enable row level security;
alter table public.invoices enable row level security;

-- authenticated (papelaria): só o plano ativo (o histórico de preços é interno).
create policy plans_select_active on public.plans for select to authenticated using (status = 'active');
create policy plan_price_tiers_select_active on public.plan_price_tiers for select to authenticated
  using (exists (select 1 from public.plans p where p.id = plan_price_tiers.plan_id and p.status = 'active'));
create policy plan_credit_packages_select_active on public.plan_credit_packages for select to authenticated
  using (exists (select 1 from public.plans p where p.id = plan_credit_packages.plan_id and p.status = 'active'));

-- membro da papelaria: só a própria carteira/razão/passes/faturas. Admin lê pelo cliente de serviço (sem política RLS
-- de admin nestas tabelas, Ruling do ledger).
create policy stationery_wallets_select_member on public.stationery_wallets for select to authenticated
  using (exists (select 1 from public.stationery_members m where m.stationery_id = stationery_wallets.stationery_id and m.profile_id = (select auth.uid())));
create policy credit_ledger_select_member on public.credit_ledger for select to authenticated
  using (exists (
    select 1 from public.stationery_wallets w join public.stationery_members m on m.stationery_id = w.stationery_id
     where w.id = credit_ledger.wallet_id and m.profile_id = (select auth.uid())
  ));
create policy season_passes_select_member on public.season_passes for select to authenticated
  using (exists (select 1 from public.stationery_members m where m.stationery_id = season_passes.stationery_id and m.profile_id = (select auth.uid())));
create policy invoices_select_member on public.invoices for select to authenticated
  using (exists (select 1 from public.stationery_members m where m.stationery_id = invoices.stationery_id and m.profile_id = (select auth.uid())));
