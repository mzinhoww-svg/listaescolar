-- 0302_stationeries: papelarias, membros, áreas atendidas, catálogo e trilha de eventos de status (S13, trilha Comércio).
-- Sem FK para tabelas de outras trilhas (ADR-004): só municipalities, profiles e tabelas desta migration.
-- Regras de produto: preço e estoque do catálogo são sempre "informados pela papelaria" (nunca inventados);
-- dados de contato e cadastro (cnpj, razão social, e-mail, telefone, motivo) nunca chegam ao público.
-- Escrita de status só pela função stationery_transition (SECURITY DEFINER, só service_role): o cliente
-- (dono ou admin) nunca escreve status direto. Cadastro (insert de papelaria/membro) é do servidor (service_role).
-- Papelaria não é apagada: sai por status (suspended/rejected). O rastro de eventos é imutável (FK restrict).
-- O cliente (authenticated) escreve só colunas cadastrais (grants por coluna); datas e chaves são do banco.

create type public.stationery_member_role as enum ('owner', 'staff');
create type public.catalog_stock_status as enum ('in_stock', 'out_of_stock', 'unknown');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.stationeries (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  trade_name text not null check (btrim(trade_name) <> '' and length(trade_name) <= 120),
  legal_name text check (legal_name is null or (btrim(legal_name) <> '' and length(legal_name) <= 200)),
  cnpj text not null unique check (cnpj ~ '^[0-9A-Z]{14}$'), -- numérico ou alfanumérico (IN RFB 2.229/2024); dígitos verificadores no domínio
  status public.stationery_status not null default 'signup',
  municipality_id uuid not null references public.municipalities (id) on delete restrict,
  neighborhood text check (neighborhood is null or length(neighborhood) <= 120),
  address text check (address is null or length(address) <= 200),
  cep text check (cep is null or cep ~ '^[0-9]{8}$'),
  whatsapp text check (whatsapp is null or whatsapp ~ '^\+55[0-9]{10,11}$'), -- E.164 BR
  phone text check (phone is null or phone ~ '^\+55[0-9]{10,11}$'),
  email text check (email is null or (email ~ '^[^@\s]+@[^@\s]+$' and length(email) <= 254)),
  offers_pickup boolean not null default false,
  offers_delivery boolean not null default false,
  service_radius_km integer not null default 0 check (service_radius_km between 0 and 50),
  opening_hours text check (opening_hours is null or length(opening_hours) <= 300),
  payment_methods text[] not null default '{}'
    check (payment_methods <@ array['pix', 'credit_card', 'debit_card', 'cash', 'boleto']::text[]),
  lgpd_accepted_at timestamptz,
  lgpd_text_version text check (lgpd_text_version is null or btrim(lgpd_text_version) <> ''),
  status_reason text check (status_reason is null or length(status_reason) <= 500),
  paused_by text check (paused_by in ('owner', 'admin')), -- quem pausou; só o dono retoma o que ele mesmo pausou
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index stationeries_municipality_id_idx on public.stationeries (municipality_id);
create index stationeries_status_idx on public.stationeries (status);

create table public.stationery_members (
  id uuid primary key default gen_random_uuid(),
  stationery_id uuid not null references public.stationeries (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  member_role public.stationery_member_role not null, -- sem default: o papel é sempre explícito
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stationery_id, profile_id)
);
create index stationery_members_profile_id_idx on public.stationery_members (profile_id);
-- MVP: um perfil é dono de no máximo uma papelaria, e cada papelaria tem um dono.
create unique index stationery_members_one_owner_per_profile on public.stationery_members (profile_id)
  where member_role = 'owner';
create unique index stationery_members_one_owner_per_stationery on public.stationery_members (stationery_id)
  where member_role = 'owner';

create table public.stationery_areas (
  id uuid primary key default gen_random_uuid(),
  stationery_id uuid not null references public.stationeries (id) on delete cascade,
  municipality_id uuid not null references public.municipalities (id) on delete restrict,
  neighborhood text not null check (neighborhood <> '' and neighborhood = lower(btrim(neighborhood)) and length(neighborhood) <= 120), -- chave normalizada (sem acento, minúscula)
  display_name text check (display_name is null or (btrim(display_name) <> '' and length(display_name) <= 120)), -- texto como o dono digitou
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stationery_id, municipality_id, neighborhood)
);
create index stationery_areas_municipality_id_idx on public.stationery_areas (municipality_id);

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  stationery_id uuid not null references public.stationeries (id) on delete cascade,
  name text not null check (btrim(name) <> '' and length(name) <= 200),
  item_key text not null check (btrim(item_key) <> '' and item_key = lower(btrim(item_key)) and length(item_key) <= 200), -- nome normalizado (mesma regra da S12)
  price_cents integer not null check (price_cents > 0 and price_cents <= 100000000),
  price_source text not null default 'informed_by_stationery' check (price_source = 'informed_by_stationery'),
  stock_status public.catalog_stock_status not null default 'unknown',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  price_updated_at timestamptz not null default now(), -- data do preço informado: só o trigger escreve (insert e mudança de price_cents)
  updated_at timestamptz not null default now(),
  unique (stationery_id, item_key)
);
create index catalog_items_item_key_idx on public.catalog_items (item_key);

