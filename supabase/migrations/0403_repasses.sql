-- 0403_repasses: comissão, repasse e inadimplência (S23, trilha Comércio) + correções aditivas de segurança da
-- S21/S22 (0401/0402, já aplicadas fora deste worktree — nada aqui edita esses arquivos, só `create or replace`,
-- `alter table`, `revoke`/`grant`, novas tabelas e novas funções).
--
-- Modelo de dinheiro desta fatia (Ruling, ver ledger-comercio "S23 · Planejamento"): NENHUM código aqui custodia ou
-- move dinheiro de verdade. O adapter Pix genérico da S21 coleta para UMA conta (a da plataforma), sem split de
-- pagamento; não existe fonte real de "a plataforma recebeu o Pix do pai e repassa à papelaria". Por isso:
--   * `sale_payments` é um REGISTRO DECLARATIVO/CONFIRMADO (pela papelaria, ao declarar "Vendi", ou pelo admin após
--     conciliação manual) de que uma venda foi paga por Pix rastreado pela plataforma — não uma cobrança nova.
--   * Confirmar uma venda gera lançamentos em `payout_ledger` (livro-razão NOVO, apartado do `credit_ledger` da
--     S21): `commission` (o que a plataforma tem a COBRAR da papelaria, fora do sistema) e, se houver config de
--     escola/APM ativa, `repasse_due` (o que a plataforma deve REPASSAR, saído da própria comissão). Nenhum dos
--     dois debita `stationery_wallets`/`credit_ledger`: são só o registro/instrução; o admin executa manualmente.
--   * Inadimplência é uma RÉGUA sobre `invoices` (S21): sem `payout_settings` publicado, ninguém é pausado (falha
--     ABERTO — mesmo espírito de D-102, não travar produção por falta de configuração).
-- Moeda em centavos inteiros. Erros com errcode + hint estáveis: forbidden, not_found, invalid_input,
-- payout_unavailable, invalid_state, nothing_due, already_resolved.
-- Sem FK para tabelas de outras trilhas além de leads/stationeries/schools/invoices (já em main).
-- Limite inerente (já registrado em 0401/0402): um superusuário do Postgres sempre pode `disable trigger` e religar
-- depois — nenhuma trigger resiste a quem tem esse poder; fora do modelo de ameaça (mesmo limite de audit_log).

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

-- payout_settings: config GLOBAL de comissão e prazos de inadimplência. Versionada como `plans` (0401): só a
-- transição active -> archived muda uma linha; publicar cria uma linha nova e arquiva a anterior.
create table public.payout_settings (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'active' check (status in ('active', 'archived')),
  commission_bps integer not null check (commission_bps between 0 and 10000),
  grace_days integer not null check (grace_days between 0 and 365),
  block_days integer not null check (block_days > grace_days and block_days <= 365),
  published_by uuid, -- sem FK: exclusão da conta do admin não pode disparar UPDATE (mesmo motivo de plans.published_by)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index payout_settings_one_active_idx on public.payout_settings (status) where status = 'active';

-- school_payout_settings: config de repasse POR ESCOLA (ou APM da escola). Mesma versão-imutável de payout_settings.
create table public.school_payout_settings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'archived')),
  target text not null check (target in ('none', 'school', 'apm')),
  payout_bps integer not null default 0 check (payout_bps between 0 and 10000),
  beneficiary_name text check (beneficiary_name is null or length(btrim(beneficiary_name)) between 1 and 200),
  -- Chave Pix da escola/APM: dado sensível (grant só a service_role, nunca authenticated/anon; nunca em log).
  pix_key text check (pix_key is null or length(pix_key) <= 200),
  pix_key_kind text check (pix_key_kind is null or pix_key_kind in ('cpf', 'cnpj', 'email', 'phone', 'random')),
  created_by uuid, -- sem FK, rastro (mesmo padrão de payout_settings.published_by)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((target = 'none') = (payout_bps = 0)),
  check (target = 'none' or (beneficiary_name is not null and pix_key is not null and pix_key_kind is not null))
);
create unique index school_payout_settings_one_active_idx on public.school_payout_settings (school_id) where status = 'active';
create index school_payout_settings_school_idx on public.school_payout_settings (school_id, created_at desc);

-- sale_payments: registro DECLARATIVO de uma venda paga por Pix rastreado pela plataforma (ver comentário do
-- cabeçalho). Uma linha por lead (unique lead_id); nunca muda depois de criada (append-only).
create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leads (id) on delete restrict,
  stationery_id uuid not null references public.stationeries (id) on delete restrict,
  -- escola atribuída pelo confirmador (papelaria/admin); SEM resolução automática (leads.list_id não tem FK para
  -- schools — 0600 marca isso como "fora do escopo, polimórfica"); sem escolha, fica nula e não há repasse.
  school_id uuid references public.schools (id) on delete restrict,
  amount_cents integer not null check (amount_cents between 1 and 10000000), -- snapshot de leads.declared_sale_cents
  commission_bps_snapshot integer not null check (commission_bps_snapshot between 0 and 10000),
  is_demo boolean not null,
  confirmed_by uuid, -- sem FK, rastro
  confirmed_role text not null check (confirmed_role in ('stationery_member', 'admin', 'system')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index sale_payments_stationery_idx on public.sale_payments (stationery_id, created_at desc);
create index sale_payments_school_idx on public.sale_payments (school_id) where school_id is not null;

-- sale_payment_admin_validations (revisão de segurança, rodada 2): registro de que um ADMIN validou uma venda que a
-- PRÓPRIA papelaria já tinha confirmado (`sale_payments.confirmed_role = 'stationery_member'`). Sem isso, uma venda
-- confirmada primeiro pela papelaria (Pap03) ficava perdida — sumia de "Vendas para confirmar" (Admin13) pela
-- idempotência de `payout_confirm_sale`, nunca virava repasse e nunca contava o sinal Pix (`pix_confirmed`) por
-- confirmação de admin/system (IMPORTANTE 5 da rodada anterior). Uma linha por venda (`unique(sale_payment_id)`):
-- a validação é um evento único, não repetível, mesmo padrão de imutabilidade de `sale_payments`/`payout_ledger`
-- (nunca UPDATE/DELETE). `school_id` aqui é o que o ADMIN escolheu ao validar (pode ou não coincidir com o que a
-- papelaria tinha como dica em `leads.school_name`) — ver `payout_admin_validate_sale`.
create table public.sale_payment_admin_validations (
  id uuid primary key default gen_random_uuid(),
  sale_payment_id uuid not null unique references public.sale_payments (id) on delete restrict,
  school_id uuid references public.schools (id) on delete restrict,
  validated_by uuid, -- sem FK, rastro (mesmo padrão de payout_settings.published_by)
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp() -- convenção do projeto (toda tabela tem os dois); nunca muda de fato: linha é append-only
);

-- payout_batches: "lote de pagamento" (Admin13) — o sistema gera a INSTRUÇÃO (quanto, para quem); o admin executa
-- a transferência de verdade FORA do sistema e só então marca como executado.
create table public.payout_batches (
  id uuid primary key default gen_random_uuid(),
  beneficiary_type text not null check (beneficiary_type in ('school', 'apm')),
  school_id uuid not null references public.schools (id) on delete restrict,
  total_cents integer not null check (total_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'executed')),
  created_by uuid, -- sem FK, rastro
  executed_by uuid,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'executed') = (executed_at is not null))
);
create index payout_batches_school_idx on public.payout_batches (school_id, created_at desc);

