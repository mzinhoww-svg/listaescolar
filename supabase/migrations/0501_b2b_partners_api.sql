-- 0501_b2b_partners_api: parceiros B2B, chaves de API com hash, rate limit por chave, uso agregado e leitura pública
-- da API v1 (S24, trilha B2B, faixa 05xx). Roda depois da S11: FKs para profiles, consents e tabelas desta migration;
-- nenhuma FK para a trilha Cobrança (04xx). Regras duras:
-- * a API expõe SÓ listas públicas (published com versão atual, escola não suspensa, município habilitado) e agregados;
--   nenhum dado de família, aluno, contato de escola, perfil ou campo interno sai pelas funções b2b_v1_*;
-- * o banco guarda só o HMAC da chave (pepper no servidor); o segredo nunca passa por aqui;
-- * toda escrita é por função SECURITY DEFINER (só service_role); ninguém escreve direto nas tabelas;
-- * `authenticated` lê por RLS (dono do parceiro ou admin) com grants por coluna: key_hash/hash_version e actor_id ficam fora;
-- * eventos são imutáveis; auditoria sem contact_name nem key_hash.

create type public.b2b_partner_type as enum ('retailer', 'brand', 'edtech');
create type public.b2b_partner_status as enum ('pending', 'sandbox', 'active', 'rejected', 'suspended');
create type public.b2b_plan as enum ('sandbox', 'regional', 'national', 'brand_campaigns', 'edtech_integration');
create type public.b2b_key_environment as enum ('test', 'live');
create type public.b2b_key_status as enum ('active', 'revoked');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.b2b_partners (
  id uuid primary key default gen_random_uuid(),
  trade_name text not null check (btrim(trade_name) <> '' and length(trade_name) <= 120),
  legal_name text not null check (btrim(legal_name) <> '' and length(legal_name) <= 200),
  cnpj text not null check (cnpj ~ '^[0-9A-Z]{14}$'), -- DV validado no domínio (features/stationeries/cnpj.ts)
  contact_name text not null check (btrim(contact_name) <> '' and length(contact_name) <= 120), -- contato adulto; nunca sai pela API nem pelo audit_log
  partner_type public.b2b_partner_type not null,
  status public.b2b_partner_status not null default 'pending',
  plan public.b2b_plan, -- só rótulo (preços e excedente são da S26)
  coverage_ufs text[] check (
    coverage_ufs is null or (cardinality(coverage_ufs) between 1 and 27 and coverage_ufs <@ array[
      'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']::text[])
  ), -- null = nacional
  test_rate_per_minute integer check (test_rate_per_minute is null or test_rate_per_minute between 1 and 10000),
  test_rate_per_day integer check (test_rate_per_day is null or test_rate_per_day between 1 and 10000000),
  live_rate_per_minute integer check (live_rate_per_minute is null or live_rate_per_minute between 1 and 10000),
  live_rate_per_day integer check (live_rate_per_day is null or live_rate_per_day between 1 and 10000000),
  status_reason text check (status_reason is null or length(status_reason) <= 500),
  terms_consent_id uuid references public.consents (id) on delete set null,
  terms_text_version text check (terms_text_version is null or (btrim(terms_text_version) <> '' and length(terms_text_version) <= 80)),
  decided_by uuid, -- sem FK: histórico sobrevive à exclusão de conta
  decided_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index b2b_partners_status_idx on public.b2b_partners (status);
-- CNPJ único entre parceiros não recusados (um recusado pode se cadastrar de novo).
create unique index b2b_partners_cnpj_active_idx on public.b2b_partners (cnpj) where status <> 'rejected';

create table public.b2b_partner_members (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.b2b_partners (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  member_role text not null check (member_role in ('owner')), -- nesta fatia só o dono
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id) -- um perfil em no máximo um parceiro
);
create unique index b2b_partner_members_one_owner_per_partner on public.b2b_partner_members (partner_id) where member_role = 'owner';

create table public.b2b_partner_events (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.b2b_partners (id) on delete restrict,
  event_type text not null check (event_type in ('applied', 'decided', 'key_created', 'key_rotated', 'key_revoked')),
  from_status public.b2b_partner_status,
  to_status public.b2b_partner_status,
  actor_id uuid, -- sem FK; fora do grant de authenticated
  actor_role text not null check (actor_role in ('owner', 'admin', 'system')),
  reason text check (reason is null or length(reason) <= 500),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index b2b_partner_events_partner_idx on public.b2b_partner_events (partner_id, created_at);

create table public.b2b_api_keys (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.b2b_partners (id) on delete restrict,
  environment public.b2b_key_environment not null,
  public_id text not null unique check (public_id ~ '^[0-9A-HJKMNP-TV-Z]{12}$'), -- Crockford base32, identificador público
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'), -- HMAC-SHA256(pepper do servidor, segredo); nunca o segredo
  hash_version smallint not null default 1 check (hash_version between 1 and 32767),
  last4 text not null check (last4 ~ '^[A-Za-z0-9_-]{4}$'),
  scopes text[] not null check (cardinality(scopes) between 1 and 3 and scopes <@ array['schools:read', 'lists:read', 'carts:match']::text[]),
  status public.b2b_key_status not null default 'active',
  expires_at timestamptz, -- carência da rotação; expirada = inutilizável (checado no lookup, sem job)
  rotated_from_id uuid references public.b2b_api_keys (id) on delete restrict,
  created_by uuid,
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text check (revoke_reason is null or length(revoke_reason) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint b2b_api_keys_revoked_pair check ((status = 'revoked') = (revoked_at is not null))
);
create index b2b_api_keys_partner_env_idx on public.b2b_api_keys (partner_id, environment, status);

create table public.b2b_rate_windows (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.b2b_partners (id) on delete cascade,
  environment public.b2b_key_environment not null,
  window_kind text not null check (window_kind in ('minute', 'day')),
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_id, environment, window_kind, window_start)
);
create index b2b_rate_windows_start_idx on public.b2b_rate_windows (window_start);

-- Uso agregado por chave, dia (America/Cuiaba), endpoint e classe de status. Sem IP, user agent, corpo, query ou SKU.
create table public.b2b_usage_daily (
  id uuid primary key default gen_random_uuid(),
  key_id uuid not null references public.b2b_api_keys (id) on delete restrict,
  partner_id uuid not null references public.b2b_partners (id) on delete restrict,
  day date not null,
  endpoint text not null check (btrim(endpoint) <> '' and length(endpoint) <= 80),
  status_class text not null check (status_class in ('2xx', '4xx', '429', '5xx')),
  request_count integer not null default 0 check (request_count >= 0),
  match_items_total integer not null default 0 check (match_items_total >= 0),
  match_items_matched integer not null default 0 check (match_items_matched >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (key_id, day, endpoint, status_class)
);
create index b2b_usage_daily_partner_day_idx on public.b2b_usage_daily (partner_id, day);

-- ---------------------------------------------------------------------------
-- Gatilhos de guarda (valem para todos, inclusive postgres: imutabilidade é regra do dado)
-- ---------------------------------------------------------------------------
create function public.b2b_partner_events_block_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'b2b_partner_events é imutável (% bloqueado)', tg_op using errcode = '42501';
end;
$$;

create function public.b2b_api_keys_guard_update() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.public_id is distinct from old.public_id or new.key_hash is distinct from old.key_hash
     or new.hash_version is distinct from old.hash_version or new.partner_id is distinct from old.partner_id
     or new.environment is distinct from old.environment or new.scopes is distinct from old.scopes
     or new.created_by is distinct from old.created_by or new.rotated_from_id is distinct from old.rotated_from_id
     or new.last4 is distinct from old.last4 then
    raise exception 'colunas de identidade da chave são imutáveis' using errcode = '42501';
  end if;
  if old.status = 'revoked' and (new.status <> 'revoked' or new.revoked_at is distinct from old.revoked_at
     or new.revoked_by is distinct from old.revoked_by or new.revoke_reason is distinct from old.revoke_reason) then
    raise exception 'revogação é irreversível' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Escopos por tipo (espelho TS em features/b2b/scopes.ts, com teste de contrato)
-- ---------------------------------------------------------------------------
create function public.b2b_allowed_scopes(p_type text) returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'retailer' then array['schools:read', 'lists:read', 'carts:match']
    when 'brand' then array['schools:read', 'lists:read']
    when 'edtech' then array['schools:read', 'lists:read']
    else array[]::text[]
  end;
$$;

-- UF válida (lista fixa; a mesma do CHECK).
create function public.b2b_valid_ufs(p_ufs jsonb) returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_out text[];
begin
  if p_ufs is null or jsonb_typeof(p_ufs) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_ufs) <> 'array' then
    raise exception 'coverage_ufs inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  select array_agg(distinct x order by x) into v_out from jsonb_array_elements_text(p_ufs) x;
  if v_out is null or cardinality(v_out) = 0 or not (v_out <@ array[
      'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']::text[]) then
    raise exception 'coverage_ufs inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cadastro: parceiro pending + dono + consentimento dos termos da API + evento, tudo ou nada.
-- ---------------------------------------------------------------------------
create function public.b2b_partner_apply(p_actor_id uuid, p_payload jsonb, p_terms_version text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version text := nullif(btrim(coalesce(p_terms_version, '')), '');
  v_trade text := nullif(btrim(coalesce(p_payload ->> 'trade_name', '')), '');
  v_legal text := nullif(btrim(coalesce(p_payload ->> 'legal_name', '')), '');
  v_cnpj text := upper(regexp_replace(coalesce(p_payload ->> 'cnpj', ''), '[^0-9A-Za-z]', '', 'g'));
  v_contact text := nullif(btrim(coalesce(p_payload ->> 'contact_name', '')), '');
  v_type text := p_payload ->> 'partner_type';
  v_ufs text[];
  v_consent uuid;
  v_id uuid;
begin
  if v_version is null then
    raise exception 'aceite dos termos da API obrigatório' using errcode = '22023', hint = 'consent_required';
  end if;
  if p_actor_id is null or not exists (select 1 from public.profiles p where p.id = p_actor_id) then
    raise exception 'cadastro exige conta' using errcode = '42501', hint = 'forbidden';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  if v_trade is null or length(v_trade) > 120 or v_legal is null or length(v_legal) > 200
     or v_contact is null or length(v_contact) > 120 or v_cnpj !~ '^[0-9A-Z]{14}$'
     or v_type is null or v_type not in ('retailer', 'brand', 'edtech') then
    raise exception 'dados do cadastro inválidos' using errcode = '22023', hint = 'invalid_input';
  end if;
  v_ufs := public.b2b_valid_ufs(p_payload -> 'coverage_ufs');

  -- duplo envio do mesmo dono se serializa aqui.
  perform pg_advisory_xact_lock(hashtextextended('b2b_partner_apply:' || p_actor_id::text, 0));
  if exists (select 1 from public.b2b_partner_members m where m.profile_id = p_actor_id) then
    raise exception 'conta já vinculada a um parceiro' using errcode = '23505', hint = 'already_member';
  end if;
  if exists (select 1 from public.b2b_partners x where x.cnpj = v_cnpj and x.status <> 'rejected') then
    raise exception 'CNPJ já cadastrado' using errcode = '23505', hint = 'duplicate_cnpj';
  end if;

  insert into public.consents (profile_id, purpose, text_version) values (p_actor_id, 'b2b_api_terms', v_version) returning id into v_consent;
  begin
    insert into public.b2b_partners (trade_name, legal_name, cnpj, contact_name, partner_type, coverage_ufs, terms_consent_id, terms_text_version)
    values (v_trade, v_legal, v_cnpj, v_contact, v_type::public.b2b_partner_type, v_ufs, v_consent, v_version)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'CNPJ já cadastrado' using errcode = '23505', hint = 'duplicate_cnpj';
  end;
  insert into public.b2b_partner_members (partner_id, profile_id, member_role) values (v_id, p_actor_id, 'owner');
  insert into public.b2b_partner_events (partner_id, event_type, from_status, to_status, actor_id, actor_role, payload)
  values (v_id, 'applied', null, 'pending', p_actor_id, 'owner', jsonb_build_object('partner_type', v_type));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Revogação interna (usada pela decisão e por b2b_key_revoke). Idempotente.
-- ---------------------------------------------------------------------------
create function public.b2b_keys_revoke_internal(p_partner_id uuid, p_environment public.b2b_key_environment, p_actor_id uuid, p_actor_role text, p_reason text) returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_n integer := 0;
  k record;
begin
  for k in
    select id, environment, public_id from public.b2b_api_keys
     where partner_id = p_partner_id and status = 'active' and (p_environment is null or environment = p_environment)
     for update
  loop
    update public.b2b_api_keys set status = 'revoked', revoked_at = now(), revoked_by = p_actor_id, revoke_reason = p_reason where id = k.id;
    insert into public.b2b_partner_events (partner_id, event_type, actor_id, actor_role, reason, payload)
    values (p_partner_id, 'key_revoked', p_actor_id, p_actor_role, p_reason, jsonb_build_object('key_id', k.id, 'environment', k.environment, 'public_id', k.public_id));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Decisão do admin: única porta de mudança de estado. Matriz fixa, requisitos por destino, revogação de chaves na
-- mesma transação (suspensão: todas; active -> sandbox: as live). Só admin (papel em profiles e, com claim sub, o
-- mesmo usuário). Erros com hint estável: forbidden, not_found, invalid_input, transition_not_allowed.
-- payload: plan, coverage_ufs (null = nacional), test_rate_per_minute, test_rate_per_day, live_rate_per_minute,
-- live_rate_per_day, reason. Campos ausentes mantêm o valor atual do parceiro.
-- ---------------------------------------------------------------------------
create function public.b2b_partner_decide(p_partner_id uuid, p_actor_id uuid, p_to text, p_payload jsonb) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.b2b_partners%rowtype;
  v_sub text;
  v_from text;
  v_to public.b2b_partner_status;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_plan text;
  v_ufs text[];
  v_tm integer;
  v_td integer;
  v_lm integer;
  v_ld integer;
  v_reason text := nullif(btrim(coalesce(p_payload ->> 'reason', '')), '');
  v_allowed boolean;
begin
  begin
    v_sub := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
  exception when others then
    v_sub := null;
  end;
  if v_sub is not null and v_sub is distinct from p_actor_id::text then
    raise exception 'ator diferente do usuário autenticado' using errcode = '42501';
  end if;
  if p_actor_id is null or not exists (select 1 from public.profiles x where x.id = p_actor_id and x.role = 'admin') then
    raise exception 'só admin decide' using errcode = '42501', hint = 'forbidden';
  end if;
  if p_to is null or p_to not in ('pending', 'sandbox', 'active', 'rejected', 'suspended') then
    raise exception 'destino inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception 'payload inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  v_to := p_to::public.b2b_partner_status;

  select * into p from public.b2b_partners where id = p_partner_id for no key update;
  if not found then
    raise exception 'parceiro não encontrado' using errcode = 'P0002', hint = 'not_found';
  end if;
  v_from := p.status::text;

  v_allowed := (v_from, p_to) in (
    ('pending', 'sandbox'), ('pending', 'active'), ('pending', 'rejected'),
    ('sandbox', 'active'), ('sandbox', 'suspended'),
    ('active', 'sandbox'), ('active', 'suspended'),
    ('suspended', 'sandbox'), ('suspended', 'active')
  );
  if not v_allowed then
    raise exception 'transição % -> % não permitida', v_from, p_to using errcode = '23514', hint = 'transition_not_allowed';
  end if;

  v_plan := case when v_payload ? 'plan' then v_payload ->> 'plan' else p.plan::text end;
  v_ufs := case when v_payload ? 'coverage_ufs' then public.b2b_valid_ufs(v_payload -> 'coverage_ufs') else p.coverage_ufs end;
  begin
    v_tm := case when v_payload ? 'test_rate_per_minute' then (v_payload ->> 'test_rate_per_minute')::integer else p.test_rate_per_minute end;
    v_td := case when v_payload ? 'test_rate_per_day' then (v_payload ->> 'test_rate_per_day')::integer else p.test_rate_per_day end;
    v_lm := case when v_payload ? 'live_rate_per_minute' then (v_payload ->> 'live_rate_per_minute')::integer else p.live_rate_per_minute end;
    v_ld := case when v_payload ? 'live_rate_per_day' then (v_payload ->> 'live_rate_per_day')::integer else p.live_rate_per_day end;
  exception when others then
    raise exception 'limites inválidos' using errcode = '22023', hint = 'invalid_input';
  end;

  if p_to in ('sandbox', 'active') then
    if v_plan is null or v_plan not in ('sandbox', 'regional', 'national', 'brand_campaigns', 'edtech_integration') then
      raise exception 'plano obrigatório' using errcode = '22023', hint = 'invalid_input';
    end if;
    if v_tm is null or v_td is null or v_tm not between 1 and 10000 or v_td not between 1 and 10000000 then
      raise exception 'limites de sandbox obrigatórios' using errcode = '22023', hint = 'invalid_input';
    end if;
  end if;
  if p_to = 'active' and (v_lm is null or v_ld is null or v_lm not between 1 and 10000 or v_ld not between 1 and 10000000) then
    raise exception 'limites de produção obrigatórios' using errcode = '22023', hint = 'invalid_input';
  end if;
  if p_to in ('rejected', 'suspended') and v_reason is null then
    raise exception 'motivo obrigatório para %', p_to using errcode = '22023', hint = 'invalid_input';
  end if;
  if v_reason is not null and length(v_reason) > 500 then
    raise exception 'motivo longo demais' using errcode = '22023', hint = 'invalid_input';
  end if;

  update public.b2b_partners
     set status = v_to,
         plan = case when p_to in ('sandbox', 'active') then v_plan::public.b2b_plan else plan end,
         coverage_ufs = case when p_to in ('sandbox', 'active') then v_ufs else coverage_ufs end,
         test_rate_per_minute = case when p_to in ('sandbox', 'active') then v_tm else test_rate_per_minute end,
         test_rate_per_day = case when p_to in ('sandbox', 'active') then v_td else test_rate_per_day end,
         live_rate_per_minute = case when p_to = 'active' then v_lm else live_rate_per_minute end,
         live_rate_per_day = case when p_to = 'active' then v_ld else live_rate_per_day end,
         status_reason = case when p_to in ('rejected', 'suspended') then v_reason else null end,
         decided_by = p_actor_id,
         decided_at = now()
   where id = p_partner_id;

  if p_to in ('suspended', 'rejected') then
    perform public.b2b_keys_revoke_internal(p_partner_id, null, p_actor_id, 'admin', 'partner_suspended');
  elsif v_from = 'active' and p_to = 'sandbox' then
    perform public.b2b_keys_revoke_internal(p_partner_id, 'live', p_actor_id, 'admin', 'partner_downgraded');
  end if;

  insert into public.b2b_partner_events (partner_id, event_type, from_status, to_status, actor_id, actor_role, reason, payload)
  values (p_partner_id, 'decided', p.status, v_to, p_actor_id, 'admin', v_reason,
          jsonb_build_object('plan', v_plan, 'coverage_ufs', to_jsonb(v_ufs)));
  return p_to;
end;
$$;

-- ---------------------------------------------------------------------------
-- Chaves. O servidor gera id público, segredo e hash; aqui só se grava o hash. Duas utilizáveis por (parceiro, ambiente).
-- ---------------------------------------------------------------------------
create function public.b2b_key_usable_count(p_partner_id uuid, p_environment public.b2b_key_environment) returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer from public.b2b_api_keys k
   where k.partner_id = p_partner_id and k.environment = p_environment and k.status = 'active'
     and (k.expires_at is null or k.expires_at > now());
$$;

create function public.b2b_key_create(
  p_actor_id uuid, p_partner_id uuid, p_environment text, p_public_id text, p_key_hash text, p_hash_version smallint, p_last4 text, p_scopes text[]
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.b2b_partners%rowtype;
  v_env public.b2b_key_environment;
  v_scopes text[];
  v_id uuid;
begin
  if p_environment is null or p_environment not in ('test', 'live') then
    raise exception 'ambiente inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  v_env := p_environment::public.b2b_key_environment;
  select array_agg(distinct s order by s) into v_scopes from unnest(coalesce(p_scopes, '{}')) s;
  if v_scopes is null or cardinality(v_scopes) = 0 then
    raise exception 'escopos obrigatórios' using errcode = '22023', hint = 'invalid_input';
  end if;

  select * into p from public.b2b_partners where id = p_partner_id for share;
  if not found then
    raise exception 'parceiro não encontrado' using errcode = 'P0002', hint = 'not_found';
  end if;
  if p_actor_id is null or not exists (
    select 1 from public.b2b_partner_members m where m.partner_id = p_partner_id and m.profile_id = p_actor_id and m.member_role = 'owner'
  ) then
    raise exception 'ator não é o dono deste parceiro' using errcode = '42501', hint = 'forbidden';
  end if;
  if not ((v_env = 'test' and p.status in ('sandbox', 'active')) or (v_env = 'live' and p.status = 'active')) then
    raise exception 'ambiente % indisponível no estado %', p_environment, p.status using errcode = '23514', hint = 'environment_not_allowed';
  end if;
  if not (v_scopes <@ public.b2b_allowed_scopes(p.partner_type::text)) then
    raise exception 'escopo não permitido para o tipo %', p.partner_type using errcode = '23514', hint = 'scope_not_allowed';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('b2b_keys:' || p_partner_id::text || ':' || p_environment, 0));
  if public.b2b_key_usable_count(p_partner_id, v_env) >= 2 then
    raise exception 'já há duas chaves utilizáveis neste ambiente' using errcode = '23514', hint = 'too_many_keys';
  end if;

  insert into public.b2b_api_keys (partner_id, environment, public_id, key_hash, hash_version, last4, scopes, created_by)
  values (p_partner_id, v_env, p_public_id, p_key_hash, coalesce(p_hash_version, 1), p_last4, v_scopes, p_actor_id)
  returning id into v_id;
  insert into public.b2b_partner_events (partner_id, event_type, actor_id, actor_role, payload)
  values (p_partner_id, 'key_created', p_actor_id, 'owner', jsonb_build_object('key_id', v_id, 'environment', p_environment, 'public_id', p_public_id, 'scopes', to_jsonb(v_scopes)));
  return v_id;
end;
$$;

create function public.b2b_key_rotate(
  p_actor_id uuid, p_old_key_id uuid, p_public_id text, p_key_hash text, p_hash_version smallint, p_last4 text, p_grace interval
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.b2b_api_keys%rowtype;
  p public.b2b_partners%rowtype;
  v_id uuid;
  v_expires timestamptz;
begin
  if p_grace is null or p_grace < interval '1 day' or p_grace > interval '30 days' then
    raise exception 'carência entre 1 e 30 dias' using errcode = '22023', hint = 'invalid_input';
  end if;
  select * into k from public.b2b_api_keys where id = p_old_key_id for update;
  if not found then
    raise exception 'chave não encontrada' using errcode = 'P0002', hint = 'not_found';
  end if;
  if p_actor_id is null or not exists (
    select 1 from public.b2b_partner_members m where m.partner_id = k.partner_id and m.profile_id = p_actor_id and m.member_role = 'owner'
  ) then
    raise exception 'ator não é o dono deste parceiro' using errcode = '42501', hint = 'forbidden';
  end if;
  if k.status <> 'active' or (k.expires_at is not null and k.expires_at <= now()) then
    raise exception 'só chave ativa rotaciona' using errcode = '23514', hint = 'key_not_active';
  end if;
  select * into p from public.b2b_partners where id = k.partner_id for share;
  if not ((k.environment = 'test' and p.status in ('sandbox', 'active')) or (k.environment = 'live' and p.status = 'active')) then
    raise exception 'ambiente indisponível no estado %', p.status using errcode = '23514', hint = 'environment_not_allowed';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('b2b_keys:' || k.partner_id::text || ':' || k.environment::text, 0));
  if public.b2b_key_usable_count(k.partner_id, k.environment) >= 2 then
    raise exception 'já há duas chaves utilizáveis neste ambiente: revogue uma antes' using errcode = '23514', hint = 'too_many_keys';
  end if;

  insert into public.b2b_api_keys (partner_id, environment, public_id, key_hash, hash_version, last4, scopes, created_by, rotated_from_id)
  values (k.partner_id, k.environment, p_public_id, p_key_hash, coalesce(p_hash_version, 1), p_last4, k.scopes, p_actor_id, k.id)
  returning id into v_id;
  v_expires := now() + p_grace;
  update public.b2b_api_keys set expires_at = least(coalesce(expires_at, v_expires), v_expires) where id = k.id;
  insert into public.b2b_partner_events (partner_id, event_type, actor_id, actor_role, payload)
  values (k.partner_id, 'key_rotated', p_actor_id, 'owner',
          jsonb_build_object('old_key_id', k.id, 'new_key_id', v_id, 'environment', k.environment, 'old_public_id', k.public_id, 'new_public_id', p_public_id, 'grace', p_grace::text));
  return v_id;
end;
$$;

create function public.b2b_key_revoke(p_actor_id uuid, p_actor_role text, p_key_id uuid, p_reason text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.b2b_api_keys%rowtype;
  v_reason text := left(nullif(btrim(coalesce(p_reason, '')), ''), 200);
begin
  if p_actor_role is null or p_actor_role not in ('owner', 'admin') then
    raise exception 'ator inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  select * into k from public.b2b_api_keys where id = p_key_id for update;
  if not found then
    raise exception 'chave não encontrada' using errcode = 'P0002', hint = 'not_found';
  end if;
  if p_actor_role = 'owner' then
    if p_actor_id is null or not exists (
      select 1 from public.b2b_partner_members m where m.partner_id = k.partner_id and m.profile_id = p_actor_id and m.member_role = 'owner'
    ) then
      raise exception 'ator não é o dono deste parceiro' using errcode = '42501', hint = 'forbidden';
    end if;
  elsif p_actor_id is null or not exists (select 1 from public.profiles x where x.id = p_actor_id and x.role = 'admin') then
    raise exception 'ator não é admin' using errcode = '42501', hint = 'forbidden';
  end if;
  if k.status = 'revoked' then
    return; -- idempotente
  end if;
  update public.b2b_api_keys set status = 'revoked', revoked_at = now(), revoked_by = p_actor_id, revoke_reason = v_reason where id = k.id;
  insert into public.b2b_partner_events (partner_id, event_type, actor_id, actor_role, reason, payload)
  values (k.partner_id, 'key_revoked', p_actor_id, p_actor_role, v_reason, jsonb_build_object('key_id', k.id, 'environment', k.environment, 'public_id', k.public_id));
end;
$$;

-- Lookup pelo id público (SEM cache no servidor). `usable` já considera status, expiração e estado do parceiro por
-- ambiente. O servidor compara o HMAC em tempo constante.
create function public.b2b_key_lookup(p_public_id text)
returns table (key_id uuid, partner_id uuid, environment text, key_hash text, hash_version smallint, scopes text[], usable boolean, coverage_ufs text[])
language sql
stable
security definer
set search_path = ''
as $$
  select k.id, k.partner_id, k.environment::text, k.key_hash, k.hash_version, k.scopes,
         (k.status = 'active' and (k.expires_at is null or k.expires_at > now())
          and ((k.environment = 'test' and p.status in ('sandbox', 'active')) or (k.environment = 'live' and p.status = 'active'))) as usable,
         p.coverage_ufs
    from public.b2b_api_keys k
    join public.b2b_partners p on p.id = k.partner_id
   where k.public_id = p_public_id;
$$;

-- ---------------------------------------------------------------------------
-- Rate limit: janela fixa por minuto e por dia (America/Cuiaba), balde (parceiro, ambiente), atômico por advisory lock.
-- Revalida a chave na mesma transação; negada não consome. Devolve a janela mais restritiva.
-- ---------------------------------------------------------------------------
create function public.b2b_rate_consume(p_key_id uuid)
returns table (allowed boolean, key_valid boolean, window_kind text, limit_value integer, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner uuid;
  v_env public.b2b_key_environment;
  v_usable boolean;
  v_min_limit integer;
  v_day_limit integer;
  v_minute_start timestamptz := date_trunc('minute', now());
  v_day_start timestamptz := (date_trunc('day', now() at time zone 'America/Cuiaba')) at time zone 'America/Cuiaba';
  v_mc integer;
  v_dc integer;
  v_mrem integer;
  v_drem integer;
begin
  select k.partner_id, k.environment,
         (k.status = 'active' and (k.expires_at is null or k.expires_at > now())
          and ((k.environment = 'test' and p.status in ('sandbox', 'active')) or (k.environment = 'live' and p.status = 'active'))),
         case k.environment when 'test' then p.test_rate_per_minute else p.live_rate_per_minute end,
         case k.environment when 'test' then p.test_rate_per_day else p.live_rate_per_day end
    into v_partner, v_env, v_usable, v_min_limit, v_day_limit
    from public.b2b_api_keys k join public.b2b_partners p on p.id = k.partner_id
   where k.id = p_key_id;
  if not found or not v_usable or v_min_limit is null or v_day_limit is null then
    return query select false, false, null::text, null::integer, null::integer, null::timestamptz;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('b2b_rate:' || v_partner::text || ':' || v_env::text, 0));
  select coalesce((select w.count from public.b2b_rate_windows w where w.partner_id = v_partner and w.environment = v_env and w.window_kind = 'minute' and w.window_start = v_minute_start), 0) into v_mc;
  select coalesce((select w.count from public.b2b_rate_windows w where w.partner_id = v_partner and w.environment = v_env and w.window_kind = 'day' and w.window_start = v_day_start), 0) into v_dc;

  if v_mc >= v_min_limit then
    return query select false, true, 'minute'::text, v_min_limit, 0, v_minute_start + interval '1 minute';
    return;
  end if;
  if v_dc >= v_day_limit then
    return query select false, true, 'day'::text, v_day_limit, 0, v_day_start + interval '1 day';
    return;
  end if;

  insert into public.b2b_rate_windows (partner_id, environment, window_kind, window_start, count)
  values (v_partner, v_env, 'minute', v_minute_start, 1), (v_partner, v_env, 'day', v_day_start, 1)
  on conflict (partner_id, environment, window_kind, window_start) do update set count = public.b2b_rate_windows.count + 1;
  v_mrem := v_min_limit - (v_mc + 1);
  v_drem := v_day_limit - (v_dc + 1);
  if v_drem < v_mrem then
    return query select true, true, 'day'::text, v_day_limit, v_drem, v_day_start + interval '1 day';
  else
    return query select true, true, 'minute'::text, v_min_limit, v_mrem, v_minute_start + interval '1 minute';
  end if;
end;
$$;

create function public.b2b_usage_record(p_key_id uuid, p_endpoint text, p_status_class text, p_match_total integer default 0, p_match_matched integer default 0) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner uuid;
  v_day date := (now() at time zone 'America/Cuiaba')::date;
begin
  if p_status_class is null or p_status_class not in ('2xx', '4xx', '429', '5xx')
     or p_endpoint is null or btrim(p_endpoint) = '' or length(p_endpoint) > 80
     or coalesce(p_match_total, 0) < 0 or coalesce(p_match_matched, 0) < 0 then
    raise exception 'uso inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  select partner_id into v_partner from public.b2b_api_keys where id = p_key_id;
  if not found then
    raise exception 'chave não encontrada' using errcode = 'P0002', hint = 'not_found';
  end if;
  insert into public.b2b_usage_daily (key_id, partner_id, day, endpoint, status_class, request_count, match_items_total, match_items_matched)
  values (p_key_id, v_partner, v_day, p_endpoint, p_status_class, 1, coalesce(p_match_total, 0), coalesce(p_match_matched, 0))
  on conflict (key_id, day, endpoint, status_class) do update
    set request_count = public.b2b_usage_daily.request_count + 1,
        match_items_total = public.b2b_usage_daily.match_items_total + excluded.match_items_total,
        match_items_matched = public.b2b_usage_daily.match_items_matched + excluded.match_items_matched;
end;
$$;

create function public.b2b_prune_rate_windows(p_older_than interval default interval '2 days') returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  delete from public.b2b_rate_windows where window_start < now() - coalesce(p_older_than, interval '2 days');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leitura pública da API v1. Regra codificada uma vez em b2b_v1_visible_lists / b2b_v1_school_base (internas):
-- lista published com versão atual published, escola não suspensa, município habilitado, cobertura por UF,
-- ambiente: live = escola e lista não demo; test = escola ou lista demo. Só colunas da whitelist.
-- ---------------------------------------------------------------------------
create function public.b2b_v1_visible_lists(p_environment text, p_coverage_ufs text[], p_list_id uuid, p_school_inep text, p_year integer)
returns table (
  list_id uuid, school_id uuid, school_inep text, grade_slug text, grade_name text, grade_stage text, grade_sort integer,
  school_year integer, version_number integer, version_id uuid, published_at timestamptz, item_count integer, is_demo boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, s.id, s.inep, g.slug, g.name, g.stage::text, g.sort_order, l.school_year, v.version_number, v.id, v.published_at, v.item_count,
         (s.is_demo or l.is_demo)
    from public.school_lists l
    join public.list_versions v on v.id = l.current_version_id and v.status = 'published'
    join public.schools s on s.id = l.school_id
    join public.municipalities m on m.id = s.municipality_id
    join public.grades g on g.id = l.grade_id
   where l.status = 'published'
     and m.is_enabled
     and s.verification_status <> 'suspended'
     and (p_coverage_ufs is null or m.uf = any (p_coverage_ufs))
     and (p_list_id is null or l.id = p_list_id)
     and (p_school_inep is null or s.inep = p_school_inep)
     and (p_year is null or l.school_year = p_year)
     and case p_environment
           when 'live' then (not s.is_demo and not l.is_demo)
           when 'test' then (s.is_demo or l.is_demo)
           else false
         end;
$$;

create function public.b2b_v1_school_base(
  p_environment text, p_coverage_ufs text[], p_inep text, p_city text, p_uf text, p_q text, p_has_lists boolean,
  p_after_name text, p_after_inep text, p_limit integer
)
returns table (
  school_id uuid, inep text, name text, normalized_name text, network text, neighborhood text, ibge_code text, muni_name text, uf text,
  verified boolean, is_demo boolean, published_lists_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(public.search_normalize(p_q), '');
begin
  if p_environment is null or p_environment not in ('live', 'test') then
    raise exception 'ambiente inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'limite inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  return query
    with base as (
      select s.id, s.inep, s.name, s.normalized_name, s.network::text as network, s.neighborhood, m.ibge_code, m.name as muni_name, m.uf,
             (s.verification_status = 'verified') as verified, s.is_demo,
             (select count(*)::integer from public.school_lists l join public.list_versions v on v.id = l.current_version_id and v.status = 'published'
               where l.school_id = s.id and l.status = 'published'
                 and case p_environment when 'live' then (not s.is_demo and not l.is_demo) else (s.is_demo or l.is_demo) end) as published_lists_count
        from public.schools s
        join public.municipalities m on m.id = s.municipality_id
       where m.is_enabled
         and s.verification_status <> 'suspended'
         and (p_coverage_ufs is null or m.uf = any (p_coverage_ufs))
         and (p_inep is null or s.inep = p_inep)
         and (p_city is null or m.ibge_code = p_city)
         and (p_uf is null or m.uf = p_uf)
         and (v_q is null or s.normalized_name like '%' || v_q || '%')
         and (p_after_name is null or (s.normalized_name, s.inep) > (p_after_name, coalesce(p_after_inep, '')))
         and case p_environment
               when 'live' then not s.is_demo
               else (s.is_demo or exists (
                 select 1 from public.school_lists l join public.list_versions v on v.id = l.current_version_id and v.status = 'published'
                  where l.school_id = s.id and l.status = 'published' and l.is_demo))
             end
    )
    select b.id, b.inep, b.name, b.normalized_name, b.network, b.neighborhood, b.ibge_code, b.muni_name, b.uf, b.verified, b.is_demo, b.published_lists_count
      from base b
     where p_has_lists is null or (p_has_lists = (b.published_lists_count > 0))
     order by b.normalized_name, b.inep
     limit p_limit;
end;
$$;

create function public.b2b_v1_school_json(r public.b2b_v1_school_base) returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'inep', r.inep, 'name', r.name, 'network', r.network, 'neighborhood', r.neighborhood,
    'municipality', jsonb_build_object('ibge_code', r.ibge_code, 'name', r.muni_name, 'uf', r.uf),
    'verified', r.verified, 'published_lists_count', r.published_lists_count, 'is_demo', r.is_demo);
$$;

create function public.b2b_v1_schools(
  p_environment text, p_coverage_ufs text[], p_city text, p_uf text, p_q text, p_has_lists boolean, p_after_name text, p_after_inep text, p_limit integer
) returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.b2b_v1_school_json(b) from public.b2b_v1_school_base(p_environment, p_coverage_ufs, null, p_city, p_uf, p_q, p_has_lists, p_after_name, p_after_inep, p_limit) b;
$$;

create function public.b2b_v1_school(p_environment text, p_coverage_ufs text[], p_inep text) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.b2b_v1_school_json(b) from public.b2b_v1_school_base(p_environment, p_coverage_ufs, p_inep, null, null, null, null, null, null, 1) b;
$$;

create function public.b2b_v1_list_json(r public.b2b_v1_visible_lists) returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.list_id, 'school_inep', r.school_inep,
    'grade', jsonb_build_object('slug', r.grade_slug, 'name', r.grade_name, 'stage', r.grade_stage),
    'school_year', r.school_year, 'version', r.version_number, 'published_at', r.published_at, 'item_count', r.item_count, 'is_demo', r.is_demo);
$$;

create function public.b2b_v1_school_lists(
  p_environment text, p_coverage_ufs text[], p_inep text, p_year integer, p_after_year integer, p_after_sort integer, p_after_id uuid, p_limit integer
) returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_environment is null or p_environment not in ('live', 'test') or p_inep is null then
    raise exception 'entrada inválida' using errcode = '22023', hint = 'invalid_input';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'limite inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  return query
    select public.b2b_v1_list_json(l)
      from public.b2b_v1_visible_lists(p_environment, p_coverage_ufs, null, p_inep, p_year) l
     where p_after_year is null
        or l.school_year < p_after_year
        or (l.school_year = p_after_year and (l.grade_sort > p_after_sort or (l.grade_sort = p_after_sort and l.list_id > p_after_id)))
     order by l.school_year desc, l.grade_sort, l.list_id
     limit p_limit;
end;
$$;

create function public.b2b_v1_list(p_environment text, p_coverage_ufs text[], p_list_id uuid) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.b2b_v1_list_json(l) from public.b2b_v1_visible_lists(p_environment, p_coverage_ufs, p_list_id, null, null) l limit 1;
$$;

create function public.b2b_v1_item_json(i public.list_items) returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('position', i.position, 'name', i.original_name, 'normalized_name', i.normalized_name,
                            'category', i.category, 'quantity', i.quantity, 'unit', i.unit);
$$;

create function public.b2b_v1_list_items(p_environment text, p_coverage_ufs text[], p_list_id uuid, p_after_position integer, p_limit integer) returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'limite inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  return query
    select public.b2b_v1_item_json(i)
      from public.b2b_v1_visible_lists(p_environment, p_coverage_ufs, p_list_id, null, null) l
      join public.list_items i on i.version_id = l.version_id
     where p_after_position is null or i.position > p_after_position
     order by i.position
     limit p_limit;
end;
$$;

-- Todos os itens da versão atual (para o casamento de SKUs no servidor; sem limite de página).
create function public.b2b_v1_list_match_items(p_environment text, p_coverage_ufs text[], p_list_id uuid) returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.b2b_v1_item_json(i)
    from public.b2b_v1_visible_lists(p_environment, p_coverage_ufs, p_list_id, null, null) l
    join public.list_items i on i.version_id = l.version_id
   order by i.position;
$$;

-- ---------------------------------------------------------------------------
-- Agregados do portal (B2B01/B2B02): chamadas no mês e hoje, erros, 429, casamento, listas disponíveis por ambiente,
-- série por dia e chaves mascaradas. Sem dado pessoal, sem key_hash.
-- ---------------------------------------------------------------------------
create function public.b2b_partner_overview(p_partner_id uuid, p_days integer default 30) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.b2b_partners%rowtype;
  v_today date := (now() at time zone 'America/Cuiaba')::date;
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_month date := date_trunc('month', (now() at time zone 'America/Cuiaba'))::date;
  v_from date := v_today - (v_days - 1);
  v_calls_month integer;
  v_calls_today integer;
  v_4xx integer;
  v_429 integer;
  v_mt integer;
  v_mm integer;
  v_live integer;
  v_test integer;
  v_series jsonb;
  v_keys jsonb;
begin
  select * into p from public.b2b_partners where id = p_partner_id;
  if not found then
    return null;
  end if;
  select coalesce(sum(request_count), 0) into v_calls_month from public.b2b_usage_daily u where u.partner_id = p_partner_id and u.day >= v_month and u.day <= v_today;
  select coalesce(sum(request_count), 0) into v_calls_today from public.b2b_usage_daily u where u.partner_id = p_partner_id and u.day = v_today;
  select coalesce(sum(request_count), 0) into v_4xx from public.b2b_usage_daily u where u.partner_id = p_partner_id and u.day = v_today and u.status_class = '4xx';
  select coalesce(sum(request_count), 0) into v_429 from public.b2b_usage_daily u where u.partner_id = p_partner_id and u.day = v_today and u.status_class = '429';
  select coalesce(sum(match_items_total), 0), coalesce(sum(match_items_matched), 0) into v_mt, v_mm
    from public.b2b_usage_daily u where u.partner_id = p_partner_id and u.day >= v_from and u.day <= v_today;
  select count(*)::integer into v_live from public.b2b_v1_visible_lists('live', p.coverage_ufs, null, null, null);
  select count(*)::integer into v_test from public.b2b_v1_visible_lists('test', p.coverage_ufs, null, null, null);
  select jsonb_agg(jsonb_build_object('day', d.day, 'count', coalesce(s.n, 0)) order by d.day) into v_series
    from generate_series(v_from, v_today, interval '1 day') d(day)
    left join (select u.day, sum(u.request_count)::integer as n from public.b2b_usage_daily u where u.partner_id = p_partner_id and u.day >= v_from group by u.day) s on s.day = d.day::date;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', k.id, 'environment', k.environment, 'public_id', k.public_id, 'last4', k.last4, 'scopes', to_jsonb(k.scopes), 'status', k.status,
           'expires_at', k.expires_at, 'created_at', k.created_at, 'rotated_from_id', k.rotated_from_id, 'revoked_at', k.revoked_at,
           'last_used_on', (select max(u.day) from public.b2b_usage_daily u where u.key_id = k.id)
         ) order by k.environment desc, k.created_at desc), '[]'::jsonb) into v_keys
    from public.b2b_api_keys k where k.partner_id = p_partner_id;
  return jsonb_build_object(
    'partner_id', p.id, 'status', p.status, 'plan', p.plan, 'coverage_ufs', to_jsonb(p.coverage_ufs),
    'limits', jsonb_build_object('test_rate_per_minute', p.test_rate_per_minute, 'test_rate_per_day', p.test_rate_per_day,
                                 'live_rate_per_minute', p.live_rate_per_minute, 'live_rate_per_day', p.live_rate_per_day),
    'calls_month', v_calls_month, 'calls_today', v_calls_today, 'errors_4xx_today', v_4xx, 'rate_limited_today', v_429,
    'match_total', v_mt, 'match_matched', v_mm, 'lists_available_live', v_live, 'lists_available_test', v_test,
    'calls_by_day', coalesce(v_series, '[]'::jsonb), 'keys', v_keys, 'today', v_today);
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger b2b_partners_set_updated_at before update on public.b2b_partners for each row execute function public.set_updated_at();
create trigger b2b_partner_members_set_updated_at before update on public.b2b_partner_members for each row execute function public.set_updated_at();
create trigger b2b_api_keys_set_updated_at before update on public.b2b_api_keys for each row execute function public.set_updated_at();
create trigger b2b_rate_windows_set_updated_at before update on public.b2b_rate_windows for each row execute function public.set_updated_at();
create trigger b2b_usage_daily_set_updated_at before update on public.b2b_usage_daily for each row execute function public.set_updated_at();

create trigger b2b_api_keys_zz_guard_update before update on public.b2b_api_keys for each row execute function public.b2b_api_keys_guard_update();
alter table public.b2b_api_keys enable always trigger b2b_api_keys_zz_guard_update;

create trigger b2b_partner_events_no_update_delete before update or delete on public.b2b_partner_events
  for each row execute function public.b2b_partner_events_block_mutation();
create trigger b2b_partner_events_no_truncate before truncate on public.b2b_partner_events
  for each statement execute function public.b2b_partner_events_block_mutation();
alter table public.b2b_partner_events enable always trigger b2b_partner_events_no_update_delete;
alter table public.b2b_partner_events enable always trigger b2b_partner_events_no_truncate;

-- auditoria: contact_name (contato adulto) e key_hash ficam fora do audit_log imutável.
create trigger b2b_partners_audit after insert or update or delete on public.b2b_partners
  for each row execute function public.audit_row_change('contact_name');
create trigger b2b_partner_members_audit after insert or update or delete on public.b2b_partner_members
  for each row execute function public.audit_row_change();
create trigger b2b_api_keys_audit after insert or update or delete on public.b2b_api_keys
  for each row execute function public.audit_row_change('key_hash');
alter table public.b2b_partners enable always trigger b2b_partners_audit;
alter table public.b2b_partner_members enable always trigger b2b_partner_members_audit;
alter table public.b2b_api_keys enable always trigger b2b_api_keys_audit;

-- ---------------------------------------------------------------------------
-- RLS: leitura do dono (membro do parceiro) e do admin; ninguém escreve direto.
-- ---------------------------------------------------------------------------
alter table public.b2b_partners enable row level security;
alter table public.b2b_partner_members enable row level security;
alter table public.b2b_partner_events enable row level security;
alter table public.b2b_api_keys enable row level security;
alter table public.b2b_rate_windows enable row level security;
alter table public.b2b_usage_daily enable row level security;

create policy b2b_partner_members_select_own_or_admin on public.b2b_partner_members for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.auth_role()) = 'admin');
comment on policy b2b_partner_members_select_own_or_admin on public.b2b_partner_members is 'S24: cada um vê o próprio vínculo; admin vê todos.';