create table public.stationery_status_events (
  id uuid primary key default gen_random_uuid(),
  stationery_id uuid not null references public.stationeries (id) on delete restrict,
  from_status public.stationery_status not null,
  to_status public.stationery_status not null,
  actor_id uuid, -- sem FK: o rastro sobrevive à remoção do usuário
  actor_role text not null check (actor_role in ('owner', 'admin', 'system')),
  reason text check (reason is null or length(reason) <= 500),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index stationery_status_events_stationery_idx on public.stationery_status_events (stationery_id, created_at);

-- ---------------------------------------------------------------------------
-- Funções
-- ---------------------------------------------------------------------------
-- Guarda de UPDATE em stationeries (SECURITY INVOKER: current_user reflete o chamador).
-- status, status_reason e paused_by só mudam pela função de transição (executa como postgres).
create function public.stationeries_guard_update() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  caller text := coalesce(public.auth_role()::text, ''); -- sem profile: '' (falha fechado)
  privileged boolean := current_user in ('postgres', 'supabase_admin');
begin
  if not privileged and (
    new.status is distinct from old.status
    or new.status_reason is distinct from old.status_reason
    or new.paused_by is distinct from old.paused_by
  ) then
    raise exception 'status só muda por stationery_transition' using errcode = '42501';
  end if;
  if not (privileged or caller in ('admin', 'system')) then
    if new.is_demo is distinct from old.is_demo then
      raise exception 'is_demo só muda por admin' using errcode = '42501';
    end if;
    if new.slug is distinct from old.slug then
      raise exception 'slug só muda por admin' using errcode = '42501';
    end if;
    if new.cnpj is distinct from old.cnpj and old.status not in ('signup', 'accreditation', 'rejected') then
      raise exception 'cnpj não muda depois do envio para análise' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- eventos são imutáveis (update, delete e truncate); a FK restrict impede apagar a papelaria com histórico.
create function public.stationery_events_block_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'stationery_status_events é imutável (% bloqueado)', tg_op using errcode = '42501';
end;
$$;

-- Datas do catálogo, só do banco (roda para todos, inclusive service_role): insert nasce com created_at,
-- updated_at e price_updated_at = agora; update preserva created_at e só renova price_updated_at se o preço mudar
-- (estoque e nome não renovam). clock_timestamp: cada comando enxerga a própria hora, mesmo dentro de uma transação.
create function public.catalog_items_set_dates() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
    new.price_updated_at := new.created_at;
  else
    new.created_at := old.created_at;
    new.updated_at := clock_timestamp();
    new.price_updated_at := case when new.price_cents is distinct from old.price_cents
                                 then clock_timestamp() else old.price_updated_at end;
  end if;
  return new;
end;
$$;

-- papelaria pública? (SECURITY DEFINER: as políticas públicas de áreas e catálogo não leem a base.)
create function public.stationery_is_active(p_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.stationeries s where s.id = p_id and s.status = 'active');
$$;

-- ---------------------------------------------------------------------------
-- Escritas atômicas do servidor (SECURITY DEFINER, só service_role). Cada uma faz em UMA transação o que o
-- repositório antes fazia em vários passos: cadastro completo, áreas, catálogo e aceite LGPD. O erro sai com
-- errcode + hint estáveis (o repositório mapeia por hint): forbidden, invalid_state, not_found, invalid_input,
-- consent_required, cnpj_taken, already_owner, limit_exceeded.
-- ---------------------------------------------------------------------------

-- Cadastro: papelaria (signup) + dono + áreas + aceite LGPD, tudo ou nada. O aceite é obrigatório; a data é do
-- servidor (now()) e a versão do texto vem de constante do servidor. Mesmo dono + mesmo CNPJ (duplo envio) devolve o
-- cadastro existente; outro CNPJ para quem já é dono é already_owner; CNPJ de outro dono é cnpj_taken.
-- Áreas: jsonb [{"key": "sao jose", "label": "São José"}] (a normalização é do domínio, uma só).
create function public.stationery_register(
  p_owner_id uuid,
  p_slug text,
  p_trade_name text,
  p_legal_name text,
  p_cnpj text,
  p_municipality_id uuid,
  p_neighborhood text,
  p_address text default null,
  p_cep text default null,
  p_whatsapp text default null,
  p_phone text default null,
  p_email text default null,
  p_offers_pickup boolean default false,
  p_offers_delivery boolean default false,
  p_service_radius_km integer default 0,
  p_opening_hours text default null,
  p_payment_methods text[] default '{}',
  p_areas jsonb default '[]',
  p_lgpd_text_version text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version text := nullif(btrim(coalesce(p_lgpd_text_version, '')), '');
  v_existing public.stationeries%rowtype;
  v_id uuid;
  v_slug text;
  v_try integer := 0;
  v_constraint text;
begin
  if v_version is null then
    raise exception 'aceite LGPD obrigatório' using errcode = '22023', hint = 'consent_required';
  end if;
  if p_owner_id is null or not exists (select 1 from public.profiles p where p.id = p_owner_id) then
    raise exception 'dono inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  -- só conta de responsável (parent) cadastra papelaria; o servidor confere, o SQL confere de novo.
  if not exists (select 1 from public.profiles p where p.id = p_owner_id and p.role = 'parent') then
    raise exception 'só responsável (parent) cadastra papelaria' using errcode = '42501', hint = 'forbidden';
  end if;

  -- duplo envio do mesmo dono se serializa aqui.
  perform pg_advisory_xact_lock(hashtextextended('stationery_register:' || p_owner_id::text, 0));
  select s.* into v_existing
    from public.stationeries s join public.stationery_members m on m.stationery_id = s.id
   where m.profile_id = p_owner_id and m.member_role = 'owner';
  if found then
    if v_existing.cnpj = p_cnpj then
      return jsonb_build_object('id', v_existing.id, 'slug', v_existing.slug, 'created', false);
    end if;
    raise exception 'usuário já é dono de uma papelaria' using errcode = '23505', hint = 'already_owner';
  end if;

  loop
    v_slug := case when v_try = 0 then p_slug else left(p_slug, 75) || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 4) end;
    begin
      insert into public.stationeries (
        slug, trade_name, legal_name, cnpj, municipality_id, neighborhood, address, cep, whatsapp, phone, email,
        offers_pickup, offers_delivery, service_radius_km, opening_hours, payment_methods,
        lgpd_accepted_at, lgpd_text_version
      ) values (
        v_slug, p_trade_name, p_legal_name, p_cnpj, p_municipality_id, p_neighborhood, p_address, p_cep, p_whatsapp, p_phone, p_email,
        coalesce(p_offers_pickup, false), coalesce(p_offers_delivery, false), coalesce(p_service_radius_km, 0), p_opening_hours,
        coalesce(p_payment_methods, '{}'), now(), v_version
      ) returning id into v_id;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'stationeries_cnpj_key' then
        raise exception 'CNPJ já cadastrado' using errcode = '23505', hint = 'cnpj_taken';
      end if;
      if v_constraint is distinct from 'stationeries_slug_key' or v_try >= 5 then
        raise;
      end if;
      v_try := v_try + 1;
    end;
  end loop;

  insert into public.stationery_members (stationery_id, profile_id, member_role) values (v_id, p_owner_id, 'owner');

  insert into public.stationery_areas (stationery_id, municipality_id, neighborhood, display_name)
  select distinct on (a ->> 'key') v_id, p_municipality_id, a ->> 'key', nullif(btrim(a ->> 'label'), '')
    from jsonb_array_elements(coalesce(p_areas, '[]'::jsonb)) a
   where coalesce(a ->> 'key', '') <> ''
   order by a ->> 'key';

  return jsonb_build_object('id', v_id, 'slug', v_slug, 'created', true);
end;
$$;

-- Aceite LGPD gravado depois do cadastro (quando faltou): só o dono, só antes da análise (signup, accreditation,
-- rejected). Data do servidor; versão do texto vem da constante do servidor.
create function public.stationery_record_consent(p_id uuid, p_actor_id uuid, p_text_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.stationeries%rowtype;
  v_version text := nullif(btrim(coalesce(p_text_version, '')), '');
begin
  if v_version is null then
    raise exception 'versão do texto obrigatória' using errcode = '22023', hint = 'consent_required';
  end if;
  select * into s from public.stationeries where id = p_id for no key update;
  if not found then
    raise exception 'papelaria não encontrada' using errcode = 'P0002', hint = 'not_found';
  end if;
  if p_actor_id is null or not exists (
    select 1 from public.stationery_members m where m.stationery_id = p_id and m.profile_id = p_actor_id and m.member_role = 'owner'
  ) then
    raise exception 'ator não é o dono desta papelaria' using errcode = '42501', hint = 'forbidden';
  end if;
  if s.status not in ('signup', 'accreditation', 'rejected') then
    raise exception 'aceite não pode ser registrado em %', s.status using errcode = '23514', hint = 'invalid_state';
  end if;
  update public.stationeries set lgpd_accepted_at = now(), lgpd_text_version = v_version where id = p_id;
end;
$$;

-- Substitui as áreas atendidas do município da papelaria. Trava a linha (FOR SHARE: transição concorrente espera) e
-- confere posse e estado na mesma transação da escrita, sem janela entre checagem e gravação.
create function public.stationery_replace_areas(p_id uuid, p_actor_id uuid, p_areas jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.stationeries%rowtype;
  v_wanted jsonb := coalesce(p_areas, '[]'::jsonb);
begin
  select * into s from public.stationeries where id = p_id for share;
  if not found then
    raise exception 'papelaria não encontrada' using errcode = 'P0002', hint = 'not_found';
  end if;
  if p_actor_id is null or not exists (
    select 1 from public.stationery_members m where m.stationery_id = p_id and m.profile_id = p_actor_id
  ) then
    raise exception 'papelaria não encontrada para este usuário' using errcode = '42501', hint = 'forbidden';
  end if;
  if s.status not in ('signup', 'accreditation', 'approved', 'active', 'paused', 'rejected') then
    raise exception 'áreas não podem mudar em %', s.status using errcode = '23514', hint = 'invalid_state';
  end if;
  delete from public.stationery_areas a
   where a.stationery_id = p_id and a.municipality_id = s.municipality_id
     and a.neighborhood not in (select w ->> 'key' from jsonb_array_elements(v_wanted) w where coalesce(w ->> 'key', '') <> '');
  insert into public.stationery_areas (stationery_id, municipality_id, neighborhood, display_name)
  select distinct on (w ->> 'key') p_id, s.municipality_id, w ->> 'key', nullif(btrim(w ->> 'label'), '')
    from jsonb_array_elements(v_wanted) w
   where coalesce(w ->> 'key', '') <> ''
   order by w ->> 'key'
  on conflict (stationery_id, municipality_id, neighborhood) do update set display_name = excluded.display_name;
end;
$$;

-- Insere ou atualiza itens do catálogo por (papelaria, item_key), em uma transação, com posse e estado
-- conferidos sob trava. Itens: jsonb [{"name","item_key","price_cents","stock_status"}]. Devolve quantos itens.
create function public.stationery_upsert_catalog(p_id uuid, p_actor_id uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.stationeries%rowtype;
  v_count integer;
begin
  select * into s from public.stationeries where id = p_id for share;
  if not found then
    raise exception 'papelaria não encontrada' using errcode = 'P0002', hint = 'not_found';
  end if;
  if p_actor_id is null or not exists (
    select 1 from public.stationery_members m where m.stationery_id = p_id and m.profile_id = p_actor_id
  ) then
    raise exception 'papelaria não encontrada para este usuário' using errcode = '42501', hint = 'forbidden';
  end if;
  if s.status not in ('approved', 'active', 'paused') then
    raise exception 'catálogo não pode mudar em %', s.status using errcode = '23514', hint = 'invalid_state';
  end if;
  insert into public.catalog_items (stationery_id, name, item_key, price_cents, stock_status, is_active)
  select p_id, i ->> 'name', i ->> 'item_key', (i ->> 'price_cents')::integer, (i ->> 'stock_status')::public.catalog_stock_status, true
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
  on conflict (stationery_id, item_key) do update
    set name = excluded.name, price_cents = excluded.price_cents, stock_status = excluded.stock_status, is_active = true;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Candidatos da cotação local: itens ativos, com estoque não zerado, de papelarias `active` que atendem o município
-- (sede ou área cadastrada). O refinamento por bairro fica no domínio (uma só normalização). Devolve jsonb (uma
-- linha, sem o teto de linhas do PostgREST) e FALHA se houver mais que p_limit candidatos: nunca lista parcial.
create function public.stationery_local_candidates(p_municipality_id uuid, p_item_keys text[], p_limit integer default 5000)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
  v_n integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 20000 then
    raise exception 'limite inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  with picked as (
    select c.stationery_id, c.item_key, c.price_cents, c.price_source, c.stock_status, c.is_active, c.price_updated_at,
           s.status, s.municipality_id, s.neighborhood as stationery_neighborhood, s.is_demo,
           coalesce((select jsonb_agg(jsonb_build_object('municipality_id', a.municipality_id, 'neighborhood', a.neighborhood))
                       from public.stationery_areas a where a.stationery_id = s.id), '[]'::jsonb) as areas
      from public.catalog_items c
      join public.stationeries s on s.id = c.stationery_id
     where s.status = 'active'
       and c.is_active
       and c.stock_status <> 'out_of_stock'
       and c.item_key = any (coalesce(p_item_keys, '{}'))
       and (s.municipality_id = p_municipality_id
            or exists (select 1 from public.stationery_areas a where a.stationery_id = s.id and a.municipality_id = p_municipality_id))
     order by c.stationery_id, c.item_key
     limit p_limit + 1
  )
  select coalesce(jsonb_agg(to_jsonb(p) order by p.stationery_id, p.item_key), '[]'::jsonb), count(*)
    into v_rows, v_n from picked p;
  if v_n > p_limit then
    raise exception 'mais de % candidatos: restrinja a busca', p_limit using errcode = '54000', hint = 'limit_exceeded';
  end if;
  return v_rows;
end;
$$;

-- Transição de status: única porta de escrita de status. Aplica a matriz por ator, exige motivo,
-- trava a linha com FOR NO KEY UPDATE (transições concorrentes se serializam e a segunda relê o estado), grava o evento
-- e, na aprovação, promove os membros parent -> stationery_member (sem rebaixar outros papéis).
create function public.stationery_transition(
  p_id uuid,
  p_to public.stationery_status,
  p_actor_id uuid,
  p_actor_role text,
  p_reason text default null
) returns public.stationery_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.stationeries%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_from text;
  v_to text := p_to::text;
  v_allowed boolean;
  v_sub text;
begin
  begin
    v_sub := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
  exception when others then
    v_sub := null;
  end;
  if p_actor_role is null or p_actor_role not in ('owner', 'admin', 'system') then
    raise exception 'ator inválido' using errcode = '22023', hint = 'actor_invalid';
  end if;

  -- com claim sub (chamada em nome de um usuário), o ator informado precisa ser esse usuário.
  if v_sub is not null and v_sub is distinct from p_actor_id::text then
    raise exception 'ator diferente do usuário autenticado' using errcode = '42501';
  end if;
  -- aprovar e rejeitar são decisões da equipe: exigem ator identificado, mesmo para system.
  if p_to in ('approved', 'rejected') and p_actor_id is null then
    raise exception 'ator obrigatório para %', p_to using errcode = '42501';
  end if;

  select * into s from public.stationeries where id = p_id for no key update;
  if not found then
    raise exception 'papelaria não encontrada' using errcode = 'P0002', hint = 'not_found';
  end if;
  v_from := s.status::text;

  -- o ator precisa ser quem diz ser.
  if p_actor_role = 'owner' then
    if p_actor_id is null or not exists (
      select 1 from public.stationery_members m
      where m.stationery_id = p_id and m.profile_id = p_actor_id and m.member_role = 'owner'
    ) then
      raise exception 'ator não é o dono desta papelaria' using errcode = '42501', hint = 'forbidden';
    end if;
  elsif p_actor_role = 'admin' then
    if p_actor_id is null or not exists (select 1 from public.profiles p where p.id = p_actor_id and p.role = 'admin') then
      raise exception 'ator não é admin' using errcode = '42501';
    end if;
  else
    if p_actor_id is not null and not exists (select 1 from public.profiles p where p.id = p_actor_id and p.role = 'system') then
      raise exception 'ator não é system' using errcode = '42501';
    end if;
  end if;

  -- matriz de transições por ator.
  if p_actor_role = 'owner' then
    v_allowed := (v_from, v_to) in (
      ('signup', 'accreditation'), ('accreditation', 'under_review'), ('approved', 'active'),
      ('active', 'paused'), ('paused', 'active'), ('rejected', 'accreditation')
    );
    if v_allowed and v_from = 'paused' and s.paused_by is distinct from 'owner' then
      raise exception 'papelaria pausada pela equipe: só a equipe reativa' using errcode = '23514', hint = 'transition_not_allowed';
    end if;
  else
    v_allowed := (v_from, v_to) in (
      ('under_review', 'approved'), ('under_review', 'rejected'), ('active', 'paused'), ('approved', 'paused'),
      ('paused', 'active'), ('suspended', 'paused')
    ) or (v_to = 'suspended' and v_from in ('signup', 'accreditation', 'under_review', 'approved', 'active', 'paused'));
  end if;
  if not v_allowed then
    raise exception 'transição % -> % não permitida para %', v_from, v_to, p_actor_role using errcode = '23514', hint = 'transition_not_allowed';
  end if;

  if v_to in ('rejected', 'suspended') and v_reason is null then
    raise exception 'motivo obrigatório para %', v_to using errcode = '22023', hint = 'reason_required';
  end if;

  -- pré-condições do envio pelo dono.
  if p_actor_role = 'owner' and v_from = 'signup' and v_to = 'accreditation' then
    if s.legal_name is null or s.neighborhood is null or btrim(s.neighborhood) = '' then
      raise exception 'dados básicos incompletos (razão social e bairro)' using errcode = '23514', hint = 'precondition_failed';
    end if;
  elsif p_actor_role = 'owner' and v_from = 'accreditation' and v_to = 'under_review' then
    if s.lgpd_accepted_at is null or s.lgpd_text_version is null or s.whatsapp is null then
      raise exception 'aceite LGPD e WhatsApp são obrigatórios' using errcode = '23514', hint = 'precondition_failed';
    end if;
    if not (s.offers_pickup or s.offers_delivery
            or exists (select 1 from public.stationery_areas a where a.stationery_id = p_id)) then
      raise exception 'informe retirada, entrega ou ao menos um bairro' using errcode = '23514', hint = 'precondition_failed';
    end if;
  end if;

  update public.stationeries
     set status = p_to,
         status_reason = v_reason,
         paused_by = case when v_to = 'paused' then (case when p_actor_role = 'owner' then 'owner' else 'admin' end) end
   where id = p_id;

  insert into public.stationery_status_events (stationery_id, from_status, to_status, actor_id, actor_role, reason)
  values (p_id, s.status, p_to, p_actor_id, p_actor_role, v_reason);

  if v_to = 'approved' then
    update public.profiles p
       set role = 'stationery_member'
      from public.stationery_members m
     where m.stationery_id = p_id and m.profile_id = p.id and p.role = 'parent';
  end if;

  return p_to;
end;
$$;

-- ---------------------------------------------------------------------------
-- Visão pública: só colunas seguras de papelarias active (executa como dono da view, sem expor a base).
-- Escolha: view definer + sem grant algum de anon na base. Grants por coluna não separam público de dono
-- porque a RLS filtra linhas, não colunas.
-- ---------------------------------------------------------------------------
create view public.stationery_public with (security_barrier = true) as
select id, slug, trade_name, municipality_id, neighborhood, offers_pickup, offers_delivery, service_radius_km,
       opening_hours, payment_methods, whatsapp, is_demo, updated_at
from public.stationeries
where status = 'active';

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger stationeries_set_updated_at before update on public.stationeries
  for each row execute function public.set_updated_at();
create trigger stationery_members_set_updated_at before update on public.stationery_members
  for each row execute function public.set_updated_at();
-- municipality_id da área é sempre o da papelaria (cliente não escolhe o município).
create function public.stationery_areas_fill_municipality() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.municipality_id is null then
    select s.municipality_id into new.municipality_id from public.stationeries s where s.id = new.stationery_id;
  end if;
  return new;
end;
$$;
revoke all on function public.stationery_areas_fill_municipality() from public, anon, authenticated, service_role;
create trigger stationery_areas_fill_municipality before insert on public.stationery_areas
  for each row execute function public.stationery_areas_fill_municipality();
create trigger stationery_areas_set_updated_at before update on public.stationery_areas
  for each row execute function public.set_updated_at();
create trigger catalog_items_set_dates before insert or update on public.catalog_items
  for each row execute function public.catalog_items_set_dates();
create trigger stationery_status_events_set_updated_at before update on public.stationery_status_events
  for each row execute function public.set_updated_at();

-- guarda roda depois do updated_at e antes da RLS de escrita já aplicada; nome ordena após set_updated_at.
create trigger stationeries_zz_guard_update before update on public.stationeries
  for each row execute function public.stationeries_guard_update();

create trigger stationery_status_events_no_update_delete before update or delete on public.stationery_status_events
  for each row execute function public.stationery_events_block_mutation();
create trigger stationery_status_events_no_truncate before truncate on public.stationery_status_events
  for each statement execute function public.stationery_events_block_mutation();

-- whatsapp, phone e email (contato) ficam fora do audit_log, que é imutável.
create trigger stationeries_audit after insert or update or delete on public.stationeries
  for each row execute function public.audit_row_change('whatsapp', 'phone', 'email');
create trigger stationery_members_audit after insert or update or delete on public.stationery_members
  for each row execute function public.audit_row_change();
create trigger catalog_items_audit after insert or update or delete on public.catalog_items
  for each row execute function public.audit_row_change();
alter table public.stationeries enable always trigger stationeries_audit;
alter table public.stationery_members enable always trigger stationery_members_audit;
alter table public.catalog_items enable always trigger catalog_items_audit;

-- ---------------------------------------------------------------------------
-- Grants (mínimos; RLS decide o resto)
-- ---------------------------------------------------------------------------
revoke execute on function public.stationeries_guard_update() from public, anon, authenticated, service_role;
revoke execute on function public.stationery_events_block_mutation() from public, anon, authenticated, service_role;
revoke execute on function public.catalog_items_set_dates() from public, anon, authenticated, service_role;
revoke execute on function public.stationery_register(uuid, text, text, text, text, uuid, text, text, text, text, text, text, boolean, boolean, integer, text, text[], jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.stationery_register(uuid, text, text, text, text, uuid, text, text, text, text, text, text, boolean, boolean, integer, text, text[], jsonb, text)
  to service_role;
revoke execute on function public.stationery_record_consent(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.stationery_record_consent(uuid, uuid, text) to service_role;
revoke execute on function public.stationery_replace_areas(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.stationery_replace_areas(uuid, uuid, jsonb) to service_role;
revoke execute on function public.stationery_upsert_catalog(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.stationery_upsert_catalog(uuid, uuid, jsonb) to service_role;
revoke execute on function public.stationery_local_candidates(uuid, text[], integer) from public, anon, authenticated, service_role;
grant execute on function public.stationery_local_candidates(uuid, text[], integer) to service_role;
revoke execute on function public.stationery_is_active(uuid) from public, anon, authenticated, service_role;
grant execute on function public.stationery_is_active(uuid) to anon, authenticated, service_role;
revoke execute on function public.stationery_transition(uuid, public.stationery_status, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.stationery_transition(uuid, public.stationery_status, uuid, text, text) to service_role;

revoke all on public.stationeries, public.stationery_members, public.stationery_areas, public.catalog_items,
  public.stationery_status_events, public.stationery_public from public, anon, authenticated, service_role;
-- base: anon sem acesso algum; público lê pela view.
-- authenticated atualiza só colunas cadastrais: nada de id, status*, lgpd_*, created_at/updated_at, municipality_id.
-- (is_demo, slug e cnpj entram porque o trigger de guarda os restringe a admin/system ou ao estado certo.)
grant select on public.stationeries to authenticated;
grant update (slug, trade_name, legal_name, cnpj, neighborhood, address, cep, whatsapp, phone, email,
              offers_pickup, offers_delivery, service_radius_km, opening_hours, payment_methods, is_demo)
  on public.stationeries to authenticated;
grant select, insert, update on public.stationeries to service_role; -- sem DELETE: a papelaria sai por status
grant select on public.stationery_members to authenticated;
grant select, insert, update, delete on public.stationery_members to service_role;
grant select on public.stationery_areas, public.catalog_items to anon;
grant select, delete on public.stationery_areas to authenticated;
-- sem id, municipality_id (vem da papelaria, por trigger), created_at e updated_at.
grant insert (stationery_id, neighborhood, display_name) on public.stationery_areas to authenticated;
grant select, insert, update, delete on public.stationery_areas to service_role;
grant select, delete on public.catalog_items to authenticated;
-- sem id, created_at, updated_at, price_updated_at e price_source (default fixo): datas e origem são do banco.
grant insert (stationery_id, name, item_key, price_cents, stock_status, is_active) on public.catalog_items to authenticated;
grant update (name, item_key, price_cents, stock_status, is_active) on public.catalog_items to authenticated;
grant select, insert, update, delete on public.catalog_items to service_role;
grant select on public.stationery_status_events to authenticated, service_role; -- escrita só pela função
grant select on public.stationery_public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.stationeries enable row level security;
alter table public.stationery_members enable row level security;
alter table public.stationery_areas enable row level security;
alter table public.catalog_items enable row level security;
alter table public.stationery_status_events enable row level security;

-- stationeries: sem política para anon (o público usa stationery_public). Sem insert/delete para authenticated.
-- membro lê a própria papelaria em qualquer status.
create policy stationeries_select_member on public.stationeries
  for select to authenticated
  using (exists (select 1 from public.stationery_members m
                 where m.stationery_id = stationeries.id and m.profile_id = (select auth.uid())));
-- admin/system leem todas.
create policy stationeries_select_admin on public.stationeries
  for select to authenticated using ((select public.auth_role()) in ('admin', 'system'));
-- membro edita dados cadastrais enquanto o estado permite; em rejected corrige o cadastro para o reenvio
-- (o trigger guarda status, cnpj, is_demo e slug; under_review e suspended ficam travados).
create policy stationeries_update_member on public.stationeries
  for update to authenticated
  using (
    status in ('signup', 'accreditation', 'approved', 'active', 'paused', 'rejected')
    and exists (select 1 from public.stationery_members m
                where m.stationery_id = stationeries.id and m.profile_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.stationery_members m
            where m.stationery_id = stationeries.id and m.profile_id = (select auth.uid()))
  );
-- admin/system corrigem cadastro (status continua só pela função).
create policy stationeries_update_admin on public.stationeries
  for update to authenticated
  using ((select public.auth_role()) in ('admin', 'system'))
  with check ((select public.auth_role()) in ('admin', 'system'));

-- stationery_members: cada um vê o próprio vínculo; admin/system veem todos. Sem escrita pelo cliente.
-- perfil lê o próprio vínculo.
create policy stationery_members_select_own on public.stationery_members
  for select to authenticated using (profile_id = (select auth.uid()));
-- admin/system leem todos os vínculos.
create policy stationery_members_select_admin on public.stationery_members
  for select to authenticated using ((select public.auth_role()) in ('admin', 'system'));

-- stationery_areas: leitura pública só de papelaria active; membro gerencia enquanto o estado permite.
-- público lê áreas de papelarias active.
create policy stationery_areas_select_public on public.stationery_areas
  for select to anon, authenticated using ((select public.stationery_is_active(stationery_areas.stationery_id)));
-- membro lê as áreas da própria papelaria.
create policy stationery_areas_select_member on public.stationery_areas
  for select to authenticated
  using (exists (select 1 from public.stationery_members m
                 where m.stationery_id = stationery_areas.stationery_id and m.profile_id = (select auth.uid())));
-- admin/system leem todas as áreas.
create policy stationery_areas_select_admin on public.stationery_areas
  for select to authenticated using ((select public.auth_role()) in ('admin', 'system'));
-- membro inclui área na própria papelaria (não em análise nem suspensa; rejeitada pode, para o reenvio).
create policy stationery_areas_insert_member on public.stationery_areas
  for insert to authenticated
  with check (exists (select 1 from public.stationery_members m join public.stationeries s on s.id = m.stationery_id
                      where m.stationery_id = stationery_areas.stationery_id and m.profile_id = (select auth.uid())
                        and s.status in ('signup', 'accreditation', 'approved', 'active', 'paused', 'rejected')));
-- membro remove área da própria papelaria no mesmo conjunto de estados.
create policy stationery_areas_delete_member on public.stationery_areas
  for delete to authenticated
  using (exists (select 1 from public.stationery_members m join public.stationeries s on s.id = m.stationery_id
                 where m.stationery_id = stationery_areas.stationery_id and m.profile_id = (select auth.uid())
                   and s.status in ('signup', 'accreditation', 'approved', 'active', 'paused', 'rejected')));

-- catalog_items: leitura pública só de item ativo de papelaria active; membro escreve em approved, active e paused.
-- público lê itens ativos de papelarias active.
create policy catalog_items_select_public on public.catalog_items
  for select to anon, authenticated using (is_active and (select public.stationery_is_active(catalog_items.stationery_id)));
-- membro lê todos os itens da própria papelaria, inclusive inativos.
create policy catalog_items_select_member on public.catalog_items
  for select to authenticated
  using (exists (select 1 from public.stationery_members m
                 where m.stationery_id = catalog_items.stationery_id and m.profile_id = (select auth.uid())));
-- admin/system leem todo o catálogo.
create policy catalog_items_select_admin on public.catalog_items
  for select to authenticated using ((select public.auth_role()) in ('admin', 'system'));
-- membro cadastra item só na própria papelaria e só depois da aprovação (approved, active, paused).
create policy catalog_items_insert_member on public.catalog_items
  for insert to authenticated
  with check (exists (select 1 from public.stationery_members m join public.stationeries s on s.id = m.stationery_id
                      where m.stationery_id = catalog_items.stationery_id and m.profile_id = (select auth.uid())
                        and s.status in ('approved', 'active', 'paused')));
-- membro altera item da própria papelaria (nunca move para outra) nos mesmos estados.
create policy catalog_items_update_member on public.catalog_items
  for update to authenticated
  using (exists (select 1 from public.stationery_members m join public.stationeries s on s.id = m.stationery_id
                 where m.stationery_id = catalog_items.stationery_id and m.profile_id = (select auth.uid())
                   and s.status in ('approved', 'active', 'paused')))
  with check (exists (select 1 from public.stationery_members m join public.stationeries s on s.id = m.stationery_id
                      where m.stationery_id = catalog_items.stationery_id and m.profile_id = (select auth.uid())
                        and s.status in ('approved', 'active', 'paused')));
-- membro remove item da própria papelaria nos mesmos estados.
create policy catalog_items_delete_member on public.catalog_items
  for delete to authenticated
  using (exists (select 1 from public.stationery_members m join public.stationeries s on s.id = m.stationery_id
                 where m.stationery_id = catalog_items.stationery_id and m.profile_id = (select auth.uid())
                   and s.status in ('approved', 'active', 'paused')));

-- stationery_status_events: membro lê os da própria papelaria, admin/system todos; ninguém escreve fora da função.
-- membro lê os eventos da própria papelaria.
create policy stationery_status_events_select_member on public.stationery_status_events
  for select to authenticated
  using (exists (select 1 from public.stationery_members m
                 where m.stationery_id = stationery_status_events.stationery_id and m.profile_id = (select auth.uid())));
-- admin/system leem todos os eventos.
create policy stationery_status_events_select_admin on public.stationery_status_events
  for select to authenticated using ((select public.auth_role()) in ('admin', 'system'));