-- payout_ledger: livro-razão IMUTÁVEL do dinheiro de comissão/repasse (nunca stationery_wallets/credit_ledger, S21).
-- `commission`: o que a plataforma tem a cobrar da papelaria (beneficiary_type='platform', sem beneficiary_id).
-- `repasse_due`: o que a plataforma deve repassar a escola/APM, saído da comissão.
-- `repasse_settled`: gerado por `payout_batch_create` (inclusão num lote) — some do "pendente", não é a execução em
-- si (essa é só `payout_batches.status`).
-- `repasse_reversed`/`commission_reversed`: estorno manual (admin) de um `repasse_due`/`commission` específico —
-- `payout_reverse_entry` (ver mais abaixo), mesmo padrão idempotente de `billing_reverse_entry` (S21):
-- `reverses_entry_id` aponta para o lançamento original e uma 2ª chamada devolve o estorno já existente.
create table public.payout_ledger (
  id uuid primary key default gen_random_uuid(),
  -- nulo só para `repasse_settled` (lançamento de LOTE, uma escola/N vendas — ligar a uma venda arbitrária via
  -- `limit 1` seria enganoso); todo outro tipo é sempre rastreável a UMA venda.
  sale_payment_id uuid references public.sale_payments (id) on delete restrict,
  entry_type text not null check (entry_type in ('commission', 'repasse_due', 'repasse_settled', 'repasse_reversed', 'commission_reversed')),
  beneficiary_type text not null check (beneficiary_type in ('platform', 'school', 'apm')),
  beneficiary_id uuid, -- school_id quando beneficiary_type in ('school','apm'); nulo para 'platform'
  amount_cents integer not null check (amount_cents <> 0),
  batch_id uuid references public.payout_batches (id) on delete restrict,
  -- sem FK para o próprio payout_ledger de propósito: uma FK faria qualquer TRUNCATE (0A000) se comportar diferente
  -- do 42501 do gatilho de imutabilidade (mesma lição da S22, `lead_disputes.reversed_entry_id`).
  reverses_entry_id uuid,
  actor_id uuid,
  actor_role text check (actor_role is null or actor_role in ('admin', 'system', 'stationery_member')),
  reason text check (reason is null or length(reason) <= 500),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (
    (entry_type = 'commission' and beneficiary_type = 'platform' and beneficiary_id is null and amount_cents > 0 and batch_id is null and sale_payment_id is not null and reverses_entry_id is null)
    or (entry_type = 'commission_reversed' and beneficiary_type = 'platform' and beneficiary_id is null and amount_cents < 0 and batch_id is null and sale_payment_id is not null and reverses_entry_id is not null)
    or (entry_type = 'repasse_due' and beneficiary_type in ('school', 'apm') and beneficiary_id is not null and amount_cents > 0 and batch_id is null and sale_payment_id is not null and reverses_entry_id is null)
    or (entry_type = 'repasse_settled' and beneficiary_type in ('school', 'apm') and beneficiary_id is not null and amount_cents < 0 and batch_id is not null and sale_payment_id is null and reverses_entry_id is null)
    or (entry_type = 'repasse_reversed' and beneficiary_type in ('school', 'apm') and beneficiary_id is not null and amount_cents < 0 and sale_payment_id is not null and reverses_entry_id is not null)
  )
);
create index payout_ledger_sale_idx on public.payout_ledger (sale_payment_id);
create index payout_ledger_beneficiary_idx on public.payout_ledger (beneficiary_type, beneficiary_id, created_at);
create index payout_ledger_batch_idx on public.payout_ledger (batch_id) where batch_id is not null;
create index payout_ledger_reverses_idx on public.payout_ledger (reverses_entry_id) where reverses_entry_id is not null;

-- billing_payment_alerts (D-101, S21): pagamento recebido por um `provider_charge_id` que já pertence a uma fatura
-- (S21/0401) que não está mais aberta (já paga, ou cancelada) — hoje isso é ignorado em silêncio pelo webhook/cron.
-- Registra e deixa para o admin decidir (estorno manual, se for o caso); mutável só pela transição resolvido.
create table public.billing_payment_alerts (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  provider text not null check (provider in ('fake', 'demo', 'pix')),
  provider_charge_id text not null,
  amount_cents integer not null check (amount_cents > 0),
  invoice_status_at_detection text not null check (invoice_status_at_detection in ('paid', 'cancelled')),
  detected_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  resolved_by uuid, -- sem FK, rastro
  resolution_note text check (resolution_note is null or length(resolution_note) <= 500),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (invoice_id, provider, provider_charge_id),
  check ((resolved_at is not null) = (resolved_by is not null))
);
create index billing_payment_alerts_open_idx on public.billing_payment_alerts (detected_at) where resolved_at is null;

-- ---------------------------------------------------------------------------
-- Guardas de imutabilidade (reaproveitando funções genéricas já criadas em 0401: dinâmicas por tg_table_name)
-- ---------------------------------------------------------------------------
create trigger sale_payments_no_update_delete before update or delete on public.sale_payments
  for each row execute function public.billing_rows_block_mutation();
alter table public.sale_payments enable always trigger sale_payments_no_update_delete;

create trigger payout_ledger_no_update_delete before update or delete on public.payout_ledger
  for each row execute function public.billing_rows_block_mutation();
alter table public.payout_ledger enable always trigger payout_ledger_no_update_delete;

create trigger sale_payment_admin_validations_no_update_delete before update or delete on public.sale_payment_admin_validations
  for each row execute function public.billing_rows_block_mutation();
alter table public.sale_payment_admin_validations enable always trigger sale_payment_admin_validations_no_update_delete;

create function public.payout_ledger_no_truncate() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'payout_ledger é imutável (truncate bloqueado)' using errcode = '42501';
end;
$$;
create trigger payout_ledger_no_truncate before truncate on public.payout_ledger
  for each statement execute function public.payout_ledger_no_truncate();
