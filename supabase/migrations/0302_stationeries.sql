-- 0302_stationeries: papelarias, membros, áreas atendidas, catálogo e trilha de eventos de status (S13, trilha Comércio).
-- Sem FK para tabelas de outras trilhas (ADR-004): só municipalities, profiles e tabelas desta migration.
-- Regras de produto: preço e estoque do catálogo são sempre "informados pela papelaria" (nunca inventados);
-- dados de contato e cadastro (cnpj, razão social, e-mail, telefone, motivo) nunca chegam ao público.
-- Escrita de status só pela função stationery_transition (SECURITY DEFINER, só service_role): o cliente
-- (dono ou admin) nunca escreve status direto. Cadastro (insert de papelaria/membro) é do servidor (service_role).

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
  cnpj text not null unique check (cnpj ~ '^[0-9]{14}$'), -- só o formato aqui; dígitos verificadores no domínio
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
  member_role public.stationery_member_role not null default 'owner',
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
  neighborhood text not null check (neighborhood <> '' and neighborhood = lower(btrim(neighborhood)) and length(neighborhood) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stationery_id, municipality_id, neighborhood)
);
create index stationery_areas_municipality_id_idx on public.stationery_areas (municipality_id);

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  stationery_id uuid not null references public.stationeries (id) on delete cascade,
  name text not null check (btrim(name) <> '' and length(name) <= 200),
  item_key text not null check (btrim(item_key) <> '' and length(item_key) <= 200), -- nome normalizado (mesma regra da S12)
  price_cents integer not null check (price_cents > 0 and price_cents <= 100000000),
  price_source text not null default 'informed_by_stationery' check (price_source = 'informed_by_stationery'),
  stock_status public.catalog_stock_status not null default 'unknown',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), -- data do preço informado, exibida ao público
  unique (stationery_id, item_key)
);