create policy b2b_partners_select_member_or_admin on public.b2b_partners for select to authenticated
  using (
    exists (select 1 from public.b2b_partner_members m where m.partner_id = b2b_partners.id and m.profile_id = (select auth.uid()))
    or (select public.auth_role()) = 'admin'
  );
comment on policy b2b_partners_select_member_or_admin on public.b2b_partners is 'S24: membro lê o próprio parceiro; admin lê todos.';

create policy b2b_partner_events_select_member_or_admin on public.b2b_partner_events for select to authenticated
  using (
    exists (select 1 from public.b2b_partner_members m where m.partner_id = b2b_partner_events.partner_id and m.profile_id = (select auth.uid()))
    or (select public.auth_role()) = 'admin'
  );
comment on policy b2b_partner_events_select_member_or_admin on public.b2b_partner_events is 'S24: linha do tempo do próprio parceiro (sem actor_id no grant); admin lê todos.';

create policy b2b_api_keys_select_member_or_admin on public.b2b_api_keys for select to authenticated
  using (
    exists (select 1 from public.b2b_partner_members m where m.partner_id = b2b_api_keys.partner_id and m.profile_id = (select auth.uid()))
    or (select public.auth_role()) = 'admin'
  );
comment on policy b2b_api_keys_select_member_or_admin on public.b2b_api_keys is 'S24: chaves do próprio parceiro (mascaradas: key_hash e hash_version fora do grant); admin lê todas.';