alter table public.payout_ledger enable always trigger payout_ledger_no_truncate;

-- payout_settings / school_payout_settings: só a transição active -> archived (mesmo padrão de billing_plan_guard).
create function public.payout_settings_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'payout_settings é imutável' using errcode = '42501';
  end if;
  if old.status = 'active' and new.status = 'archived'
     and new.commission_bps = old.commission_bps and new.grace_days = old.grace_days and new.block_days = old.block_days
     and new.published_by is not distinct from old.published_by and new.created_at = old.created_at
  then
    return new;
  end if;
  raise exception 'payout_settings é imutável (só a transição active -> archived)' using errcode = '42501';
end;
$$;
create trigger payout_settings_guard before update or delete on public.payout_settings
  for each row execute function public.payout_settings_guard();
alter table public.payout_settings enable always trigger payout_settings_guard;

create function public.school_payout_settings_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'school_payout_settings é imutável' using errcode = '42501';
  end if;
  if old.status = 'active' and new.status = 'archived'
     and new.school_id = old.school_id and new.target = old.target and new.payout_bps = old.payout_bps
     and new.beneficiary_name is not distinct from old.beneficiary_name and new.pix_key is not distinct from old.pix_key
     and new.pix_key_kind is not distinct from old.pix_key_kind and new.created_by is not distinct from old.created_by
     and new.created_at = old.created_at
  then
    return new;
  end if;
  raise exception 'school_payout_settings é imutável (só a transição active -> archived)' using errcode = '42501';
end;
$$;
create trigger school_payout_settings_guard before update or delete on public.school_payout_settings
  for each row execute function public.school_payout_settings_guard();
alter table public.school_payout_settings enable always trigger school_payout_settings_guard;

-- payout_batches: só a transição pending -> executed (gravando executed_by/executed_at); nunca delete.
create function public.payout_batches_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'payout_batches é imutável' using errcode = '42501';
  end if;
  if old.status = 'pending' and new.status = 'executed'
     and new.beneficiary_type = old.beneficiary_type and new.school_id = old.school_id and new.total_cents = old.total_cents
     and new.created_by is not distinct from old.created_by and new.created_at = old.created_at
     and new.executed_at is not null and new.executed_by is not null
  then
    return new;
  end if;
  raise exception 'payout_batches é imutável (só a transição pending -> executed)' using errcode = '42501';
end;
$$;
create trigger payout_batches_guard before update or delete on public.payout_batches
  for each row execute function public.payout_batches_guard();
alter table public.payout_batches enable always trigger payout_batches_guard;

-- billing_payment_alerts: só a transição não-resolvido -> resolvido (gravando resolved_at/resolved_by/note).
create function public.billing_payment_alerts_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'billing_payment_alerts é imutável' using errcode = '42501';
  end if;
  if old.resolved_at is null and new.resolved_at is not null
     and new.invoice_id = old.invoice_id and new.provider = old.provider and new.provider_charge_id = old.provider_charge_id
     and new.amount_cents = old.amount_cents and new.invoice_status_at_detection = old.invoice_status_at_detection
     and new.detected_at = old.detected_at and new.created_at = old.created_at
  then
    return new;
  end if;
  raise exception 'billing_payment_alerts é imutável (só a transição para resolvido)' using errcode = '42501';
end;
$$;
create trigger billing_payment_alerts_guard before update or delete on public.billing_payment_alerts
  for each row execute function public.billing_payment_alerts_guard();
alter table public.billing_payment_alerts enable always trigger billing_payment_alerts_guard;

create trigger payout_batches_set_updated_at before update on public.payout_batches
  for each row execute function public.set_updated_at(); -- só dispara na transição permitida pelo guard acima

-- ---------------------------------------------------------------------------
-- Auditoria (append-only, já existe desde a 0001)
-- ---------------------------------------------------------------------------
create trigger payout_settings_audit after insert or update on public.payout_settings
  for each row execute function public.audit_row_change();
alter table public.payout_settings enable always trigger payout_settings_audit;
-- Bloqueante (revisão de segurança): pix_key/beneficiary_name são dado sensível — nunca no audit_log (imutável).
create trigger school_payout_settings_audit after insert or update on public.school_payout_settings
  for each row execute function public.audit_row_change('pix_key', 'beneficiary_name');
alter table public.school_payout_settings enable always trigger school_payout_settings_audit;
create trigger payout_batches_audit after insert or update on public.payout_batches
  for each row execute function public.audit_row_change();
alter table public.payout_batches enable always trigger payout_batches_audit;
create trigger billing_payment_alerts_audit after insert or update on public.billing_payment_alerts
  for each row execute function public.audit_row_change();
alter table public.billing_payment_alerts enable always trigger billing_payment_alerts_audit;

-- ---------------------------------------------------------------------------
-- Funções internas
-- ---------------------------------------------------------------------------
create function public.payout_jwt_sub() returns text
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

create function public.payout_check_admin(p_actor_id uuid) returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_role public.user_role;
  v_sub text := public.payout_jwt_sub();
begin
  if p_actor_id is null then
    raise exception 'ator ausente' using errcode = '42501', hint = 'forbidden';
  end if;
  -- revisão de segurança: confere o `sub` do JWT contra o ator informado (mesmo padrão de billing_check_admin,
  -- 0401) — sem isso, um chamador com sessão de OUTRO usuário conseguia informar qualquer p_actor_id admin.
  if v_sub is not null and v_sub is distinct from p_actor_id::text then
    raise exception 'ator diferente do usuário autenticado' using errcode = '42501', hint = 'forbidden';
  end if;
  select role into v_role from public.profiles where id = p_actor_id;
  if v_role is distinct from 'admin' then
    raise exception 'ator não é admin' using errcode = '42501', hint = 'forbidden';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- payout_delinquency_status: régua de cobrança sobre invoices (S21). Sem config publicada, sempre 'em_dia' (falha
-- aberto, D-102-like). Não é security definer (mesmo padrão de billing_eval_source): chamada de dentro de funções
-- já elevadas (billing_can_receive_lead, billing_charge_lead_delivery) ou por payout_admin_delinquency_list abaixo.
-- Revisão de segurança: só conta PARCELA DO PASSE (`kind = 'season_pass_installment'`) real (`is_demo = false`) —
-- uma recarga de crédito pré-paga (`credit_package`) abandonada não é uma dívida que deva pausar a papelaria (ela
-- só perde o crédito que não comprou; nunca ficou "devendo"), e fatura de demonstração nunca deve pausar papelaria
-- nenhuma. Datas sempre em America/Cuiaba (nunca `::date` cru, que depende do fuso da SESSÃO do banco).
-- ---------------------------------------------------------------------------
create function public.payout_delinquency_status(p_stationery_id uuid, p_at timestamptz default now())
returns table (status text, days_overdue integer, oldest_open_invoice_id uuid, oldest_due_date date)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_grace integer;
  v_block integer;
  v_due date;
  v_invoice_id uuid;
  v_today date := (p_at at time zone 'America/Cuiaba')::date;
