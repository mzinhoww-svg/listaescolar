-- 0502_b2b_widget_webhooks: widget embutível e webhooks assinados do portal B2B (S25, trilha B2B, faixa 05xx).
-- Depende da 0501 (b2b_partners, b2b_partner_members), da 0103 (list_status_events) e da 0104 (claims).
-- Regras duras:
-- * eventos nascem SÓ de gatilhos AFTER sobre fatos que já existem (list_status_events, claims) — nenhum evento
--   inventado; o payload leva só dado público (nada de família, aluno, contato de escola ou perfil);
-- * o segredo de assinatura é gerado com CSPRNG no servidor (Node) e guardado CIFRADO (AES-256-GCM) aqui — nunca
--   em texto puro, nunca como hash simples (o servidor precisa decifrar para ASSINAR as próprias chamadas de
--   saída, ao contrário das chaves de API da S24, que só comparam hash de algo que o cliente apresenta);
-- * toda escrita é por função SECURITY DEFINER (search_path vazio, EXECUTE só service_role); ninguém escreve
--   direto nas tabelas; o log de tentativas de entrega é append-only (gatilho de guarda, enable always);
-- * authenticated lê por RLS (dono do parceiro ou admin) com grants por coluna (segredo cifrado nunca sai daqui).

create type public.b2b_webhook_event_type as enum ('list.published', 'list.updated', 'list.archived', 'school.approved');
create type public.b2b_webhook_delivery_status as enum ('queued', 'sending', 'sent', 'failed', 'dead');
create type public.b2b_webhook_endpoint_status as enum ('active', 'disabled');
create type public.b2b_webhook_attempt_outcome as enum ('sent', 'failed', 'skipped');

-- ---------------------------------------------------------------------------
-- Widget (B2B04): 1 configuração por parceiro. `cart_target_domain` é HOSTNAME PURO (sem esquema, caminho, porta
-- ou credencial): é o único ingrediente que o widget usa para montar `https://<domínio>/...` do carrinho — nunca
-- aceita URL vinda de fora (anti open-redirect).
-- ---------------------------------------------------------------------------
create table public.b2b_widget_configs (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null unique references public.b2b_partners (id) on delete cascade,
  accent_color text not null default '#0B6B4A' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  cart_target_domain text not null check (
    length(cart_target_domain) <= 255
    and cart_target_domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$'
  ),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger b2b_widget_configs_set_updated_at before update on public.b2b_widget_configs for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Webhooks (B2B05): até 3 endpoints por parceiro. `url` só https (exceto loopback local, só para o E2E; a
-- restrição por APP_ENV é feita no servidor, o banco não conhece APP_ENV — mesmo padrão de `push_subscriptions`
-- na 0602). O segredo nunca é gravado em claro: `secret_ciphertext`/`secret_iv`/`secret_tag` (AES-256-GCM, chave
-- só de servidor `B2B_WEBHOOK_ENCRYPTION_KEY`).
-- ---------------------------------------------------------------------------
create table public.b2b_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.b2b_partners (id) on delete cascade,
  url text not null check (
    length(url) <= 500
    and (url ~ '^https://[^\s/@]+(/[^\s]*)?$' or url ~ '^http://(127\.0\.0\.1|localhost)(:[0-9]+)?(/[^\s]*)?$')
  ),
  events public.b2b_webhook_event_type[] not null check (cardinality(events) between 1 and 4),
  status public.b2b_webhook_endpoint_status not null default 'active',
  secret_ciphertext bytea not null,
  secret_iv bytea not null check (length(secret_iv) = 12),
  secret_tag bytea not null check (length(secret_tag) = 16),
  secret_key_version smallint not null default 1 check (secret_key_version between 1 and 32767),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index b2b_webhook_endpoints_partner_idx on public.b2b_webhook_endpoints (partner_id);
create trigger b2b_webhook_endpoints_set_updated_at before update on public.b2b_webhook_endpoints for each row execute function public.set_updated_at();

-- Fila mutável (mesmo padrão de `notification_deliveries`, 0602): lease de 60 s, retry exponencial com teto,
-- dead letter em 24 h ou 10 tentativas. `event_id` é o id da linha imutável de origem (`list_status_events.id`
-- ou `claims.id`), então repetir o fato nunca duplica a entrega (unique por endpoint).
create table public.b2b_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.b2b_webhook_endpoints (id) on delete cascade,
  partner_id uuid not null references public.b2b_partners (id) on delete cascade,
  event_type public.b2b_webhook_event_type not null,
  event_id text not null check (length(event_id) between 1 and 120),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status public.b2b_webhook_delivery_status not null default 'queued',
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  lease_id uuid, -- dono da lease atual: só ele marca o resultado (marcação atrasada não sobrescreve)
  last_error_code text check (last_error_code is null or last_error_code ~ '^[a-z][a-z0-9_]{0,59}$'),
  last_response_status integer check (last_response_status is null or last_response_status between 100 and 599),
  sent_at timestamptz,
  created_at timestamptz not null default clock_timestamp(), -- ordem das entregas dentro de uma transação (mesmo padrão de list_status_events)
  updated_at timestamptz not null default now(),
  constraint b2b_webhook_deliveries_endpoint_event_key unique (endpoint_id, event_id)
);
create index b2b_webhook_deliveries_due_idx on public.b2b_webhook_deliveries (next_attempt_at) where status in ('queued', 'failed', 'sending');
create index b2b_webhook_deliveries_partner_idx on public.b2b_webhook_deliveries (partner_id, created_at desc);
create trigger b2b_webhook_deliveries_set_updated_at before update on public.b2b_webhook_deliveries for each row execute function public.set_updated_at();

