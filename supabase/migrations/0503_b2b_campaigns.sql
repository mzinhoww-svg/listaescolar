-- 0503_b2b_campaigns: campanhas de marca (CPM/CPC), insights agregados com k-anonimato e faturamento B2B (extrato)
-- (S26, trilha B2B, faixa 05xx). Depende de 0501 (b2b_partners, b2b_usage_daily) e de 0103 (school_lists,
-- list_versions, list_items, grades) e 0101 (schools, municipalities). Regras duras:
-- * bid/orçamento é DECLARADO PELO PRÓPRIO parceiro (não um preço de tabela da plataforma) — nunca dinheiro real:
--   é só acúmulo informativo (livro-razão) que alimenta o extrato; nenhuma função debita saldo ou chama gateway;
-- * uma campanha NUNCA serve nem gera evento numa lista cuja categoria alvo tem item com alerta
--   `restrictive_brand_or_spec` (Lei 12.886/Procon): a elegibilidade (Procon, is_demo, segmentação, orçamento) é
--   decidida numa ÚNICA função, `b2b_campaign_eligible`, chamada por `b2b_campaign_serve` (o que aparece) E por
--   `b2b_campaign_record_event` (o que pode virar evento/acúmulo) — nunca reimplementada nos dois lugares;
-- * toda campanha exige aprovação do admin (`pending_review` -> `approved`/`rejected`) antes de poder servir;
-- * `is_demo` da campanha é fixado na criação a partir do status do parceiro (sandbox = demo; active = real) e
--   `b2b_campaign_eligible` só casa campanha e lista com o MESMO `is_demo`;
-- * eventos e livro-razão são imutáveis (append-only); a contagem agregada crua de insights só existe numa função
--   `service_role`-only (sem k-anonimato embutido: a supressão é do domínio TypeScript, testada por unidade);
-- * toda escrita passa por função SECURITY DEFINER (inclusive gatilhos), `search_path = ''`, sem EXECUTE para
--   public/anon/authenticated (e sem para service_role nos gatilhos, que não precisam de grant para disparar).

create type public.b2b_campaign_pricing_model as enum ('cpm', 'cpc');
create type public.b2b_campaign_status as enum ('draft', 'pending_review', 'approved', 'rejected', 'paused', 'completed');
create type public.b2b_campaign_event_type as enum ('impression', 'click');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.b2b_campaigns (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.b2b_partners (id) on delete restrict,
  name text not null check (btrim(name) <> '' and length(name) <= 120),
  product_label text not null check (btrim(product_label) <> '' and length(product_label) <= 200), -- nome do produto sugerido; nunca preço/estoque
  creative_text text check (creative_text is null or length(creative_text) <= 280),
  pricing_model public.b2b_campaign_pricing_model not null,
  bid_cents integer not null check (bid_cents > 0 and bid_cents <= 100000000), -- declarado pelo parceiro: CPM = por mil impressões; CPC = por clique
  daily_budget_cents integer check (daily_budget_cents is null or daily_budget_cents > 0),
  total_budget_cents integer not null check (total_budget_cents > 0),
  -- numeric(14,3): milésimos de centavo, para o CPM (bid/1000 por impressão) acumular EXATO, sem arredondar a
  -- cada evento (revisão de segurança independente); só acúmulo informativo (gatilho), nunca dinheiro real.
  accrued_total_cents numeric(14, 3) not null default 0 check (accrued_total_cents >= 0),
  target_category text not null check (btrim(target_category) <> '' and length(target_category) <= 100), -- mesma taxonomia livre de list_items.category
  target_grade_stages public.grade_stage[] check (target_grade_stages is null or (cardinality(target_grade_stages) between 1 and 3)),
  target_cities text[] check (target_cities is null or (cardinality(target_cities) between 1 and 200)), -- ibge_code; null = nacional
  status public.b2b_campaign_status not null default 'draft',
  status_reason text check (status_reason is null or length(status_reason) <= 500),
  -- quem/o que pausou (revisão de segurança independente): 'admin' só o admin retoma; 'owner'/'budget_auto' o
  -- dono também retoma. Só preenchido enquanto status = 'paused'; limpo em qualquer outra transição.
  pause_origin text check (pause_origin is null or pause_origin in ('owner', 'admin', 'budget_auto')),
  decided_by uuid, -- sem FK: histórico sobrevive à exclusão de conta
  decided_at timestamptz,
  is_demo boolean not null default false, -- fixado na criação a partir do status do parceiro
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint b2b_campaigns_budget_order check (daily_budget_cents is null or daily_budget_cents <= total_budget_cents),
  constraint b2b_campaigns_pause_origin_pair check ((status = 'paused') = (pause_origin is not null))
);
create index b2b_campaigns_partner_idx on public.b2b_campaigns (partner_id, status);
create index b2b_campaigns_serve_idx on public.b2b_campaigns (status, is_demo, target_category);

create table public.b2b_campaign_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.b2b_campaigns (id) on delete restrict,
  event_type public.b2b_campaign_event_type not null,
  -- not null: b2b_campaign_record_event revalida a MESMA elegibilidade de b2b_campaign_serve para esta lista
  -- (revisão de segurança independente); sem lista não há como revalidar nada.
  list_version_id uuid not null references public.list_versions (id) on delete restrict,
  day date not null default ((now() at time zone 'America/Cuiaba')::date),
  dedupe_key text not null check (dedupe_key ~ '^[0-9a-f]{16,128}$'), -- hash anônimo fornecido pelo chamador; nunca dado bruto
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint b2b_campaign_events_dedupe_key unique (campaign_id, event_type, day, dedupe_key)
);
create index b2b_campaign_events_campaign_day_idx on public.b2b_campaign_events (campaign_id, day);