begin
  select grace_days, block_days into v_grace, v_block from public.payout_settings where payout_settings.status = 'active';
  select i.due_date, i.id into v_due, v_invoice_id from public.invoices i
   where i.stationery_id = p_stationery_id and i.status = 'open' and i.kind = 'season_pass_installment'
     and i.is_demo = false and i.due_date < v_today
   order by i.due_date asc limit 1;
  if v_grace is null or v_due is null then
    status := 'em_dia'; days_overdue := 0; oldest_open_invoice_id := null; oldest_due_date := null;
    return next;
    return;
  end if;
  days_overdue := (v_today - v_due);
  oldest_open_invoice_id := v_invoice_id;
  oldest_due_date := v_due;
  -- fronteira INCLUSIVA: exatamente `grace_days`/`block_days` de atraso ainda conta para o estágio anterior.
  status := case when days_overdue > v_block then 'pausado' when days_overdue > v_grace then 'atraso' else 'em_dia' end;
  return next;
end;
$$;

-- Leitura administrativa (Admin14): status de TODA papelaria não-arquivada, para a régua de cobrança.
create function public.payout_admin_delinquency_list(p_actor_id uuid)
returns table (stationery_id uuid, trade_name text, status text, days_overdue integer, oldest_due_date date)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.payout_check_admin(p_actor_id);
  return query
    select s.id, s.trade_name, d.status, d.days_overdue, d.oldest_due_date
      from public.stationeries s
      cross join lateral public.payout_delinquency_status(s.id) d
     where s.status not in ('signup', 'rejected')
     order by (case d.status when 'pausado' then 0 when 'atraso' then 1 else 2 end), d.days_overdue desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- payout_settings_publish / payout_school_config_publish: admin publica config (versão imutável nova + arquiva
-- a anterior, mesmo padrão de billing_plan_publish).
-- ---------------------------------------------------------------------------
create function public.payout_settings_publish(p_actor_id uuid, p_commission_bps integer, p_grace_days integer, p_block_days integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.payout_check_admin(p_actor_id);
  if p_commission_bps is null or p_commission_bps not between 0 and 10000 then
    raise exception 'comissão inválida' using errcode = '22023', hint = 'invalid_input';
  end if;
  if p_grace_days is null or p_grace_days not between 0 and 365 or p_block_days is null or p_block_days <= p_grace_days or p_block_days > 365 then
    raise exception 'prazos inválidos' using errcode = '22023', hint = 'invalid_input';
  end if;
  update public.payout_settings set status = 'archived' where status = 'active';
  insert into public.payout_settings (commission_bps, grace_days, block_days, published_by)
  values (p_commission_bps, p_grace_days, p_block_days, p_actor_id)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.payout_school_config_publish(
  p_actor_id uuid, p_school_id uuid, p_target text, p_payout_bps integer,
  p_beneficiary_name text, p_pix_key text, p_pix_key_kind text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_commission_bps integer;
  v_bps integer := coalesce(p_payout_bps, 0);
  v_name text := nullif(btrim(coalesce(p_beneficiary_name, '')), '');
  v_key text := nullif(btrim(coalesce(p_pix_key, '')), '');
begin
  perform public.payout_check_admin(p_actor_id);
  if p_school_id is null or not exists (select 1 from public.schools where id = p_school_id) then
    raise exception 'escola não encontrada' using errcode = 'P0002', hint = 'not_found';
  end if;
  if p_target is null or p_target not in ('none', 'school', 'apm') then
    raise exception 'alvo inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  if p_target = 'none' then
    v_bps := 0; v_name := null; v_key := null; p_pix_key_kind := null;
  else
    if v_bps <= 0 or v_bps > 10000 then
      raise exception 'percentual de repasse inválido' using errcode = '22023', hint = 'invalid_input';
    end if;
    select commission_bps into v_commission_bps from public.payout_settings where status = 'active';
    if v_commission_bps is null then
      raise exception 'comissão ainda não configurada' using errcode = '23514', hint = 'payout_unavailable';
    end if;
    if v_bps > v_commission_bps then
      raise exception 'repasse não pode ser maior que a comissão vigente' using errcode = '22023', hint = 'invalid_input';
    end if;
    if v_name is null or v_key is null or p_pix_key_kind is null or p_pix_key_kind not in ('cpf', 'cnpj', 'email', 'phone', 'random') then
      raise exception 'beneficiário/chave Pix obrigatórios para este alvo' using errcode = '22023', hint = 'invalid_input';
    end if;
  end if;
  update public.school_payout_settings set status = 'archived' where school_id = p_school_id and status = 'active';
  insert into public.school_payout_settings (school_id, target, payout_bps, beneficiary_name, pix_key, pix_key_kind, created_by)
  values (p_school_id, p_target, v_bps, v_name, v_key, p_pix_key_kind, p_actor_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- payout_confirm_sale: registra "esta venda foi paga por Pix rastreado pela plataforma" (declarativo, ver
-- cabeçalho). Idempotente por lead_id. Gera sempre 1 lançamento `commission`; gera `repasse_due` só se p_school_id
-- vier informado, a escola tiver config ativa com alvo <> 'none' E quem confirma for admin/system — revisão de
-- segurança: uma papelaria (`stationery_member`) sozinha NUNCA cria obrigação de repasse (mesmo escolhendo uma
-- escola no formulário), só sua própria comissão; sem isso, uma papelaria em conluio com quem controla a "escola"
-- de destino poderia inflar `declared_sale_cents` e desviar repasse para si. Papelaria `suspended` não confirma
-- nada. Lead demo ou papelaria demo: registra o sale_payment (para o funil de demonstração), mas SEM efeito
-- financeiro (nenhum lançamento no razão) — mesmo padrão de billing_charge_lead_delivery (S21) para lead demo em
-- papelaria real.
-- ---------------------------------------------------------------------------
create function public.payout_confirm_sale(p_actor_id uuid, p_actor_role text, p_lead_id uuid, p_school_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.leads%rowtype;
  v_existing uuid;
  v_commission_bps integer;
  v_sale_id uuid;
  v_commission_cents integer;
  v_school_cfg public.school_payout_settings%rowtype;
  v_repasse_cents integer;
  v_sub text := public.payout_jwt_sub();
  v_stationery_status public.stationery_status;
begin
  if p_actor_role is null or p_actor_role not in ('stationery_member', 'admin', 'system') then
    raise exception 'ator inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  if p_actor_role in ('stationery_member', 'admin') then
    if p_actor_id is null then
      raise exception 'ator ausente' using errcode = '42501', hint = 'forbidden';
    end if;
    if v_sub is not null and v_sub is distinct from p_actor_id::text then
      raise exception 'ator diferente do usuário autenticado' using errcode = '42501', hint = 'forbidden';
    end if;
  else
    -- revisão de segurança: 'system' nunca vem com um p_actor_id — isso é código de servidor decidindo por si,
    -- não uma sessão de usuário; aceitar qualquer uuid aqui (sem checagem nenhuma) deixaria QUALQUER ator passar
    -- por 'system' sem verificação, só forjando o parâmetro (a função só é chamável por service_role, mas o
    -- próprio código de servidor precisa da garantia de que 'system' não carrega identidade de ninguém).
    if p_actor_id is not null then
      raise exception 'ator system não deve ter id' using errcode = '22023', hint = 'invalid_input';
    end if;
  end if;

  -- serializa por lead: duas confirmações concorrentes da mesma venda não competem por um `unique(lead_id)` que uma
  -- delas perderia com erro feio (23505); a 2ª espera a 1ª confirmar e devolve o mesmo id (idempotência real).
  perform pg_advisory_xact_lock(hashtextextended('payout_confirm_sale:' || p_lead_id::text, 0));

  select * into l from public.leads where id = p_lead_id for share;
  if not found then
    raise exception 'lead não encontrado' using errcode = 'P0002', hint = 'not_found';
  end if;
  if p_actor_role = 'stationery_member' then
    if not exists (select 1 from public.stationery_members m where m.stationery_id = l.stationery_id and m.profile_id = p_actor_id) then
      raise exception 'ator não é membro da papelaria do lead' using errcode = '42501', hint = 'forbidden';
    end if;
  elsif p_actor_role = 'admin' then
    perform public.payout_check_admin(p_actor_id);
  end if;
  select status into v_stationery_status from public.stationeries where id = l.stationery_id;
  if v_stationery_status = 'suspended' then
    raise exception 'papelaria suspensa' using errcode = '23514', hint = 'stationery_unavailable';
  end if;
  if l.status <> 'converted' or l.declared_sale_cents is null then
    raise exception 'lead sem venda declarada' using errcode = '23514', hint = 'invalid_state';
  end if;

  -- idempotência: já confirmado -> devolve o mesmo id, sem gerar lançamento novo.
  select id into v_existing from public.sale_payments where lead_id = p_lead_id;
  if found then
    return v_existing;
  end if;

  select commission_bps into v_commission_bps from public.payout_settings where status = 'active';
  if v_commission_bps is null then
    raise exception 'comissão ainda não configurada' using errcode = '23514', hint = 'payout_unavailable';
  end if;

  if p_school_id is not null then
    select * into v_school_cfg from public.school_payout_settings where school_id = p_school_id and status = 'active';
  end if;

  insert into public.sale_payments (lead_id, stationery_id, school_id, amount_cents, commission_bps_snapshot, is_demo, confirmed_by, confirmed_role)
  values (p_lead_id, l.stationery_id, p_school_id, l.declared_sale_cents, v_commission_bps, l.is_demo, p_actor_id, p_actor_role)
  returning id into v_sale_id;

  if l.is_demo then
    return v_sale_id; -- venda de demonstração: sem efeito no razão (mesmo padrão de billing_charge_lead_delivery).
  end if;

  v_commission_cents := (l.declared_sale_cents * v_commission_bps) / 10000;
  if v_commission_cents > 0 then
    insert into public.payout_ledger (sale_payment_id, entry_type, beneficiary_type, amount_cents, actor_id, actor_role)
    values (v_sale_id, 'commission', 'platform', v_commission_cents, p_actor_id, p_actor_role);
  end if;

  -- revisão de segurança: repasse só quando quem confirma é admin/system (nunca a própria papelaria) — ver
  -- comentário do cabeçalho da função.
  if p_actor_role in ('admin', 'system') and v_school_cfg.id is not null and v_school_cfg.target in ('school', 'apm') then
    -- defesa em profundidade: nunca repassa mais do que a própria comissão apurada (mesmo se a config de escola
    -- tiver sido publicada sob uma comissão vigente maior, depois reduzida).
    v_repasse_cents := least((l.declared_sale_cents * v_school_cfg.payout_bps) / 10000, v_commission_cents);
    if v_repasse_cents > 0 then
      insert into public.payout_ledger (sale_payment_id, entry_type, beneficiary_type, beneficiary_id, amount_cents, actor_id, actor_role)
      values (v_sale_id, 'repasse_due', v_school_cfg.target, p_school_id, v_repasse_cents, p_actor_id, p_actor_role);
    end if;
  end if;

  return v_sale_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- payout_admin_validate_sale: correção funcional (revisão de segurança, rodada 2) do "repasse perdido" — se a
-- papelaria confirma em Pap03 ANTES do admin, `payout_confirm_sale` já é idempotente (devolve o `sale_payments.id`
-- existente sem tocar em nada), então uma segunda chamada do admin não gerava repasse nem contava o sinal Pix. Este
-- é o ÚNICO caminho de "promoção": entrada única do admin em Admin13, tanto para uma venda AINDA não confirmada por
-- ninguém (delega para `payout_confirm_sale` como 'admin', comportamento idêntico ao de antes) quanto para uma
-- venda JÁ confirmada só pela papelaria (valida a escola/repasse sem duplicar a comissão já apurada na confirmação
-- original). Idempotente por venda (`sale_payment_admin_validations.sale_payment_id` é `unique`): validar duas
-- vezes devolve o mesmo id, sem inserir um segundo `repasse_due`.
-- ---------------------------------------------------------------------------
create function public.payout_admin_validate_sale(p_actor_id uuid, p_lead_id uuid, p_school_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sale_payments%rowtype;
  v_commission_cents integer;
  v_school_cfg public.school_payout_settings%rowtype;
  v_repasse_cents integer;
  v_already_validated uuid;
begin
  perform public.payout_check_admin(p_actor_id);

  -- mesma trava do payout_confirm_sale (mesma chave): serializa confirmação/validação concorrente do mesmo lead.
  perform pg_advisory_xact_lock(hashtextextended('payout_confirm_sale:' || p_lead_id::text, 0));

  select * into v_sale from public.sale_payments where lead_id = p_lead_id for update;
  if not found then
    -- ninguém confirmou ainda: o admin está confirmando do zero, caminho idêntico ao de sempre.
    return public.payout_confirm_sale(p_actor_id, 'admin', p_lead_id, p_school_id);
  end if;

  if v_sale.is_demo or v_sale.confirmed_role in ('admin', 'system') then
    return v_sale.id; -- já processada por completo: demo não tem lançamento; admin/system já geraram tudo na confirmação.
  end if;

  -- idempotência: já validada por um admin antes -> devolve o mesmo id, sem reprocessar nem duplicar repasse_due.
  select id into v_already_validated from public.sale_payment_admin_validations where sale_payment_id = v_sale.id;
  if found then
    return v_sale.id;
  end if;

  if p_school_id is not null then
    select coalesce(sum(amount_cents), 0) into v_commission_cents from public.payout_ledger
     where sale_payment_id = v_sale.id and entry_type = 'commission';
    select * into v_school_cfg from public.school_payout_settings where school_id = p_school_id and status = 'active';
    if v_school_cfg.id is not null and v_school_cfg.target in ('school', 'apm') then
      -- mesma defesa em profundidade de payout_confirm_sale: nunca repassa mais do que a comissão JÁ apurada
      -- na confirmação original (não recalcula pela comissão vigente hoje, que pode ter mudado desde então).
      v_repasse_cents := least((v_sale.amount_cents * v_school_cfg.payout_bps) / 10000, v_commission_cents);
      if v_repasse_cents > 0 then
        insert into public.payout_ledger (sale_payment_id, entry_type, beneficiary_type, beneficiary_id, amount_cents, actor_id, actor_role)
        values (v_sale.id, 'repasse_due', v_school_cfg.target, p_school_id, v_repasse_cents, p_actor_id, 'admin');
      end if;
    end if;
  end if;

  insert into public.sale_payment_admin_validations (sale_payment_id, school_id, validated_by)
  values (v_sale.id, p_school_id, p_actor_id);

  return v_sale.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- payout_reverse_entry: lançamento compensatório de um `commission`/`repasse_due` (venda cancelada depois de
-- confirmada, ou repasse indevido). Admin only, append-only, idempotente (mesmo padrão de billing_reverse_entry,
-- S21): uma 2ª chamada com o mesmo `p_entry_id` devolve o estorno já existente, nunca duplica.
-- ---------------------------------------------------------------------------
create function public.payout_reverse_entry(p_entry_id uuid, p_actor_id uuid, p_reason text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.payout_ledger%rowtype;
  v_existing uuid;
  v_new_type text;
  v_id uuid;
begin
  perform public.payout_check_admin(p_actor_id);

  select * into v_entry from public.payout_ledger where id = p_entry_id for update;
  if not found then
    raise exception 'lançamento não encontrado' using errcode = 'P0002', hint = 'not_found';
  end if;
  if v_entry.entry_type not in ('commission', 'repasse_due') then
    raise exception 'lançamento não pode ser estornado' using errcode = '22023', hint = 'invalid_input';
  end if;

  select id into v_existing from public.payout_ledger where reverses_entry_id = p_entry_id;
  if found then
    return v_existing; -- idempotente: já estornado.
  end if;

  -- correção funcional (revisão de segurança, rodada 2): um `repasse_due` que JÁ entrou num lote (pendente OU
  -- executado) nunca é estornado em silêncio. `payout_batch_create` soma TUDO que existir para a escola/APM até o
  -- momento em que o lote é criado, num único `repasse_settled` (lançamento de LOTE, sem ligação por linha a cada
  -- `repasse_due` que ele cobriu); inserir um `repasse_reversed` depois disso não corrige o lote (`payout_batches.
  -- total_cents` é imutável) — só desconta o total FUTURO, podendo até deixá-lo negativo (`payout_batch_create`
  -- bloqueia lotes novos com `nothing_due`, mas o "Repasse pendente" da tela ficaria incoerente até compensar
  -- sozinho com repasses novos). Vale mesmo para lote ainda `pending` (não só `executed`): mesmo sem dinheiro
  -- movido ainda, o valor do lote já foi decidido e mostrado ao admin como instrução a executar. Comissão nunca cai
  -- aqui (não tem lote — só o admin cobra a papelaria manualmente, D-122), só `repasse_due`.
  if v_entry.entry_type = 'repasse_due' and exists (
    select 1 from public.payout_ledger s
     where s.entry_type = 'repasse_settled'
       and s.beneficiary_type = v_entry.beneficiary_type
       and s.beneficiary_id = v_entry.beneficiary_id
       and s.created_at > v_entry.created_at
  ) then
    raise exception 'repasse já incluído num lote; correção manual fora do sistema' using errcode = '23514', hint = 'already_settled';
  end if;

  v_new_type := case when v_entry.entry_type = 'commission' then 'commission_reversed' else 'repasse_reversed' end;

  insert into public.payout_ledger (sale_payment_id, entry_type, beneficiary_type, beneficiary_id, amount_cents, actor_id, actor_role, reason, reverses_entry_id)
  values (
    v_entry.sale_payment_id, v_new_type, v_entry.beneficiary_type, v_entry.beneficiary_id, -v_entry.amount_cents,
    p_actor_id, 'admin', nullif(btrim(coalesce(p_reason, '')), ''), p_entry_id
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- payout_batch_create / payout_batch_mark_executed: "lote de pagamento" (Admin13). Soma o pendente
-- (due - settled - reversed) da escola/APM; nada pendente -> nothing_due. Executar é uma transição idempotente.
-- ---------------------------------------------------------------------------
create function public.payout_batch_create(p_actor_id uuid, p_school_id uuid, p_beneficiary_type text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending integer;
  v_batch_id uuid;
begin
  perform public.payout_check_admin(p_actor_id);
  if p_beneficiary_type is null or p_beneficiary_type not in ('school', 'apm') then
    raise exception 'alvo inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  if p_school_id is null or not exists (select 1 from public.schools where id = p_school_id) then
    raise exception 'escola não encontrada' using errcode = 'P0002', hint = 'not_found';
  end if;

  perform 1 from public.payout_ledger
   where beneficiary_type = p_beneficiary_type and beneficiary_id = p_school_id
   for update;

  select coalesce(sum(amount_cents), 0) into v_pending from public.payout_ledger
   where beneficiary_type = p_beneficiary_type and beneficiary_id = p_school_id
     and entry_type in ('repasse_due', 'repasse_settled', 'repasse_reversed');
  if v_pending <= 0 then
    raise exception 'nada pendente de repasse' using errcode = '23514', hint = 'nothing_due';
  end if;

  insert into public.payout_batches (beneficiary_type, school_id, total_cents, created_by)
  values (p_beneficiary_type, p_school_id, v_pending, p_actor_id)
  returning id into v_batch_id;

  insert into public.payout_ledger (entry_type, beneficiary_type, beneficiary_id, amount_cents, batch_id, actor_id, actor_role)
  values ('repasse_settled', p_beneficiary_type, p_school_id, -v_pending, v_batch_id, p_actor_id, 'admin');

  return v_batch_id;
end;
$$;

create function public.payout_batch_mark_executed(p_actor_id uuid, p_batch_id uuid) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  perform public.payout_check_admin(p_actor_id);
  select status into v_status from public.payout_batches where id = p_batch_id for update;
  if not found then
    raise exception 'lote não encontrado' using errcode = 'P0002', hint = 'not_found';
  end if;
  if v_status = 'executed' then
    return p_batch_id; -- idempotente
  end if;
  update public.payout_batches set status = 'executed', executed_by = p_actor_id, executed_at = now() where id = p_batch_id;
  return p_batch_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- billing_flag_late_payment / billing_resolve_payment_alert (D-101, S21). `billing_flag_late_payment` não tem
-- ator humano (é o webhook/cron do sistema detectando algo) — em vez de aceitar QUALQUER chamada silenciosamente,
-- exige que o chamador se autoidentifique como 'system' (`p_actor_role`), mesmo padrão de checagem de papel das
-- outras funções de escrita desta trilha; EXECUTE continua restrito a service_role (só código de servidor chama).
-- `billing_resolve_payment_alert` já confere admin via `payout_check_admin` (que agora também confere o `sub` do
-- JWT, revisão de segurança desta rodada).
-- ---------------------------------------------------------------------------
create function public.billing_flag_late_payment(p_invoice_id uuid, p_provider text, p_provider_charge_id text, p_amount_cents integer, p_actor_role text default 'system')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status text;
begin
  if p_actor_role is distinct from 'system' then
    raise exception 'ator inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  select status into v_status from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'fatura não encontrada' using errcode = 'P0002', hint = 'not_found';
  end if;
  if v_status = 'open' then
    raise exception 'fatura ainda está aberta' using errcode = '22023', hint = 'invalid_input';
  end if;
  insert into public.billing_payment_alerts (invoice_id, provider, provider_charge_id, amount_cents, invoice_status_at_detection)
  values (p_invoice_id, p_provider, p_provider_charge_id, p_amount_cents, v_status)
  on conflict (invoice_id, provider, provider_charge_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.billing_payment_alerts where invoice_id = p_invoice_id and provider = p_provider and provider_charge_id = p_provider_charge_id;
  end if;
  return v_id;
end;
$$;

create function public.billing_resolve_payment_alert(p_actor_id uuid, p_alert_id uuid, p_note text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resolved timestamptz;
begin
  perform public.payout_check_admin(p_actor_id);
  select resolved_at into v_resolved from public.billing_payment_alerts where id = p_alert_id for update;
  if not found then
    raise exception 'alerta não encontrado' using errcode = 'P0002', hint = 'not_found';
  end if;
  if v_resolved is not null then
    return p_alert_id; -- idempotente: já resolvido, não regrava a nota
  end if;
  update public.billing_payment_alerts
     set resolved_at = now(), resolved_by = p_actor_id, resolution_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_alert_id;
  return p_alert_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- D-105 (S22): pix_confirmed real via sale_payments, em vez de `false` fixo.
-- ---------------------------------------------------------------------------
create or replace function public.lead_conversion_signals(p_lead_id uuid)
returns table (stationery_confirmed boolean, parent_confirmed boolean, pix_confirmed boolean, signal_count integer, confirmed boolean)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_status public.lead_status;
begin
  select status into v_status from public.leads where id = p_lead_id;
  if not found then
    raise exception 'lead não encontrado' using errcode = 'P0002', hint = 'not_found';
  end if;
  stationery_confirmed := v_status = 'converted';
  parent_confirmed := exists (
    select 1 from public.lead_purchase_confirmations c where c.lead_id = p_lead_id and c.answer = 'bought_here'
  );
  -- S23: sinal real (public.sale_payments), não mais sempre `false` (D-105). Revisão de segurança: só conta quando
  -- CONFIRMADO por admin/system — a declaração da própria papelaria (`confirmed_role = 'stationery_member'`)
  -- nunca basta sozinha para este sinal, senão a papelaria fabricaria o 3º sinal da regra de 2 de 3 sozinha.
  -- Revisão de segurança (rodada 2, "repasse perdido"): uma venda confirmada só pela papelaria e depois VALIDADA
  -- pelo admin (`payout_admin_validate_sale`, `sale_payment_admin_validations`) também soma o sinal — a validação do
  -- admin é a mesma verificação externa que uma confirmação direta dele já daria.
  pix_confirmed := exists (
    select 1 from public.sale_payments sp where sp.lead_id = p_lead_id and sp.confirmed_role in ('admin', 'system')
  ) or exists (
    select 1 from public.sale_payments sp
      join public.sale_payment_admin_validations v on v.sale_payment_id = sp.id
     where sp.lead_id = p_lead_id
  );
  signal_count := (case when stationery_confirmed then 1 else 0 end)
                + (case when parent_confirmed then 1 else 0 end)
                + (case when pix_confirmed then 1 else 0 end);
  confirmed := signal_count >= 2;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- D-108/D-110/D-111 (S22, 0402 já no staging): correções aditivas via revoke/create or replace.
-- ---------------------------------------------------------------------------
-- D-108: `authenticated` não deve ler `lead_id` de QUALQUER avaliação publicada (a política pública
-- `lead_reviews_select_published` vale para `anon, authenticated` sem checar vínculo — o grant de coluna era o
-- único filtro, e estava largo demais). Papelaria/admin continuam identificando o lead por outros caminhos
-- (Admin11/Admin12 já leem via service_role, sem depender deste grant).
revoke select (lead_id) on public.lead_reviews from authenticated;

-- D-110/D-111: `lead_review_hide` ganha (a) hint dedicado para p_reason nulo (hoje cai num erro de CHECK cru) e
-- (b) checagem do `sub` do JWT contra o ator, como as demais funções de escrita desta trilha.
create or replace function public.lead_review_hide(p_review_id uuid, p_actor_id uuid, p_reason text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
  v_status text;
  v_sub text := public.conversion_jwt_sub();
begin
  if p_actor_id is null then
    raise exception 'ator ausente' using errcode = '42501', hint = 'forbidden';
  end if;
  if v_sub is not null and v_sub is distinct from p_actor_id::text then
    raise exception 'ator diferente do usuário autenticado' using errcode = '42501', hint = 'forbidden';
  end if;
  select role into v_role from public.profiles where id = p_actor_id;
  if v_role is distinct from 'admin' then
    raise exception 'ator não é admin' using errcode = '42501', hint = 'forbidden';
  end if;
  if p_reason is null or p_reason not in ('personal_data', 'offensive', 'policy_violation', 'other') then
    raise exception 'motivo inválido' using errcode = '22023', hint = 'invalid_input';
  end if;

  select status into v_status from public.lead_reviews where id = p_review_id for update;
  if not found then
    raise exception 'avaliação não encontrada' using errcode = 'P0002', hint = 'not_found';
  end if;
  if v_status = 'hidden' then
    return p_review_id; -- idempotente: já oculta.
  end if;

  update public.lead_reviews
     set status = 'hidden', hidden_at = now(), hidden_by = p_actor_id, hidden_reason = p_reason
   where id = p_review_id;
  return p_review_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Inadimplência (S23): pausa a entrega de lead (billing_charge_lead_delivery) e esconde a papelaria da listagem
-- de candidatas (billing_can_receive_lead) quando `payout_delinquency_status = 'pausado'`. `create or replace`
-- preserva 100% do comportamento de saldo já existente (0401); só ACRESCENTA a checagem de atraso.
-- ---------------------------------------------------------------------------
create or replace function public.billing_can_receive_lead(p_stationery_ids uuid[], p_item_count integer)
returns table (stationery_id uuid, can_receive boolean)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  return query
    select s.id, coalesce(e.ok, false) and d.status <> 'pausado'
      from public.stationeries s
      cross join lateral public.billing_eval_source(s.id, p_item_count, false) e
      cross join lateral public.payout_delinquency_status(s.id) d
     where s.id = any (p_stationery_ids);
end;
$$;

create or replace function public.billing_charge_lead_delivery() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_stationery_is_demo boolean;
  v_wallet_id uuid;
  v_eval record;
  v_delinquency record;
begin
  select s.is_demo into v_stationery_is_demo from public.stationeries s where s.id = new.stationery_id;
  if new.is_demo and not v_stationery_is_demo then
    return null;
  end if;
  -- S23: papelaria pausada por inadimplência (régua sobre invoices, S21) não recebe lead novo, mesmo com saldo.
  select * into v_delinquency from public.payout_delinquency_status(new.stationery_id);
  if v_delinquency.status = 'pausado' then
    raise exception 'papelaria pausada por inadimplência' using errcode = 'P0001', hint = 'delinquency_blocked';
  end if;
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

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Bloqueante (revisão de segurança): toda função nova ganha o `revoke` explícito ANTES do `grant` (mesmo padrão de
-- 0401/0402) — sem o `revoke`, PUBLIC (logo anon/authenticated) herda EXECUTE por padrão de criação da função no
-- Postgres; faltou aqui na primeira versão desta migration para 8 funções SECURITY DEFINER e 5 funções de gatilho,
-- confirmado com `has_function_privilege` no banco local (log do vermelho desta rodada).
revoke execute on function public.payout_jwt_sub() from public, anon, authenticated, service_role;
revoke execute on function public.payout_check_admin(uuid) from public, anon, authenticated, service_role;
-- (não totalmente revogada como payout_jwt_sub/payout_check_admin: é leitura pura, sem dado sensível, usada
-- diretamente pelo admin/testes, igual ao padrão de billing_wallet_summary_readonly)
revoke execute on function public.payout_delinquency_status(uuid, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.payout_delinquency_status(uuid, timestamptz) to service_role;

-- Funções de gatilho: nunca chamáveis por ninguém via RPC (só o mecanismo de trigger as invoca), mesmo padrão de
-- billing_rows_block_mutation/billing_plan_guard (0401) e audit_row_change (0001).
revoke execute on function public.payout_ledger_no_truncate() from public, anon, authenticated, service_role;
revoke execute on function public.payout_settings_guard() from public, anon, authenticated, service_role;
revoke execute on function public.school_payout_settings_guard() from public, anon, authenticated, service_role;
revoke execute on function public.payout_batches_guard() from public, anon, authenticated, service_role;
revoke execute on function public.billing_payment_alerts_guard() from public, anon, authenticated, service_role;

revoke execute on function public.payout_admin_delinquency_list(uuid) from public, anon, authenticated, service_role;
grant execute on function public.payout_admin_delinquency_list(uuid) to service_role;
revoke execute on function public.payout_settings_publish(uuid, integer, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.payout_settings_publish(uuid, integer, integer, integer) to service_role;
revoke execute on function public.payout_school_config_publish(uuid, uuid, text, integer, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.payout_school_config_publish(uuid, uuid, text, integer, text, text, text) to service_role;
revoke execute on function public.payout_confirm_sale(uuid, text, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.payout_confirm_sale(uuid, text, uuid, uuid) to service_role;
revoke execute on function public.payout_admin_validate_sale(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.payout_admin_validate_sale(uuid, uuid, uuid) to service_role;
revoke execute on function public.payout_reverse_entry(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.payout_reverse_entry(uuid, uuid, text) to service_role;
revoke execute on function public.payout_batch_create(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.payout_batch_create(uuid, uuid, text) to service_role;
revoke execute on function public.payout_batch_mark_executed(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.payout_batch_mark_executed(uuid, uuid) to service_role;
revoke execute on function public.billing_flag_late_payment(uuid, text, text, integer, text) from public, anon, authenticated, service_role;
grant execute on function public.billing_flag_late_payment(uuid, text, text, integer, text) to service_role;
revoke execute on function public.billing_resolve_payment_alert(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.billing_resolve_payment_alert(uuid, uuid, text) to service_role;

revoke all on public.payout_settings, public.school_payout_settings, public.sale_payments, public.payout_batches,
  public.payout_ledger, public.billing_payment_alerts, public.sale_payment_admin_validations
  from public, anon, authenticated, service_role;

-- Leitura direta só para service_role (telas Admin13/Admin14/Pap07 usam o cliente de serviço com checagem de papel
-- em app, mesmo padrão de invoice_charges/plan_price_tiers na S21) — nenhuma política de RLS para authenticated:
-- a chave Pix da escola/APM (coluna sensível) nunca sai por um grant amplo demais (lição do D-108).
grant select on public.payout_settings to service_role;
grant select on public.school_payout_settings to service_role;
grant select on public.sale_payments to service_role;
grant select on public.payout_batches to service_role;
grant select on public.payout_ledger to service_role;
grant select on public.billing_payment_alerts to service_role;
grant select on public.sale_payment_admin_validations to service_role;

-- ---------------------------------------------------------------------------
-- RLS (habilitada, sem política para anon/authenticated: nega por padrão; service_role lê pelos grants acima)
-- ---------------------------------------------------------------------------
alter table public.payout_settings enable row level security;
alter table public.school_payout_settings enable row level security;
alter table public.sale_payments enable row level security;
alter table public.payout_batches enable row level security;
alter table public.payout_ledger enable row level security;
alter table public.billing_payment_alerts enable row level security;
alter table public.sale_payment_admin_validations enable row level security;