create policy b2b_usage_daily_select_member_or_admin on public.b2b_usage_daily for select to authenticated
  using (
    exists (select 1 from public.b2b_partner_members m where m.partner_id = b2b_usage_daily.partner_id and m.profile_id = (select auth.uid()))
    or (select public.auth_role()) = 'admin'
  );
comment on policy b2b_usage_daily_select_member_or_admin on public.b2b_usage_daily is 'S24: uso agregado do próprio parceiro; admin lê todos.';
-- b2b_rate_windows: sem política e sem grant (só as funções tocam).

-- ---------------------------------------------------------------------------
-- Grants (mínimos). anon: nada. authenticated: select por RLS com colunas restritas. service_role: só select
-- (sem key_hash/hash_version); toda escrita passa pelas funções.
-- ---------------------------------------------------------------------------
revoke all on public.b2b_partners, public.b2b_partner_members, public.b2b_partner_events, public.b2b_api_keys,
  public.b2b_rate_windows, public.b2b_usage_daily from public, anon, authenticated, service_role;
grant select on public.b2b_partners to authenticated, service_role;
grant select on public.b2b_partner_members to authenticated, service_role;
grant select (id, partner_id, event_type, from_status, to_status, actor_role, reason, payload, created_at, updated_at) on public.b2b_partner_events to authenticated;
grant select on public.b2b_partner_events to service_role;
grant select (id, partner_id, environment, public_id, last4, scopes, status, expires_at, rotated_from_id, created_by, revoked_at, revoked_by, revoke_reason, created_at, updated_at)
  on public.b2b_api_keys to authenticated, service_role;