create table public.stationery_status_events (
  id uuid primary key default gen_random_uuid(),
  stationery_id uuid not null references public.stationeries (id) on delete cascade,
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
  caller public.user_role := public.auth_role();
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

-- eventos são imutáveis; a única remoção permitida é a cascata da papelaria (trigger aninhado).
create function public.stationery_events_block_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'stationery_status_events é imutável (% bloqueado)', tg_op using errcode = '42501';
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

-- Transição de status: única porta de escrita de status. Aplica a matriz por ator, exige motivo,
-- trava a linha (transições concorrentes se serializam e a segunda relê o estado), grava o evento
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
begin
  if p_actor_role is null or p_actor_role not in ('owner', 'admin', 'system') then
    raise exception 'ator inválido' using errcode = '22023';
  end if;

  select * into s from public.stationeries where id = p_id for update;
  if not found then
    raise exception 'papelaria não encontrada' using errcode = 'P0002';
  end if;
  v_from := s.status::text;

  -- o ator precisa ser quem diz ser.
  if p_actor_role = 'owner' then
    if p_actor_id is null or not exists (
      select 1 from public.stationery_members m
      where m.stationery_id = p_id and m.profile_id = p_actor_id and m.member_role = 'owner'
    ) then
      raise exception 'ator não é o dono desta papelaria' using errcode = '42501';
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
      raise exception 'papelaria pausada pela equipe: só a equipe reativa' using errcode = '23514';
    end if;
  else
    v_allowed := (v_from, v_to) in (
      ('under_review', 'approved'), ('under_review', 'rejected'), ('active', 'paused'), ('approved', 'paused'),
      ('paused', 'active'), ('suspended', 'paused')
    ) or (v_to = 'suspended' and v_from in ('signup', 'accreditation', 'under_review', 'approved', 'active', 'paused'));
  end if;
  if not v_allowed then
    raise exception 'transição % -> % não permitida para %', v_from, v_to, p_actor_role using errcode = '23514';
  end if;

  if v_to in ('rejected', 'suspended') and v_reason is null then
    raise exception 'motivo obrigatório para %', v_to using errcode = '22023';
  end if;

  -- pré-condições do envio pelo dono.
  if p_actor_role = 'owner' and v_from = 'signup' and v_to = 'accreditation' then
    if s.legal_name is null or s.neighborhood is null or btrim(s.neighborhood) = '' then
      raise exception 'dados básicos incompletos (razão social e bairro)' using errcode = '23514';
    end if;
  elsif p_actor_role = 'owner' and v_from = 'accreditation' and v_to = 'under_review' then
    if s.lgpd_accepted_at is null or s.lgpd_text_version is null or s.whatsapp is null then
      raise exception 'aceite LGPD e WhatsApp são obrigatórios' using errcode = '23514';
    end if;
    if not (s.offers_pickup or s.offers_delivery
            or exists (select 1 from public.stationery_areas a where a.stationery_id = p_id)) then
      raise exception 'informe retirada, entrega ou ao menos um bairro' using errcode = '23514';
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
create trigger stationery_areas_set_updated_at before update on public.stationery_areas
  for each row execute function public.set_updated_at();
create trigger catalog_items_set_updated_at before update on public.catalog_items
  for each row execute function public.set_updated_at();
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
revoke execute on function public.stationery_is_active(uuid) from public, anon, authenticated, service_role;
grant execute on function public.stationery_is_active(uuid) to anon, authenticated, service_role;
revoke execute on function public.stationery_transition(uuid, public.stationery_status, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.stationery_transition(uuid, public.stationery_status, uuid, text, text) to service_role;

revoke all on public.stationeries, public.stationery_members, public.stationery_areas, public.catalog_items,
  public.stationery_status_events, public.stationery_public from public, anon, authenticated, service_role;
-- base: anon sem acesso algum; público lê pela view.
grant select, update on public.stationeries to authenticated;
grant select, insert, update, delete on public.stationeries to service_role;
grant select on public.stationery_members to authenticated;
grant select, insert, update, delete on public.stationery_members to service_role;
grant select on public.stationery_areas, public.catalog_items to anon;
grant select, insert, delete on public.stationery_areas to authenticated;
grant select, insert, update, delete on public.stationery_areas to service_role;
grant select, insert, update, delete on public.catalog_items to authenticated, service_role;
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
-- membro edita dados cadastrais só enquanto o estado permite (o trigger guarda status, cnpj, is_demo e slug).
create policy stationeries_update_member on public.stationeries
  for update to authenticated
  using (
    status in ('signup', 'accreditation', 'approved', 'active', 'paused')
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
  for select to anon, authenticated using (public.stationery_is_active(stationery_id));
-- membro lê as áreas da própria papelaria.
create policy stationery_areas_select_member on public.stationery_areas
  for select to authenticated
  using (exists (select 1 from public.stationery_members m
                 where m.stationery_id = stationery_areas.stationery_id and m.profile_id = (select auth.uid())));
-- admin/system leem todas as áreas.
create policy stationery_areas_select_admin on public.stationery_areas
  for select to authenticated using ((select public.auth_role()) in ('admin', 'system'));
-- membro inclui área na própria papelaria (não em análise, suspensa ou rejeitada).
create policy stationery_areas_insert_member on public.stationery_areas
  for insert to authenticated
  with check (exists (select 1 from public.stationery_members m join public.stationeries s on s.id = m.stationery_id
                      where m.stationery_id = stationery_areas.stationery_id and m.profile_id = (select auth.uid())
                        and s.status in ('signup', 'accreditation', 'approved', 'active', 'paused')));
-- membro remove área da própria papelaria no mesmo conjunto de estados.
create policy stationery_areas_delete_member on public.stationery_areas
  for delete to authenticated
  using (exists (select 1 from public.stationery_members m join public.stationeries s on s.id = m.stationery_id
                 where m.stationery_id = stationery_areas.stationery_id and m.profile_id = (select auth.uid())
                   and s.status in ('signup', 'accreditation', 'approved', 'active', 'paused')));

-- catalog_items: leitura pública só de item ativo de papelaria active; membro escreve em approved, active e paused.
-- público lê itens ativos de papelarias active.
create policy catalog_items_select_public on public.catalog_items
  for select to anon, authenticated using (is_active and public.stationery_is_active(stationery_id));
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