create table public.b2b_campaign_ledger (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.b2b_campaigns (id) on delete restrict,
  event_id uuid references public.b2b_campaign_events (id) on delete restrict,
  entry_type text not null check (entry_type in ('impression_accrual', 'click_accrual', 'budget_paused')),
  day date not null,
  amount_cents numeric(14, 3) not null check (amount_cents >= 0), -- milésimos de centavo (CPM exato, sem arredondar por evento)
  balance_after_cents numeric(14, 3) not null check (balance_after_cents >= 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index b2b_campaign_ledger_campaign_idx on public.b2b_campaign_ledger (campaign_id, day);

create table public.b2b_insights_settings (
  id uuid primary key default gen_random_uuid(),
  min_k integer not null default 5 check (min_k >= 2 and min_k <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- singleton: só uma linha de configuração vale no sistema inteiro.
create unique index b2b_insights_settings_singleton_idx on public.b2b_insights_settings ((true));
insert into public.b2b_insights_settings default values;

create table public.b2b_statements (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.b2b_partners (id) on delete restrict,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  generated_by uuid, -- sem FK: histórico sobrevive à exclusão de conta
  payment_instruction text check (payment_instruction is null or length(payment_instruction) <= 1000), -- texto livre p/ o admin agir manualmente; nunca cobrança automática
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint b2b_statements_period_key unique (partner_id, period_start, period_end)
);

create table public.b2b_statement_line_items (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.b2b_statements (id) on delete restrict,
  source text not null check (source in ('api_usage', 'campaign_cpm', 'campaign_cpc')),
  campaign_id uuid references public.b2b_campaigns (id) on delete restrict,
  label text not null check (btrim(label) <> '' and length(label) <= 200),
  quantity numeric(14, 2) not null check (quantity >= 0),
  unit text not null check (btrim(unit) <> '' and length(unit) <= 20),
  unit_price_cents integer check (unit_price_cents is null or unit_price_cents >= 0), -- null = sem preço (nunca inventado); bid do parceiro, sempre inteiro
  amount_cents numeric(14, 3) check (amount_cents is null or amount_cents >= 0), -- soma exata do livro-razão (milésimos de centavo no CPM); ver invariante quantidade × bid / 1000 (CPM) ou × bid (CPC)
  pricing_status text not null check (pricing_status in ('priced', 'unavailable')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint b2b_statement_line_items_priced_pair check ((pricing_status = 'priced') = (unit_price_cents is not null and amount_cents is not null))
);
create index b2b_statement_line_items_statement_idx on public.b2b_statement_line_items (statement_id);

-- ---------------------------------------------------------------------------
-- Gatilhos de guarda (imutabilidade) — vale para todos, inclusive postgres.
-- ---------------------------------------------------------------------------
create function public.b2b_campaign_events_block_mutation() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'b2b_campaign_events é imutável (% bloqueado)', tg_op using errcode = '42501';
end;
$$;

create function public.b2b_campaign_ledger_block_mutation() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'b2b_campaign_ledger é imutável (% bloqueado)', tg_op using errcode = '42501';
end;
$$;

create function public.b2b_statements_block_mutation() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'b2b_statements é imutável (% bloqueado)', tg_op using errcode = '42501';
end;
$$;

create function public.b2b_statement_line_items_block_mutation() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'b2b_statement_line_items é imutável (% bloqueado)', tg_op using errcode = '42501';
end;
$$;

-- ---------------------------------------------------------------------------
-- Gatilho de acúmulo: dispara depois de gravar um evento; calcula o valor (CPM/CPC, bid do próprio parceiro),
-- grava no livro-razão e pausa a campanha quando o orçamento (diário ou total) se esgota. Nunca move dinheiro
-- real. CPM acumula EXATO em milésimos de centavo (bid_cents / 1000 por impressão, sem `ceil`/`round`) — arredondar
-- por evento inflava sistematicamente o acumulado (revisão de segurança independente); o arredondamento para
-- exibição em reais só acontece na formatação do extrato (`features/campaigns/statement-service.ts`).
-- ---------------------------------------------------------------------------
create function public.b2b_campaign_event_accrue() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.b2b_campaigns%rowtype;
  v_amount numeric(14, 3) := 0;
  v_new_total numeric(14, 3);
  v_day_accrued numeric(14, 3);
begin
  select * into v_campaign from public.b2b_campaigns where id = new.campaign_id for update;
  if not found then
    raise exception 'campanha não encontrada' using errcode = 'P0002', hint = 'not_found';
  end if;

  if new.event_type = 'impression' and v_campaign.pricing_model = 'cpm' then
    v_amount := v_campaign.bid_cents::numeric / 1000;
  elsif new.event_type = 'click' and v_campaign.pricing_model = 'cpc' then
    v_amount := v_campaign.bid_cents::numeric;
  else
    v_amount := 0; -- impressão sob CPC e clique sob CPM não geram acúmulo
  end if;

  if v_amount > 0 then
    v_new_total := v_campaign.accrued_total_cents + v_amount;
    insert into public.b2b_campaign_ledger (campaign_id, event_id, entry_type, day, amount_cents, balance_after_cents)
    values (new.campaign_id, new.id, case when new.event_type = 'impression' then 'impression_accrual' else 'click_accrual' end,
            new.day, v_amount, v_new_total);
    update public.b2b_campaigns set accrued_total_cents = v_new_total where id = new.campaign_id;

    select coalesce(sum(l.amount_cents), 0) into v_day_accrued
      from public.b2b_campaign_ledger l where l.campaign_id = new.campaign_id and l.day = new.day;

    if v_new_total >= v_campaign.total_budget_cents
       or (v_campaign.daily_budget_cents is not null and v_day_accrued >= v_campaign.daily_budget_cents) then
      update public.b2b_campaigns set status = 'paused', status_reason = 'orçamento esgotado (automático)', pause_origin = 'budget_auto' where id = new.campaign_id and status = 'approved';
      insert into public.b2b_campaign_ledger (campaign_id, event_id, entry_type, day, amount_cents, balance_after_cents)
      values (new.campaign_id, null, 'budget_paused', new.day, 0, v_new_total);
    end if;
  end if;
  return new;
end;
$$;

create function public.b2b_campaigns_set_updated_at() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Criação/ciclo de vida da campanha (dono do parceiro, tipo `brand`).
-- ---------------------------------------------------------------------------
create function public.b2b_campaign_create(p_actor_id uuid, p_partner_id uuid, p_payload jsonb) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub text;
  v_partner public.b2b_partners%rowtype;
  v_name text := nullif(btrim(coalesce(p_payload ->> 'name', '')), '');
  v_product text := nullif(btrim(coalesce(p_payload ->> 'product_label', '')), '');
  v_creative text := p_payload ->> 'creative_text';
  v_model text := p_payload ->> 'pricing_model';
  v_bid integer;
  v_daily integer;
  v_total integer;
  v_category text := nullif(btrim(coalesce(p_payload ->> 'target_category', '')), '');
  v_stages public.grade_stage[];
  v_cities text[];
  v_is_demo boolean;
  v_id uuid;
begin
  begin
    v_sub := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
  exception when others then
    v_sub := null;
  end;
  if v_sub is not null and v_sub is distinct from p_actor_id::text then
    raise exception 'ator diferente do usuário autenticado' using errcode = '42501';
  end if;
  if p_actor_id is null or not exists (
    select 1 from public.b2b_partner_members m where m.partner_id = p_partner_id and m.profile_id = p_actor_id and m.member_role = 'owner'
  ) then
    raise exception 'só o dono do parceiro cria campanha' using errcode = '42501', hint = 'forbidden';
  end if;

  select * into v_partner from public.b2b_partners where id = p_partner_id;
  if not found then
    raise exception 'parceiro não encontrado' using errcode = 'P0002', hint = 'not_found';
  end if;
  if v_partner.partner_type <> 'brand' then
    raise exception 'só parceiro do tipo marca cria campanha' using errcode = '42501', hint = 'forbidden';
  end if;
  if v_partner.status not in ('sandbox', 'active') then
    raise exception 'parceiro precisa estar sandbox ou ativo' using errcode = '42501', hint = 'forbidden';
  end if;

  if v_name is null or length(v_name) > 120 or v_product is null or length(v_product) > 200
     or v_model is null or v_model not in ('cpm', 'cpc') or v_category is null or length(v_category) > 100 then
    raise exception 'dados da campanha inválidos' using errcode = '22023', hint = 'invalid_input';
  end if;
  if v_creative is not null and length(v_creative) > 280 then
    raise exception 'texto do criativo longo demais' using errcode = '22023', hint = 'invalid_input';
  end if;
  begin
    v_bid := (p_payload ->> 'bid_cents')::integer;
    v_daily := case when p_payload ->> 'daily_budget_cents' is null then null else (p_payload ->> 'daily_budget_cents')::integer end;
    v_total := (p_payload ->> 'total_budget_cents')::integer;
  exception when others then
    raise exception 'valores de orçamento inválidos' using errcode = '22023', hint = 'invalid_input';
  end;
  if v_bid is null or v_bid <= 0 or v_bid > 100000000 or v_total is null or v_total <= 0
     or (v_daily is not null and (v_daily <= 0 or v_daily > v_total)) then
    raise exception 'orçamento inválido' using errcode = '22023', hint = 'invalid_input';
  end if;

  if p_payload -> 'target_grade_stages' is not null and jsonb_typeof(p_payload -> 'target_grade_stages') = 'array' then
    select array_agg(distinct x::public.grade_stage) into v_stages from jsonb_array_elements_text(p_payload -> 'target_grade_stages') x;
    if v_stages is not null and cardinality(v_stages) = 0 then v_stages := null; end if;
  end if;
  if p_payload -> 'target_cities' is not null and jsonb_typeof(p_payload -> 'target_cities') = 'array' then
    select array_agg(distinct x) into v_cities from jsonb_array_elements_text(p_payload -> 'target_cities') x;
    if v_cities is not null and cardinality(v_cities) = 0 then
      v_cities := null;
    elsif v_cities is not null and exists (
      select 1 from unnest(v_cities) code where not exists (select 1 from public.municipalities m where m.ibge_code = code)
    ) then
      raise exception 'cidade alvo inválida' using errcode = '22023', hint = 'invalid_input';
    end if;
  end if;

  v_is_demo := v_partner.status = 'sandbox';
  insert into public.b2b_campaigns (
    partner_id, name, product_label, creative_text, pricing_model, bid_cents, daily_budget_cents, total_budget_cents,
    target_category, target_grade_stages, target_cities, is_demo
  ) values (
    p_partner_id, v_name, v_product, v_creative, v_model::public.b2b_campaign_pricing_model, v_bid, v_daily, v_total,
    v_category, v_stages, v_cities, v_is_demo
  ) returning id into v_id;
  return v_id;
end;
$$;

-- Transições do ciclo de vida. p_to: pending_review | approved | rejected | paused | completed.
create function public.b2b_campaign_transition(p_actor_id uuid, p_campaign_id uuid, p_to text, p_reason text) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub text;
  v_campaign public.b2b_campaigns%rowtype;
  v_is_owner boolean;
  v_is_admin boolean;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  begin
    v_sub := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
  exception when others then
    v_sub := null;
  end;
  if v_sub is not null and v_sub is distinct from p_actor_id::text then
    raise exception 'ator diferente do usuário autenticado' using errcode = '42501';
  end if;
  if p_to is null or p_to not in ('pending_review', 'approved', 'rejected', 'paused', 'completed') then
    raise exception 'destino inválido' using errcode = '22023', hint = 'invalid_input';
  end if;

  select * into v_campaign from public.b2b_campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'campanha não encontrada' using errcode = 'P0002', hint = 'not_found';
  end if;

  v_is_owner := p_actor_id is not null and exists (
    select 1 from public.b2b_partner_members m where m.partner_id = v_campaign.partner_id and m.profile_id = p_actor_id and m.member_role = 'owner'
  );
  v_is_admin := p_actor_id is not null and exists (select 1 from public.profiles x where x.id = p_actor_id and x.role = 'admin');
  if not v_is_owner and not v_is_admin then
    raise exception 'campanha não encontrada' using errcode = 'P0002', hint = 'not_found';
  end if;

  -- "só admin decide" vale para a decisão de VERDADE (pending_review -> approved/rejected); retomar uma campanha
  -- já aprovada antes (paused -> approved) é o dono usando o próprio orçamento, não uma nova aprovação — a UI
  -- promete "Retomar" ao dono (B2B06), e o banco precisa permitir exatamente essa transição para ele (revisão de
  -- segurança independente: antes só admin conseguia mover para 'approved', em qualquer origem).
  if p_to = 'rejected' and not v_is_admin then
    raise exception 'só admin decide' using errcode = '42501', hint = 'forbidden';
  end if;
  if p_to = 'approved' and v_campaign.status = 'pending_review' and not v_is_admin then
    raise exception 'só admin decide' using errcode = '42501', hint = 'forbidden';
  end if;
  -- retomar (paused -> approved): pausa do ADMIN só o admin retoma; pausa do dono OU automática por orçamento
  -- (budget_auto) o dono também retoma (revisão de segurança independente, reverificação — antes qualquer pausa
  -- podia ser retomada pelo dono, inclusive uma decisão do admin de pausar a campanha por algum motivo próprio).
  if p_to = 'approved' and v_campaign.status = 'paused' then
    if v_campaign.pause_origin = 'admin' and not v_is_admin then
      raise exception 'só admin retoma uma pausa do admin' using errcode = '42501', hint = 'forbidden';
    end if;
    if not (v_is_owner or v_is_admin) then
      raise exception 'sem permissão' using errcode = '42501', hint = 'forbidden';
    end if;
  end if;
  if p_to = 'pending_review' and not v_is_owner then
    raise exception 'só o dono envia para aprovação' using errcode = '42501', hint = 'forbidden';
  end if;
  if p_to in ('paused', 'completed') and not (v_is_owner or v_is_admin) then
    raise exception 'sem permissão' using errcode = '42501', hint = 'forbidden';
  end if;

  if not ((v_campaign.status, p_to::public.b2b_campaign_status) in (
    ('draft', 'pending_review'),
    ('pending_review', 'approved'), ('pending_review', 'rejected'),
    ('approved', 'paused'), ('approved', 'completed'),
    ('paused', 'approved'), ('paused', 'completed')
  )) then
    raise exception 'transição % -> % não permitida', v_campaign.status, p_to using errcode = '23514', hint = 'transition_not_allowed';
  end if;

  if p_to = 'rejected' and v_reason is null then
    raise exception 'motivo obrigatório para rejeitar' using errcode = '22023', hint = 'invalid_input';
  end if;
  if p_to = 'approved' and v_campaign.status = 'paused' and v_campaign.accrued_total_cents >= v_campaign.total_budget_cents then
    raise exception 'orçamento total esgotado' using errcode = '23514', hint = 'budget_exhausted';
  end if;

  -- decided_by/decided_at registram só a decisão de admin de VERDADE (pending_review -> approved/rejected);
  -- o dono retomando uma campanha pausada (paused -> approved) não reescreve quem decidiu originalmente.
  -- pause_origin: gravado só quando o DESTINO é 'paused' (quem pediu, entre owner/admin — prioriza admin quando
  -- o mesmo ator acumula os dois papéis); limpo em qualquer transição para fora de 'paused'.
  update public.b2b_campaigns
     set status = p_to::public.b2b_campaign_status,
         status_reason = case when p_to in ('rejected', 'paused') then v_reason else null end,
         pause_origin = case when p_to = 'paused' then (case when v_is_admin then 'admin' else 'owner' end) else null end,
         decided_by = case when v_campaign.status = 'pending_review' and p_to in ('approved', 'rejected') then p_actor_id else decided_by end,
         decided_at = case when v_campaign.status = 'pending_review' and p_to in ('approved', 'rejected') then now() else decided_at end
   where id = p_campaign_id;
  return p_to;
end;
$$;

-- ---------------------------------------------------------------------------
-- Contexto da lista (única leitura de list_versions/school_lists/grades/schools/municipalities/list_items usada
-- por TODA decisão de elegibilidade). `found = false` quando a lista não existe ou não está publicada.
-- ---------------------------------------------------------------------------
create function public.b2b_campaign_list_context(p_list_version_id uuid) returns table (
  is_demo boolean, stage public.grade_stage, city_ibge text, blocked_categories text[]
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    select sl.is_demo, g.stage, m.ibge_code,
           coalesce((
             select array_agg(distinct li.category) from public.list_items li
              where li.version_id = p_list_version_id and li.category is not null
                and li.alerts @> '["restrictive_brand_or_spec"]'::jsonb
           ), array[]::text[])
      from public.list_versions lv
      join public.school_lists sl on sl.id = lv.list_id
      join public.grades g on g.id = sl.grade_id
      join public.schools sc on sc.id = sl.school_id
      join public.municipalities m on m.id = sc.municipality_id
     where lv.id = p_list_version_id and lv.status = 'published';
end;
$$;

-- ---------------------------------------------------------------------------
-- Elegibilidade: FONTE ÚNICA usada por `b2b_campaign_serve` (o que aparece) E por `b2b_campaign_record_event`
-- (o que pode gerar evento/acúmulo) — nenhuma outra rotina decide se uma campanha vale para uma lista. Cobre
-- status aprovado, lista publicada de verdade, bloqueio Procon, segmentação (série/cidade), `is_demo`/ambiente e
-- orçamento (total e diário) não esgotado.
-- Custo (revisão de segurança independente, Ruling no ledger): chamada uma vez por campanha candidata em
-- `b2b_campaign_serve` — cada chamada refaz o `select` de `b2b_campaign_list_context` (5 joins). Aceitável na
-- escala do piloto (poucas campanhas aprovadas por categoria); documentado como extensão de D-141 (cota/cache de
-- `b2b_campaign_serve`) em vez de otimizado agora — prioridade foi ter uma única regra, não duplicar a lógica.
-- ---------------------------------------------------------------------------
create function public.b2b_campaign_eligible(p_campaign_id uuid, p_list_version_id uuid) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.b2b_campaigns%rowtype;
  v_ctx record;
  v_today date := (now() at time zone 'America/Cuiaba')::date;
  v_day_accrued numeric(14, 3);
begin
  select * into v_campaign from public.b2b_campaigns where id = p_campaign_id;
  if not found or v_campaign.status <> 'approved' then
    return false;
  end if;

  select * into v_ctx from public.b2b_campaign_list_context(p_list_version_id);
  if not found then
    return false; -- lista não publicada/não encontrada: nada é elegível
  end if;

  if v_ctx.is_demo <> v_campaign.is_demo then
    return false;
  end if;
  if v_campaign.target_category = any (v_ctx.blocked_categories) then
    return false; -- bloqueio Procon (Lei 12.886): marca exigida pela escola nesta categoria, nesta lista
  end if;
  if v_campaign.target_grade_stages is not null and not (v_ctx.stage = any (v_campaign.target_grade_stages)) then
    return false;
  end if;
  if v_campaign.target_cities is not null and not (v_ctx.city_ibge = any (v_campaign.target_cities)) then
    return false;
  end if;
  if v_campaign.accrued_total_cents >= v_campaign.total_budget_cents then
    return false;
  end if;
  if v_campaign.daily_budget_cents is not null then
    select coalesce(sum(l.amount_cents), 0) into v_day_accrued
      from public.b2b_campaign_ledger l where l.campaign_id = p_campaign_id and l.day = v_today;
    if v_day_accrued >= v_campaign.daily_budget_cents then
      return false;
    end if;
  end if;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Serving: só formata o que `b2b_campaign_eligible` decide; nunca reimplementa a regra.
-- ---------------------------------------------------------------------------
create function public.b2b_campaign_serve(p_list_version_id uuid, p_limit integer default 3) returns table (
  campaign_id uuid, partner_id uuid, name text, product_label text, creative_text text,
  pricing_model public.b2b_campaign_pricing_model, sponsored boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit <= 0 or p_limit > 10 then
    p_limit := 3;
  end if;
  if not exists (select 1 from public.list_versions where id = p_list_version_id and status = 'published') then
    return; -- lista não publicada: nenhuma campanha serve (nada a anunciar)
  end if;

  return query
    select c.id, c.partner_id, c.name, c.product_label, c.creative_text, c.pricing_model, true as sponsored
      from public.b2b_campaigns c
     where c.status = 'approved'
       and public.b2b_campaign_eligible(c.id, p_list_version_id)
     order by random()
     limit p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- Registro de evento (impressão/clique). Revalida a MESMA elegibilidade de `b2b_campaign_serve` (nunca aceita
-- evento para uma combinação campanha/lista que não seria servida — revisão de segurança independente: antes só
-- checava o status da campanha). Dedupe por (campanha, tipo, dia, dedupe_key); clique exige impressão prévia no
-- mesmo dia/chave (reduz inflar clique sem exibição). `p_dedupe_key` é só um hash — quem chama (domínio
-- TypeScript) é responsável por derivá-lo de um jeito que o cliente não force sozinho (ver Ruling no ledger).
-- ---------------------------------------------------------------------------
create function public.b2b_campaign_record_event(p_campaign_id uuid, p_list_version_id uuid, p_event_type text, p_dedupe_key text) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'America/Cuiaba')::date;
  v_id uuid;
begin
  if p_list_version_id is null then
    raise exception 'lista obrigatória' using errcode = '22023', hint = 'invalid_input';
  end if;
  if p_event_type is null or p_event_type not in ('impression', 'click') then
    raise exception 'tipo de evento inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  if p_dedupe_key is null or p_dedupe_key !~ '^[0-9a-f]{16,128}$' then
    raise exception 'dedupe_key inválido' using errcode = '22023', hint = 'invalid_input';
  end if;

  -- trava a campanha ANTES de checar elegibilidade (que inclui orçamento): sem isto, duas chamadas concorrentes
  -- perto do teto do orçamento podiam as duas passar pela checagem e as duas inserir, estourando o orçamento por
  -- mais de um evento (revisão de segurança independente). A trava aqui é barata: `record_event` já é caminho de
  -- ESCRITA (o gatilho de acúmulo já toma a mesma trava mais adiante, na mesma transação); nunca colocar em
  -- `b2b_campaign_eligible`, que também é lida por `serve` em volume bem maior (leitura, sem escrita).
  perform 1 from public.b2b_campaigns where id = p_campaign_id for update;

  if not public.b2b_campaign_eligible(p_campaign_id, p_list_version_id) then
    return false; -- não elegível (mesma regra do serve): silêncio, não erro (evita revelar estado a quem não deveria ver)
  end if;

  if p_event_type = 'click' and not exists (
    select 1 from public.b2b_campaign_events e
     where e.campaign_id = p_campaign_id and e.event_type = 'impression' and e.day = v_day and e.dedupe_key = p_dedupe_key
  ) then
    return false; -- clique sem impressão prévia no mesmo dia/chave: descartado
  end if;

  insert into public.b2b_campaign_events (campaign_id, event_type, list_version_id, day, dedupe_key)
  values (p_campaign_id, p_event_type::public.b2b_campaign_event_type, p_list_version_id, v_day, p_dedupe_key)
  on conflict (campaign_id, event_type, day, dedupe_key) do nothing
  returning id into v_id;

  return v_id is not null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Desempenho agregado por dia (dono/admin). Ler `b2b_campaign_events`/`b2b_campaign_ledger` linha a linha
-- (mesmo sem `list_version_id`/`event_id`, já fora do grant de `authenticated`) ainda deixaria o dono ver o
-- CARIMBO DE HORA de cada evento — junto com o que ele já sabe (a própria segmentação: cidade, série, categoria),
-- isso pode bastar para inferir QUAL escola/família gerou um evento isolado, contornando o k-anonimato dos
-- insights. Esta função é o único jeito pretendido de o dono enxergar desempenho: agregado por DIA, com a MESMA
-- supressão por k mínimo (escolas distintas) que os insights usam — dia com menos de `min_k` escolas distintas
-- contribuindo vem com `impressions`/`clicks`/`accrued_cents` nulos e `suppressed = true` (revisão de segurança
-- independente, reverificação).
-- ---------------------------------------------------------------------------
create function public.b2b_campaign_performance(p_actor_id uuid, p_campaign_id uuid) returns table (
  day date, impressions integer, clicks integer, accrued_cents numeric, suppressed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub text;
  v_campaign public.b2b_campaigns%rowtype;
  v_is_owner boolean;
  v_is_admin boolean;
  v_min_k integer;
begin
  begin
    v_sub := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
  exception when others then
    v_sub := null;
  end;
  if v_sub is not null and v_sub is distinct from p_actor_id::text then
    raise exception 'ator diferente do usuário autenticado' using errcode = '42501';
  end if;

  select * into v_campaign from public.b2b_campaigns where id = p_campaign_id;
  if not found then
    raise exception 'campanha não encontrada' using errcode = 'P0002', hint = 'not_found';
  end if;

  v_is_owner := p_actor_id is not null and exists (
    select 1 from public.b2b_partner_members m where m.partner_id = v_campaign.partner_id and m.profile_id = p_actor_id and m.member_role = 'owner'
  );
  v_is_admin := p_actor_id is not null and exists (select 1 from public.profiles x where x.id = p_actor_id and x.role = 'admin');
  if not v_is_owner and not v_is_admin then
    raise exception 'campanha não encontrada' using errcode = 'P0002', hint = 'not_found';
  end if;

  select coalesce(s.min_k, 5) into v_min_k from public.b2b_insights_settings s limit 1;

  return query
    with per_day as (
      select e.day,
             count(*) filter (where e.event_type = 'impression')::integer as n_impressions,
             count(*) filter (where e.event_type = 'click')::integer as n_clicks,
             count(distinct sc.id)::integer as n_schools
        from public.b2b_campaign_events e
        join public.list_versions lv on lv.id = e.list_version_id
        join public.school_lists sl on sl.id = lv.list_id
        join public.schools sc on sc.id = sl.school_id
       where e.campaign_id = p_campaign_id
       group by e.day
    ),
    per_day_amount as (
      select l.day, sum(l.amount_cents) as accrued
        from public.b2b_campaign_ledger l
       where l.campaign_id = p_campaign_id and l.entry_type in ('impression_accrual', 'click_accrual')
       group by l.day
    )
    select d.day,
           case when d.n_schools >= v_min_k then d.n_impressions else null end,
           case when d.n_schools >= v_min_k then d.n_clicks else null end,
           case when d.n_schools >= v_min_k then coalesce(a.accrued, 0) else null end,
           d.n_schools < v_min_k
      from per_day d
      left join per_day_amount a on a.day = d.day
     order by d.day;
end;
$$;

-- ---------------------------------------------------------------------------
-- Insights: contagem CRUA (sem k-anonimato) — service_role only; a supressão é do domínio TypeScript.
-- ---------------------------------------------------------------------------
create function public.b2b_insights_raw(p_category text, p_grade_stage text, p_is_demo boolean) returns table (
  city_ibge text, city_name text, distinct_schools integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_category is null or btrim(p_category) = '' then
    raise exception 'categoria obrigatória' using errcode = '22023', hint = 'invalid_input';
  end if;
  if p_grade_stage is null or p_grade_stage not in ('ei', 'ef', 'em') then
    raise exception 'série (etapa) obrigatória' using errcode = '22023', hint = 'invalid_input';
  end if;

  -- Conta ESCOLA distinta, não lista: uma escola com várias listas na mesma etapa (séries diferentes, anos
  -- diferentes) só entra uma vez — senão infla a amostra sem ganhar anonimato de verdade (revisão de segurança
  -- independente, achado "uma escola com 5 séries").
  return query
    select m.ibge_code, m.name, count(distinct sc.id)::integer
      from public.list_items li
      join public.list_versions lv on lv.id = li.version_id and lv.status = 'published'
      join public.school_lists sl on sl.id = lv.list_id and sl.is_demo = coalesce(p_is_demo, false)
      join public.grades g on g.id = sl.grade_id and g.stage = p_grade_stage::public.grade_stage
      join public.schools sc on sc.id = sl.school_id
      join public.municipalities m on m.id = sc.municipality_id and m.is_enabled
     where li.category = p_category
     group by m.ibge_code, m.name;
end;
$$;

create function public.b2b_insights_settings_set(p_actor_id uuid, p_min_k integer) returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor_id is null or not exists (select 1 from public.profiles x where x.id = p_actor_id and x.role = 'admin') then
    raise exception 'só admin configura' using errcode = '42501', hint = 'forbidden';
  end if;
  if p_min_k is null or p_min_k < 2 or p_min_k > 1000 then
    raise exception 'min_k inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  update public.b2b_insights_settings set min_k = p_min_k;
  return p_min_k;
end;
$$;

-- ---------------------------------------------------------------------------
-- Faturamento: extrato imutável por período (uso de API sempre "indisponível" nesta fatia; campanhas com o valor
-- que o próprio parceiro declarou). Nunca gera cobrança automática — só o registro + instrução manual.
-- ---------------------------------------------------------------------------
create function public.b2b_statement_generate(p_actor_id uuid, p_partner_id uuid, p_period_start date, p_period_end date, p_payment_instruction text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_statement_id uuid;
  v_api_requests bigint;
  r record;
begin
  if p_actor_id is null or not exists (select 1 from public.profiles x where x.id = p_actor_id and x.role = 'admin') then
    raise exception 'só admin gera extrato' using errcode = '42501', hint = 'forbidden';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'período inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  if not exists (select 1 from public.b2b_partners where id = p_partner_id) then
    raise exception 'parceiro não encontrado' using errcode = 'P0002', hint = 'not_found';
  end if;
  if exists (select 1 from public.b2b_statements where partner_id = p_partner_id and period_start = p_period_start and period_end = p_period_end) then
    raise exception 'extrato do período já existe' using errcode = '23505', hint = 'duplicate_period';
  end if;

  insert into public.b2b_statements (partner_id, period_start, period_end, generated_by, payment_instruction)
  values (p_partner_id, p_period_start, p_period_end, p_actor_id, nullif(btrim(coalesce(p_payment_instruction, '')), ''))
  returning id into v_statement_id;

  -- só uso de chave `live` (ambiente real): uso de chave `test`/sandbox nunca entra no extrato real.
  select coalesce(sum(u.request_count), 0) into v_api_requests
    from public.b2b_usage_daily u
    join public.b2b_api_keys k on k.id = u.key_id
   where u.partner_id = p_partner_id and u.day between p_period_start and p_period_end and k.environment = 'live';
  insert into public.b2b_statement_line_items (statement_id, source, label, quantity, unit, unit_price_cents, amount_cents, pricing_status)
  values (v_statement_id, 'api_usage', 'Uso da API B2B (v1)', v_api_requests, 'requisições', null, null, 'unavailable');

  -- só campanha REAL (is_demo = false): campanha sandbox/demo nunca entra no extrato real (revisão de segurança
  -- independente — o filtro estava ausente, e uma campanha sandbox contava no extrato de um parceiro active).
  for r in
    select c.id, c.name, c.pricing_model, count(l.id) as n_events, sum(l.amount_cents) as total_cents, c.bid_cents
      from public.b2b_campaign_ledger l
      join public.b2b_campaigns c on c.id = l.campaign_id
     where c.partner_id = p_partner_id and l.day between p_period_start and p_period_end
       and l.entry_type in ('impression_accrual', 'click_accrual')
       and c.is_demo = false
     group by c.id, c.name, c.pricing_model, c.bid_cents
  loop
    insert into public.b2b_statement_line_items (statement_id, source, campaign_id, label, quantity, unit, unit_price_cents, amount_cents, pricing_status)
    values (
      v_statement_id,
      case when r.pricing_model = 'cpm' then 'campaign_cpm' else 'campaign_cpc' end,
      r.id, 'Campanha: ' || r.name, r.n_events, case when r.pricing_model = 'cpm' then 'impressões' else 'cliques' end,
      r.bid_cents, r.total_cents, 'priced'
    );
  end loop;

  return v_statement_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger b2b_campaigns_set_updated_at before update on public.b2b_campaigns for each row execute function public.b2b_campaigns_set_updated_at();

create trigger b2b_campaign_events_accrue after insert on public.b2b_campaign_events for each row execute function public.b2b_campaign_event_accrue();
-- enable always: o acúmulo/pausa por orçamento nunca pode ser pulado, nem por session_replication_role = replica
-- (usado em limpeza de teste em outras fatias) — revisão de segurança independente.
alter table public.b2b_campaign_events enable always trigger b2b_campaign_events_accrue;

create trigger b2b_insights_settings_set_updated_at before update on public.b2b_insights_settings for each row execute function public.b2b_campaigns_set_updated_at();

create trigger b2b_campaign_events_no_update_delete before update or delete on public.b2b_campaign_events
  for each row execute function public.b2b_campaign_events_block_mutation();
create trigger b2b_campaign_events_no_truncate before truncate on public.b2b_campaign_events
  for each statement execute function public.b2b_campaign_events_block_mutation();
alter table public.b2b_campaign_events enable always trigger b2b_campaign_events_no_update_delete;
alter table public.b2b_campaign_events enable always trigger b2b_campaign_events_no_truncate;

create trigger b2b_campaign_ledger_no_update_delete before update or delete on public.b2b_campaign_ledger
  for each row execute function public.b2b_campaign_ledger_block_mutation();
create trigger b2b_campaign_ledger_no_truncate before truncate on public.b2b_campaign_ledger
  for each statement execute function public.b2b_campaign_ledger_block_mutation();
alter table public.b2b_campaign_ledger enable always trigger b2b_campaign_ledger_no_update_delete;
alter table public.b2b_campaign_ledger enable always trigger b2b_campaign_ledger_no_truncate;

create trigger b2b_statements_no_update_delete before update or delete on public.b2b_statements
  for each row execute function public.b2b_statements_block_mutation();
create trigger b2b_statements_no_truncate before truncate on public.b2b_statements
  for each statement execute function public.b2b_statements_block_mutation();
alter table public.b2b_statements enable always trigger b2b_statements_no_update_delete;
alter table public.b2b_statements enable always trigger b2b_statements_no_truncate;

create trigger b2b_statement_line_items_no_update_delete before update or delete on public.b2b_statement_line_items
  for each row execute function public.b2b_statement_line_items_block_mutation();
create trigger b2b_statement_line_items_no_truncate before truncate on public.b2b_statement_line_items
  for each statement execute function public.b2b_statement_line_items_block_mutation();
alter table public.b2b_statement_line_items enable always trigger b2b_statement_line_items_no_update_delete;
alter table public.b2b_statement_line_items enable always trigger b2b_statement_line_items_no_truncate;

-- auditoria (dedupe_key e a granularidade fina do livro-razão não são PII, mas ficam fora do grant de authenticated abaixo).
create trigger b2b_campaigns_audit after insert or update or delete on public.b2b_campaigns for each row execute function public.audit_row_change();
alter table public.b2b_campaigns enable always trigger b2b_campaigns_audit;
create trigger b2b_campaign_events_audit after insert on public.b2b_campaign_events for each row execute function public.audit_row_change();
alter table public.b2b_campaign_events enable always trigger b2b_campaign_events_audit;
create trigger b2b_statements_audit after insert on public.b2b_statements for each row execute function public.audit_row_change();
alter table public.b2b_statements enable always trigger b2b_statements_audit;

-- ---------------------------------------------------------------------------
-- RLS: leitura do dono (membro do parceiro) e do admin; ninguém escreve direto.
-- ---------------------------------------------------------------------------
alter table public.b2b_campaigns enable row level security;
alter table public.b2b_campaign_events enable row level security;
alter table public.b2b_campaign_ledger enable row level security;
alter table public.b2b_insights_settings enable row level security;
alter table public.b2b_statements enable row level security;
alter table public.b2b_statement_line_items enable row level security;

create policy b2b_campaigns_select_member_or_admin on public.b2b_campaigns for select to authenticated
  using (
    exists (select 1 from public.b2b_partner_members m where m.partner_id = b2b_campaigns.partner_id and m.profile_id = (select auth.uid()))
    or (select public.auth_role()) = 'admin'
  );
comment on policy b2b_campaigns_select_member_or_admin on public.b2b_campaigns is 'S26: dono lê a própria campanha; admin lê todas.';

create policy b2b_campaign_events_select_member_or_admin on public.b2b_campaign_events for select to authenticated
  using (
    exists (
      select 1 from public.b2b_campaigns c join public.b2b_partner_members m on m.partner_id = c.partner_id
       where c.id = b2b_campaign_events.campaign_id and m.profile_id = (select auth.uid())
    ) or (select public.auth_role()) = 'admin'
  );
comment on policy b2b_campaign_events_select_member_or_admin on public.b2b_campaign_events is 'S26: dono/admin veem eventos da própria campanha (sem dedupe_key no grant).';

create policy b2b_campaign_ledger_select_member_or_admin on public.b2b_campaign_ledger for select to authenticated
  using (
    exists (
      select 1 from public.b2b_campaigns c join public.b2b_partner_members m on m.partner_id = c.partner_id
       where c.id = b2b_campaign_ledger.campaign_id and m.profile_id = (select auth.uid())
    ) or (select public.auth_role()) = 'admin'
  );
comment on policy b2b_campaign_ledger_select_member_or_admin on public.b2b_campaign_ledger is 'S26: dono/admin veem o próprio livro-razão de acúmulo (informativo, sem dinheiro real).';

create policy b2b_insights_settings_select_brand_or_admin on public.b2b_insights_settings for select to authenticated
  using (
    exists (
      select 1 from public.b2b_partner_members m join public.b2b_partners p on p.id = m.partner_id
       where m.profile_id = (select auth.uid()) and p.partner_type = 'brand' and p.status in ('sandbox', 'active')
    ) or (select public.auth_role()) = 'admin'
  );
comment on policy b2b_insights_settings_select_brand_or_admin on public.b2b_insights_settings is 'S26: min_k só é lido por parceiro marca habilitado ou admin (não é sensível, mas não é público).';

create policy b2b_statements_select_member_or_admin on public.b2b_statements for select to authenticated
  using (
    exists (select 1 from public.b2b_partner_members m where m.partner_id = b2b_statements.partner_id and m.profile_id = (select auth.uid()))
    or (select public.auth_role()) = 'admin'
  );
comment on policy b2b_statements_select_member_or_admin on public.b2b_statements is 'S26: extrato do próprio parceiro (sem generated_by no grant); admin lê todos.';

create policy b2b_statement_line_items_select_member_or_admin on public.b2b_statement_line_items for select to authenticated
  using (
    exists (
      select 1 from public.b2b_statements s join public.b2b_partner_members m on m.partner_id = s.partner_id
       where s.id = b2b_statement_line_items.statement_id and m.profile_id = (select auth.uid())
    ) or (select public.auth_role()) = 'admin'
  );
comment on policy b2b_statement_line_items_select_member_or_admin on public.b2b_statement_line_items is 'S26: linhas do próprio extrato; admin lê todas.';

-- ---------------------------------------------------------------------------
-- Grants (mínimos). anon: nada. authenticated: select por RLS com colunas restritas. service_role: leitura ampla
-- (sem PII nova aqui) + as funções internas; escrita sempre pelas funções SECURITY DEFINER.
-- ---------------------------------------------------------------------------
revoke all on public.b2b_campaigns, public.b2b_campaign_events, public.b2b_campaign_ledger, public.b2b_insights_settings,
  public.b2b_statements, public.b2b_statement_line_items from public, anon, authenticated, service_role;

-- `decided_by` (UUID de perfil do admin) fica fora do grant de `authenticated`, mesmo padrão de `b2b_partners`.
grant select (
  id, partner_id, name, product_label, creative_text, pricing_model, bid_cents, daily_budget_cents, total_budget_cents,
  accrued_total_cents, target_category, target_grade_stages, target_cities, status, status_reason, pause_origin, decided_at, is_demo,
  created_at, updated_at
) on public.b2b_campaigns to authenticated;
grant select on public.b2b_campaigns to service_role;
-- dedupe_key E list_version_id fora do grant de authenticated: list_version_id identifica a ESCOLA/lista exata
-- que gerou o evento — ler linha a linha contornaria o k-anonimato dos insights (revisão de segurança
-- independente, reverificação). O dono só enxerga desempenho agregado por dia via `b2b_campaign_performance`.
grant select (id, campaign_id, event_type, day, created_at, updated_at) on public.b2b_campaign_events to authenticated;
grant select on public.b2b_campaign_events to service_role;
-- event_id fora do grant de authenticated: junto com created_at daria granularidade por evento individual (a
-- mesma correlação escola/família que o agregado por dia evita). Mesma revisão.
grant select (id, campaign_id, entry_type, day, amount_cents, balance_after_cents, created_at, updated_at) on public.b2b_campaign_ledger to authenticated;
grant select on public.b2b_campaign_ledger to service_role;
grant select (min_k) on public.b2b_insights_settings to authenticated, service_role;
-- `generated_by` fora do grant de authenticated.
grant select (id, partner_id, period_start, period_end, payment_instruction, created_at, updated_at) on public.b2b_statements to authenticated;
grant select on public.b2b_statements to service_role;
grant select on public.b2b_statement_line_items to authenticated, service_role;

revoke execute on function public.b2b_campaign_events_block_mutation() from public, anon, authenticated, service_role;
revoke execute on function public.b2b_campaign_ledger_block_mutation() from public, anon, authenticated, service_role;
revoke execute on function public.b2b_statements_block_mutation() from public, anon, authenticated, service_role;
revoke execute on function public.b2b_statement_line_items_block_mutation() from public, anon, authenticated, service_role;
revoke execute on function public.b2b_campaign_event_accrue() from public, anon, authenticated, service_role;
revoke execute on function public.b2b_campaigns_set_updated_at() from public, anon, authenticated, service_role;

revoke execute on function public.b2b_campaign_create(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.b2b_campaign_create(uuid, uuid, jsonb) to service_role;
revoke execute on function public.b2b_campaign_transition(uuid, uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.b2b_campaign_transition(uuid, uuid, text, text) to service_role;
-- internas (chamadas só de dentro de outra SECURITY DEFINER): sem grant, mesmo padrão de b2b_keys_revoke_internal (0501).
revoke execute on function public.b2b_campaign_list_context(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.b2b_campaign_eligible(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.b2b_campaign_serve(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.b2b_campaign_serve(uuid, integer) to service_role;
revoke execute on function public.b2b_campaign_record_event(uuid, uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.b2b_campaign_record_event(uuid, uuid, text, text) to service_role;
revoke execute on function public.b2b_campaign_performance(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.b2b_campaign_performance(uuid, uuid) to service_role;
revoke execute on function public.b2b_insights_raw(text, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.b2b_insights_raw(text, text, boolean) to service_role;
revoke execute on function public.b2b_insights_settings_set(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.b2b_insights_settings_set(uuid, integer) to service_role;
revoke execute on function public.b2b_statement_generate(uuid, uuid, date, date, text) from public, anon, authenticated, service_role;
grant execute on function public.b2b_statement_generate(uuid, uuid, date, date, text) to service_role;

comment on table public.b2b_campaigns is 'S26: campanhas de sugestão de produto (marca), CPM/CPC com bid declarado pelo parceiro. Estado só por b2b_campaign_transition.';
comment on table public.b2b_campaign_events is 'S26: impressão/clique, imutável, dedupe por (campanha, tipo, dia, dedupe_key). Sem cookie de terceiro nem dado pessoal.';
comment on table public.b2b_campaign_ledger is 'S26: acúmulo informativo (nunca dinheiro real) de CPM/CPC, gravado pelo gatilho de b2b_campaign_events.';
comment on table public.b2b_statements is 'S26: extrato imutável por período. amount_cents null = sem preço configurado (nunca inventado). Sem cobrança automática.';
comment on function public.b2b_campaign_eligible(uuid, uuid) is 'S26: fonte única de elegibilidade (Procon, is_demo, segmentação, orçamento) — usada por b2b_campaign_serve E b2b_campaign_record_event; nunca decidir elegibilidade fora daqui.';
comment on function public.b2b_campaign_serve(uuid, integer) is 'S26: só formata o que b2b_campaign_eligible decide.';
comment on function public.b2b_insights_raw(text, text, boolean) is 'S26: contagem crua, sem k-anonimato — service_role only. Supressão é do domínio TypeScript (features/campaigns/insights-service.ts).';