grant select on public.b2b_usage_daily to authenticated, service_role;

revoke execute on function public.b2b_partner_events_block_mutation() from public, anon, authenticated, service_role;
revoke execute on function public.b2b_api_keys_guard_update() from public, anon, authenticated, service_role;
revoke execute on function public.b2b_allowed_scopes(text) from public, anon, authenticated, service_role;
grant execute on function public.b2b_allowed_scopes(text) to service_role;
revoke execute on function public.b2b_valid_ufs(jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.b2b_keys_revoke_internal(uuid, public.b2b_key_environment, uuid, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.b2b_key_usable_count(uuid, public.b2b_key_environment) from public, anon, authenticated, service_role;
revoke execute on function public.b2b_v1_visible_lists(text, text[], uuid, text, integer) from public, anon, authenticated, service_role;
revoke execute on function public.b2b_v1_school_base(text, text[], text, text, text, text, boolean, text, text, integer) from public, anon, authenticated, service_role;
revoke execute on function public.b2b_v1_school_json(public.b2b_v1_school_base) from public, anon, authenticated, service_role;
revoke execute on function public.b2b_v1_list_json(public.b2b_v1_visible_lists) from public, anon, authenticated, service_role;
revoke execute on function public.b2b_v1_item_json(public.list_items) from public, anon, authenticated, service_role;

revoke execute on function public.b2b_partner_apply(uuid, jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.b2b_partner_apply(uuid, jsonb, text) to service_role;
revoke execute on function public.b2b_partner_decide(uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.b2b_partner_decide(uuid, uuid, text, jsonb) to service_role;
revoke execute on function public.b2b_key_create(uuid, uuid, text, text, text, smallint, text, text[]) from public, anon, authenticated, service_role;
grant execute on function public.b2b_key_create(uuid, uuid, text, text, text, smallint, text, text[]) to service_role;
revoke execute on function public.b2b_key_rotate(uuid, uuid, text, text, smallint, text, interval) from public, anon, authenticated, service_role;
grant execute on function public.b2b_key_rotate(uuid, uuid, text, text, smallint, text, interval) to service_role;
revoke execute on function public.b2b_key_revoke(uuid, text, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.b2b_key_revoke(uuid, text, uuid, text) to service_role;
revoke execute on function public.b2b_key_lookup(text) from public, anon, authenticated, service_role;
grant execute on function public.b2b_key_lookup(text) to service_role;
revoke execute on function public.b2b_rate_consume(uuid) from public, anon, authenticated, service_role;
grant execute on function public.b2b_rate_consume(uuid) to service_role;
revoke execute on function public.b2b_usage_record(uuid, text, text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.b2b_usage_record(uuid, text, text, integer, integer) to service_role;
revoke execute on function public.b2b_prune_rate_windows(interval) from public, anon, authenticated, service_role;
grant execute on function public.b2b_prune_rate_windows(interval) to service_role;
revoke execute on function public.b2b_v1_schools(text, text[], text, text, text, boolean, text, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.b2b_v1_schools(text, text[], text, text, text, boolean, text, text, integer) to service_role;
revoke execute on function public.b2b_v1_school(text, text[], text) from public, anon, authenticated, service_role;
grant execute on function public.b2b_v1_school(text, text[], text) to service_role;
revoke execute on function public.b2b_v1_school_lists(text, text[], text, integer, integer, integer, uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.b2b_v1_school_lists(text, text[], text, integer, integer, integer, uuid, integer) to service_role;
revoke execute on function public.b2b_v1_list(text, text[], uuid) from public, anon, authenticated, service_role;
grant execute on function public.b2b_v1_list(text, text[], uuid) to service_role;
revoke execute on function public.b2b_v1_list_items(text, text[], uuid, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.b2b_v1_list_items(text, text[], uuid, integer, integer) to service_role;
revoke execute on function public.b2b_v1_list_match_items(text, text[], uuid) from public, anon, authenticated, service_role;
grant execute on function public.b2b_v1_list_match_items(text, text[], uuid) to service_role;
revoke execute on function public.b2b_partner_overview(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.b2b_partner_overview(uuid, integer) to service_role;

comment on table public.b2b_partners is 'S24: parceiros B2B (varejista, marca, EdTech). Estado só por b2b_partner_decide. contact_name fora do audit_log e da API.';
comment on table public.b2b_api_keys is 'S24: chaves x-listacerta-key. Só o HMAC do segredo (pepper no servidor). Duas utilizáveis por ambiente (rotação).';
comment on table public.b2b_rate_windows is 'S24: janelas fixas do rate limit por (parceiro, ambiente). Só as funções tocam; podadas por b2b_prune_rate_windows.';
comment on table public.b2b_usage_daily is 'S24: uso agregado por chave/dia/endpoint/classe. Sem IP, UA, corpo, query ou SKU.';
comment on function public.b2b_key_lookup(text) is 'S24: lookup da chave pelo id público, sem cache; usable já considera status, expiração e estado do parceiro.';
comment on function public.b2b_rate_consume(uuid) is 'S24: consumo atômico do limite (advisory lock por parceiro e ambiente); revalida a chave; negada não consome.';