-- Log de entregas append-only (o que a tela B2B05 lista em "Tentativas"): uma linha por tentativa HTTP real.
-- Nunca guarda corpo/mensagem do provedor, só status HTTP e um código de erro interno curto.
create table public.b2b_webhook_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.b2b_webhook_deliveries (id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  outcome public.b2b_webhook_attempt_outcome not null,
  http_status integer check (http_status is null or http_status between 100 and 599),
  error_code text check (error_code is null or error_code ~ '^[a-z][a-z0-9_]{0,59}$'),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index b2b_webhook_delivery_attempts_delivery_idx on public.b2b_webhook_delivery_attempts (delivery_id, created_at);
create trigger b2b_webhook_delivery_attempts_set_updated_at before update on public.b2b_webhook_delivery_attempts for each row execute function public.set_updated_at();

create function public.b2b_webhook_delivery_attempts_block_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'b2b_webhook_delivery_attempts é imutável (% bloqueado)', tg_op using errcode = '42501';
end;
$$;
create trigger b2b_webhook_delivery_attempts_immutable before update or delete on public.b2b_webhook_delivery_attempts
  for each row execute function public.b2b_webhook_delivery_attempts_block_mutation();
alter table public.b2b_webhook_delivery_attempts enable always trigger b2b_webhook_delivery_attempts_immutable;

-- Erros de EMISSÃO do evento (bug ao montar o payload nunca desfaz o fato real) — mesmo padrão de
-- `notification_emit_errors` (0602): só código, nunca mensagem.
create table public.b2b_webhook_emit_errors (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (length(event_type) between 1 and 60),
  sqlstate text not null check (sqlstate ~ '^[0-9A-Z]{5}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS e grants (mesmo padrão da 0501: authenticated lê por RLS, colunas restritas; toda escrita é função)
-- ---------------------------------------------------------------------------
alter table public.b2b_widget_configs enable row level security;
alter table public.b2b_webhook_endpoints enable row level security;
alter table public.b2b_webhook_deliveries enable row level security;
alter table public.b2b_webhook_delivery_attempts enable row level security;
alter table public.b2b_webhook_emit_errors enable row level security;

create policy b2b_widget_configs_select_member_or_admin on public.b2b_widget_configs for select to authenticated
  using (
    exists (select 1 from public.b2b_partner_members m where m.partner_id = b2b_widget_configs.partner_id and m.profile_id = (select auth.uid()))
    or (select public.auth_role()) = 'admin'
  );

create policy b2b_webhook_endpoints_select_member_or_admin on public.b2b_webhook_endpoints for select to authenticated
  using (
    exists (select 1 from public.b2b_partner_members m where m.partner_id = b2b_webhook_endpoints.partner_id and m.profile_id = (select auth.uid()))
    or (select public.auth_role()) = 'admin'
  );

create policy b2b_webhook_deliveries_select_member_or_admin on public.b2b_webhook_deliveries for select to authenticated
  using (
    exists (select 1 from public.b2b_partner_members m where m.partner_id = b2b_webhook_deliveries.partner_id and m.profile_id = (select auth.uid()))
    or (select public.auth_role()) = 'admin'
  );

create policy b2b_webhook_delivery_attempts_select_member_or_admin on public.b2b_webhook_delivery_attempts for select to authenticated
  using (
    exists (
      select 1 from public.b2b_webhook_deliveries d
        join public.b2b_partner_members m on m.partner_id = d.partner_id
       where d.id = b2b_webhook_delivery_attempts.delivery_id and m.profile_id = (select auth.uid())
    )
    or (select public.auth_role()) = 'admin'
  );

revoke all on public.b2b_widget_configs, public.b2b_webhook_endpoints, public.b2b_webhook_deliveries,
  public.b2b_webhook_delivery_attempts, public.b2b_webhook_emit_errors from public, anon, authenticated, service_role;

grant select on public.b2b_widget_configs to authenticated, service_role;

-- `secret_ciphertext`/`secret_iv`/`secret_tag`/`secret_key_version` NUNCA vão para `authenticated` (só service_role,
-- que decifra no servidor para assinar); `created_by` (uuid de perfil) também fora, mesmo padrão da 0501.
grant select (id, partner_id, url, events, status, created_at, updated_at) on public.b2b_webhook_endpoints to authenticated;
grant select on public.b2b_webhook_endpoints to service_role;

grant select (id, endpoint_id, partner_id, event_type, event_id, payload, status, attempts, next_attempt_at, last_error_code, last_response_status, sent_at, created_at, updated_at)
  on public.b2b_webhook_deliveries to authenticated;
grant select on public.b2b_webhook_deliveries to service_role;

grant select on public.b2b_webhook_delivery_attempts to authenticated, service_role;
grant select on public.b2b_webhook_emit_errors to service_role;

revoke execute on function public.b2b_webhook_delivery_attempts_block_mutation() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Widget: salvar (dono/admin) e ler pública (só service_role; o Route Handler do widget é quem chama)
-- ---------------------------------------------------------------------------
create function public.b2b_widget_config_save(p_actor_id uuid, p_partner_id uuid, p_accent_color text, p_cart_target_domain text, p_enabled boolean) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text := lower(btrim(coalesce(p_cart_target_domain, '')));
  v_color text := btrim(coalesce(p_accent_color, ''));
  v_id uuid;
begin
  if p_actor_id is null or not (
    exists (select 1 from public.b2b_partner_members m where m.partner_id = p_partner_id and m.profile_id = p_actor_id and m.member_role = 'owner')
    or exists (select 1 from public.profiles x where x.id = p_actor_id and x.role = 'admin')
  ) then
    raise exception 'só o dono ou admin configura o widget' using errcode = '42501', hint = 'forbidden';
  end if;
  if not exists (select 1 from public.b2b_partners p where p.id = p_partner_id) then
    raise exception 'parceiro não encontrado' using errcode = 'P0002', hint = 'not_found';
  end if;
  if v_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'cor inválida' using errcode = '22023', hint = 'invalid_input';
  end if;
  if length(v_domain) > 255 or v_domain !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$' then
    raise exception 'domínio do carrinho inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  insert into public.b2b_widget_configs (partner_id, accent_color, cart_target_domain, enabled)
  values (p_partner_id, v_color, v_domain, coalesce(p_enabled, false))
  on conflict (partner_id) do update set accent_color = excluded.accent_color, cart_target_domain = excluded.cart_target_domain, enabled = excluded.enabled
  returning id into v_id;
  return v_id;
end;
$$;

-- Config pública do widget (chamada pelo Route Handler `app/api/widget/config`, sem chave, sem sessão): só quando
-- ligado e o parceiro está em estado que atende (active/sandbox). `null` = widget indisponível (parceiro não
-- existe, desligado, ou fora de estado) — o Route Handler devolve 404 sem detalhe.
create function public.b2b_widget_config_public(p_partner_id uuid) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'partnerId', p.id, 'tradeName', p.trade_name, 'accentColor', c.accent_color,
    'cartTargetDomain', c.cart_target_domain, 'coverageUfs', to_jsonb(p.coverage_ufs)
  )
  from public.b2b_widget_configs c
  join public.b2b_partners p on p.id = c.partner_id
  where c.partner_id = p_partner_id and c.enabled and p.status in ('active', 'sandbox');
$$;

-- ---------------------------------------------------------------------------
-- Webhooks: endpoints (criar, atualizar, rotacionar e revelar segredo). O segredo em claro nunca chega aqui — só
-- o texto CIFRADO (calculado em Node com `B2B_WEBHOOK_ENCRYPTION_KEY`).
-- ---------------------------------------------------------------------------
create function public.b2b_webhook_require_owner_or_admin(p_actor_id uuid, p_partner_id uuid) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_actor_id is null or not (
    exists (select 1 from public.b2b_partner_members m where m.partner_id = p_partner_id and m.profile_id = p_actor_id and m.member_role = 'owner')
    or exists (select 1 from public.profiles x where x.id = p_actor_id and x.role = 'admin')
  ) then
    raise exception 'só o dono ou admin gerencia webhooks' using errcode = '42501', hint = 'forbidden';
  end if;
end;
$$;

create function public.b2b_webhook_endpoint_create(
  p_actor_id uuid, p_partner_id uuid, p_url text, p_events text[],
  p_secret_ciphertext bytea, p_secret_iv bytea, p_secret_tag bytea, p_key_version integer
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := btrim(coalesce(p_url, ''));
  v_events public.b2b_webhook_event_type[];
  v_id uuid;
begin
  perform public.b2b_webhook_require_owner_or_admin(p_actor_id, p_partner_id);
  if not exists (select 1 from public.b2b_partners p where p.id = p_partner_id and p.status in ('active', 'sandbox')) then
    raise exception 'parceiro precisa estar aprovado' using errcode = '23514', hint = 'invalid_state';
  end if;
  if v_url = '' or length(v_url) > 500 or not (v_url ~ '^https://[^\s/@]+(/[^\s]*)?$' or v_url ~ '^http://(127\.0\.0\.1|localhost)(:[0-9]+)?(/[^\s]*)?$') then
    raise exception 'URL do endpoint inválida' using errcode = '22023', hint = 'invalid_input';
  end if;
  begin
    select array_agg(distinct x::public.b2b_webhook_event_type) into v_events from unnest(p_events) x;
  exception when others then
    raise exception 'evento inválido' using errcode = '22023', hint = 'invalid_input';
  end;
  if v_events is null or cardinality(v_events) < 1 or cardinality(v_events) > 4 then
    raise exception 'selecione ao menos um evento' using errcode = '22023', hint = 'invalid_input';
  end if;
  if p_secret_ciphertext is null or p_secret_iv is null or p_secret_tag is null or length(p_secret_iv) <> 12 or length(p_secret_tag) <> 16 then
    raise exception 'segredo inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  if (select count(*) from public.b2b_webhook_endpoints e where e.partner_id = p_partner_id and e.status = 'active') >= 3 then
    raise exception 'limite de endpoints atingido' using errcode = '23514', hint = 'too_many_endpoints';
  end if;
  insert into public.b2b_webhook_endpoints (partner_id, url, events, secret_ciphertext, secret_iv, secret_tag, secret_key_version, created_by)
  values (p_partner_id, v_url, v_events, p_secret_ciphertext, p_secret_iv, p_secret_tag, coalesce(p_key_version, 1)::smallint, p_actor_id)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.b2b_webhook_endpoint_update(p_actor_id uuid, p_endpoint_id uuid, p_url text, p_events text[]) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner uuid;
  v_url text := btrim(coalesce(p_url, ''));
  v_events public.b2b_webhook_event_type[];
begin
  select partner_id into v_partner from public.b2b_webhook_endpoints where id = p_endpoint_id for update;
  if not found then
    raise exception 'endpoint não encontrado' using errcode = 'P0002', hint = 'not_found';
  end if;
  perform public.b2b_webhook_require_owner_or_admin(p_actor_id, v_partner);
  if v_url = '' or length(v_url) > 500 or not (v_url ~ '^https://[^\s/@]+(/[^\s]*)?$' or v_url ~ '^http://(127\.0\.0\.1|localhost)(:[0-9]+)?(/[^\s]*)?$') then
    raise exception 'URL do endpoint inválida' using errcode = '22023', hint = 'invalid_input';
  end if;
  begin
    select array_agg(distinct x::public.b2b_webhook_event_type) into v_events from unnest(p_events) x;
  exception when others then
    raise exception 'evento inválido' using errcode = '22023', hint = 'invalid_input';
  end;
  if v_events is null or cardinality(v_events) < 1 or cardinality(v_events) > 4 then
    raise exception 'selecione ao menos um evento' using errcode = '22023', hint = 'invalid_input';
  end if;
  update public.b2b_webhook_endpoints set url = v_url, events = v_events where id = p_endpoint_id;
end;
$$;

create function public.b2b_webhook_secret_rotate(p_actor_id uuid, p_endpoint_id uuid, p_secret_ciphertext bytea, p_secret_iv bytea, p_secret_tag bytea, p_key_version integer) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner uuid;
begin
  select partner_id into v_partner from public.b2b_webhook_endpoints where id = p_endpoint_id for update;
  if not found then
    raise exception 'endpoint não encontrado' using errcode = 'P0002', hint = 'not_found';
  end if;
  perform public.b2b_webhook_require_owner_or_admin(p_actor_id, v_partner);
  if p_secret_ciphertext is null or p_secret_iv is null or p_secret_tag is null or length(p_secret_iv) <> 12 or length(p_secret_tag) <> 16 then
    raise exception 'segredo inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  update public.b2b_webhook_endpoints
     set secret_ciphertext = p_secret_ciphertext, secret_iv = p_secret_iv, secret_tag = p_secret_tag, secret_key_version = coalesce(p_key_version, 1)::smallint
   where id = p_endpoint_id;
end;
$$;

-- "Revelar" (fiel à tela B2B05): decifra sob demanda, só para o dono/admin. Nunca logado pelo chamador.
create function public.b2b_webhook_secret_reveal(p_actor_id uuid, p_endpoint_id uuid)
returns table (secret_ciphertext bytea, secret_iv bytea, secret_tag bytea, secret_key_version smallint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner uuid;
begin
  select partner_id into v_partner from public.b2b_webhook_endpoints where id = p_endpoint_id;
  if not found then
    raise exception 'endpoint não encontrado' using errcode = 'P0002', hint = 'not_found';
  end if;
  perform public.b2b_webhook_require_owner_or_admin(p_actor_id, v_partner);
  return query select e.secret_ciphertext, e.secret_iv, e.secret_tag, e.secret_key_version from public.b2b_webhook_endpoints e where e.id = p_endpoint_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enfileiramento interno (chamado só pelos gatilhos abaixo). Filtra por parceiro apto, evento assinado e
-- cobertura por UF (nacional = sem filtro). Idempotente pelo unique (endpoint_id, event_id).
-- ---------------------------------------------------------------------------
create function public.b2b_webhook_enqueue(p_event_type public.b2b_webhook_event_type, p_event_id text, p_uf text, p_payload jsonb) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  insert into public.b2b_webhook_deliveries (endpoint_id, partner_id, event_type, event_id, payload)
  select e.id, e.partner_id, p_event_type, p_event_id, p_payload
    from public.b2b_webhook_endpoints e
    join public.b2b_partners p on p.id = e.partner_id
   where e.status = 'active'
     and p.status in ('active', 'sandbox')
     and p_event_type = any (e.events)
     and (p.coverage_ufs is null or p_uf is null or p_uf = any (p.coverage_ufs))
  on conflict (endpoint_id, event_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Gatilhos: eventos reais (S25, Global Constraints). Erro ao montar o payload NUNCA desfaz o fato.
-- ---------------------------------------------------------------------------
create function public.webhook_on_list_status_event() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list record;
  v_school record;
  v_grade record;
  v_version record;
  v_event public.b2b_webhook_event_type;
  v_payload jsonb;
begin
  if new.to_status = 'published' then
    v_event := case when new.from_status is null then 'list.updated' else 'list.published' end;
  elsif new.to_status = 'archived' then
    v_event := 'list.archived';
  else
    return null;
  end if;

  select l.id as list_id, l.school_id, l.grade_id, l.school_year, l.published_at, l.archived_at
    into v_list from public.school_lists l where l.id = new.list_id;
  if not found then
    return null;
  end if;
  select s.inep, s.name, m.uf into v_school from public.schools s join public.municipalities m on m.id = s.municipality_id where s.id = v_list.school_id;
  select g.slug, g.name into v_grade from public.grades g where g.id = v_list.grade_id;
  if new.version_id is not null then
    select v.version_number, v.item_count into v_version from public.list_versions v where v.id = new.version_id;
  end if;

  v_payload := jsonb_build_object(
    'school', jsonb_build_object('inep', v_school.inep, 'name', v_school.name),
    'grade', jsonb_build_object('slug', v_grade.slug, 'name', v_grade.name),
    'school_year', v_list.school_year,
    'list_id', v_list.list_id,
    'public_url', '/escolas/' || v_school.inep || '/' || v_grade.slug || '?ano=' || v_list.school_year::text
  );
  if v_event in ('list.published', 'list.updated') then
    v_payload := v_payload || jsonb_build_object(
      'version_id', new.version_id, 'version_number', v_version.version_number, 'item_count', v_version.item_count, 'published_at', v_list.published_at
    );
  else
    v_payload := v_payload || jsonb_build_object('archived_at', v_list.archived_at);
  end if;

  perform public.b2b_webhook_enqueue(v_event, new.id::text, v_school.uf, v_payload);
  return null;
exception when others then
  insert into public.b2b_webhook_emit_errors (event_type, sqlstate) values (coalesce(v_event::text, 'list_status_event'), sqlstate);
  raise warning 'b2b_webhook_emit_error %', sqlstate;
  return null;
end;
$$;
create trigger webhook_on_list_status_event after insert on public.list_status_events
  for each row execute function public.webhook_on_list_status_event();
alter table public.list_status_events enable always trigger webhook_on_list_status_event;

create function public.webhook_on_claim_approved() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school record;
begin
  select s.inep, s.name, m.uf into v_school from public.schools s join public.municipalities m on m.id = s.municipality_id where s.id = new.school_id;
  if not found then
    return null;
  end if;
  perform public.b2b_webhook_enqueue(
    'school.approved', new.id::text || ':approved', v_school.uf,
    jsonb_build_object('school', jsonb_build_object('inep', v_school.inep, 'name', v_school.name), 'approved_at', now())
  );
  return null;
exception when others then
  insert into public.b2b_webhook_emit_errors (event_type, sqlstate) values ('school.approved', sqlstate);
  raise warning 'b2b_webhook_emit_error %', sqlstate;
  return null;
end;
$$;
create trigger webhook_on_claim_approved after update of status on public.claims
  for each row when (new.status = 'approved' and old.status is distinct from 'approved') execute function public.webhook_on_claim_approved();
alter table public.claims enable always trigger webhook_on_claim_approved;

-- ---------------------------------------------------------------------------
-- Despacho: lease de 60 s, retry exponencial com teto (6 h), dead letter em 24 h ou 10 tentativas.
-- ---------------------------------------------------------------------------
create function public.b2b_webhook_claim_deliveries(p_limit int) returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit not between 1 and 50 then
    raise exception 'limite inválido' using errcode = '22023';
  end if;
  -- lease vencida na 10ª tentativa: encerra (nunca retoma `sending` para sempre)
  update public.b2b_webhook_deliveries
     set status = 'dead', locked_until = null, lease_id = null, last_error_code = 'lease_expired'
   where status = 'sending' and locked_until < now() and attempts >= 10;
  return query
  with c as (
    select d.id from public.b2b_webhook_deliveries d
     where (d.status in ('queued', 'failed') and d.next_attempt_at <= now() and (d.locked_until is null or d.locked_until < now()))
        or (d.status = 'sending' and d.locked_until < now() and d.attempts < 10)
     order by d.next_attempt_at, d.id limit p_limit for update skip locked
  ), u as (
    update public.b2b_webhook_deliveries d
       set status = 'sending', locked_until = now() + interval '60 seconds', attempts = d.attempts + 1, lease_id = gen_random_uuid()
      from c where d.id = c.id returning d.*
  )
  select jsonb_build_object(
      'id', u.id, 'leaseId', u.lease_id, 'attempts', u.attempts, 'eventType', u.event_type, 'eventId', u.event_id, 'payload', u.payload,
      'createdAt', u.created_at, 'url', e.url,
      'secret', jsonb_build_object('ciphertext', encode(e.secret_ciphertext, 'base64'), 'iv', encode(e.secret_iv, 'base64'), 'tag', encode(e.secret_tag, 'base64'), 'keyVersion', e.secret_key_version)
    )
    from u join public.b2b_webhook_endpoints e on e.id = u.endpoint_id;
end;
$$;

create function public.b2b_webhook_mark_delivery(p_id uuid, p_lease uuid, p_outcome text, p_http_status int, p_error_code text, p_duration_ms int) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
  v_created_at timestamptz;
  v_dead boolean;
begin
  if p_outcome is null or p_outcome not in ('sent', 'transient', 'permanent') then
    raise exception 'resultado inválido' using errcode = '22023';
  end if;
  if p_error_code is not null and p_error_code !~ '^[a-z][a-z0-9_]{0,59}$' then
    raise exception 'código inválido' using errcode = '22023';
  end if;
  -- só o dono da lease vigente marca (marcação atrasada de outro despachante é ignorada)
  select d.attempts, d.created_at into v_attempts, v_created_at from public.b2b_webhook_deliveries d
   where d.id = p_id and d.status = 'sending' and d.lease_id is not null and d.lease_id = p_lease for update;
  if not found then
    return false;
  end if;
  v_dead := p_outcome = 'permanent' or v_attempts >= 10 or (now() - v_created_at) >= interval '24 hours';
  update public.b2b_webhook_deliveries set
    status = (case p_outcome when 'sent' then 'sent' when 'permanent' then 'dead' else case when v_dead then 'dead' else 'failed' end end)::public.b2b_webhook_delivery_status,
    sent_at = case when p_outcome = 'sent' then now() else sent_at end,
    next_attempt_at = case when p_outcome = 'transient' and not v_dead then now() + make_interval(mins => least(360, (2 ^ greatest(v_attempts - 1, 0))::int)) else next_attempt_at end,
    locked_until = null,
    lease_id = null,
    last_error_code = case when p_outcome = 'sent' then null else p_error_code end,
    last_response_status = coalesce(p_http_status, last_response_status)
   where id = p_id;
  insert into public.b2b_webhook_delivery_attempts (delivery_id, attempt_number, outcome, http_status, error_code, duration_ms)
  values (p_id, v_attempts, (case p_outcome when 'sent' then 'sent' else 'failed' end)::public.b2b_webhook_attempt_outcome, p_http_status, p_error_code, p_duration_ms);
  return true;
end;
$$;

-- Reenvio manual (B2B05 "Reenviar"): nova linha de entrega, histórico da original intacto.
create function public.b2b_webhook_resend(p_actor_id uuid, p_delivery_id uuid) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.b2b_webhook_deliveries%rowtype;
  v_id uuid;
begin
  select * into v_row from public.b2b_webhook_deliveries where id = p_delivery_id;
  if not found then
    raise exception 'entrega não encontrada' using errcode = 'P0002', hint = 'not_found';
  end if;
  perform public.b2b_webhook_require_owner_or_admin(p_actor_id, v_row.partner_id);
  if v_row.status not in ('failed', 'dead') then
    raise exception 'só entregas com falha podem ser reenviadas' using errcode = '23514', hint = 'invalid_state';
  end if;
  insert into public.b2b_webhook_deliveries (endpoint_id, partner_id, event_type, event_id, payload)
  values (v_row.endpoint_id, v_row.partner_id, v_row.event_type, v_row.event_id || ':resend:' || gen_random_uuid()::text, v_row.payload)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.b2b_webhook_purge_old(p_days int) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if p_days is null or p_days < 1 then
    raise exception 'dias inválidos' using errcode = '22023';
  end if;
  delete from public.b2b_webhook_deliveries where status in ('sent', 'dead') and updated_at < now() - make_interval(days => p_days);
  get diagnostics n = row_count;
  delete from public.b2b_webhook_emit_errors where created_at < now() - interval '90 days';
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilégios: EXECUTE só service_role (gatilhos e auxiliares internas: ninguém)
-- ---------------------------------------------------------------------------
revoke execute on function
  public.b2b_widget_config_save(uuid, uuid, text, text, boolean), public.b2b_widget_config_public(uuid),
  public.b2b_webhook_require_owner_or_admin(uuid, uuid),
  public.b2b_webhook_endpoint_create(uuid, uuid, text, text[], bytea, bytea, bytea, integer),
  public.b2b_webhook_endpoint_update(uuid, uuid, text, text[]),
  public.b2b_webhook_secret_rotate(uuid, uuid, bytea, bytea, bytea, integer), public.b2b_webhook_secret_reveal(uuid, uuid),
  public.b2b_webhook_enqueue(public.b2b_webhook_event_type, text, text, jsonb),
  public.webhook_on_list_status_event(), public.webhook_on_claim_approved(),
  public.b2b_webhook_claim_deliveries(int), public.b2b_webhook_mark_delivery(uuid, uuid, text, int, text, int),
  public.b2b_webhook_resend(uuid, uuid), public.b2b_webhook_purge_old(int)
  from public, anon, authenticated, service_role;
grant execute on function
  public.b2b_widget_config_save(uuid, uuid, text, text, boolean), public.b2b_widget_config_public(uuid),
  public.b2b_webhook_endpoint_create(uuid, uuid, text, text[], bytea, bytea, bytea, integer),
  public.b2b_webhook_endpoint_update(uuid, uuid, text, text[]),
  public.b2b_webhook_secret_rotate(uuid, uuid, bytea, bytea, bytea, integer), public.b2b_webhook_secret_reveal(uuid, uuid),
  public.b2b_webhook_claim_deliveries(int), public.b2b_webhook_mark_delivery(uuid, uuid, text, int, text, int),
  public.b2b_webhook_resend(uuid, uuid), public.b2b_webhook_purge_old(int)
  to service_role;
