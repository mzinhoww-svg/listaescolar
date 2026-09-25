-- 0001_base_schema: enums, municipalities, profiles, audit_log, auth_role() e RLS (S01).
-- Idempotente sob `supabase db reset` (banco recriado do zero).
-- Decisão: sem FORCE ROW LEVEL SECURITY. O dono (postgres) precisa gravar o audit_log pelos
-- triggers SECURITY DEFINER e executar migrations; anon/authenticated/service_role seguem RLS
-- ou grants mínimos.

-- ---------------------------------------------------------------------------
-- Enums (spec seção 4)
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('parent', 'school_member', 'admin', 'stationery_member', 'system');
create type public.registry_source as enum ('inep_import', 'admin_manual', 'school_claim');
create type public.verification_status as enum ('registered', 'claimed', 'verified', 'suspended');
create type public.claim_status as enum (
  'submitted', 'awaiting_verification', 'token_expired', 'insufficient_evidence', 'rejected', 'approved'
);
create type public.claim_method as enum ('institutional_email', 'institutional_whatsapp', 'documents');
create type public.list_status as enum (
  'draft', 'submitted', 'processing', 'processing_async', 'review_needed', 'human_review',
  'approved', 'published', 'archived', 'rejected'
);
create type public.stationery_status as enum (
  'signup', 'accreditation', 'under_review', 'approved', 'active', 'paused', 'suspended', 'rejected'
);
create type public.lead_status as enum (
  'received', 'viewed', 'in_progress', 'quote_sent', 'awaiting_customer', 'converted',
  'declined', 'expired', 'cancelled'
);
create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed', 'retrying', 'dead');

-- ---------------------------------------------------------------------------
-- Funções utilitárias
-- ---------------------------------------------------------------------------
create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.municipalities (
  id uuid primary key default gen_random_uuid(),
  ibge_code text not null unique check (ibge_code ~ '^[0-9]{7}$'),
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  name text not null check (length(btrim(name)) > 0),
  is_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'parent',
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity_table text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  actor_id uuid, -- sem FK: o log sobrevive à remoção do usuário
  actor_role text,
  ip_hash text, -- sha256 do IP; nunca o IP em claro
  created_at timestamptz not null default clock_timestamp(), -- clock: ordem estável dentro da transação
  updated_at timestamptz not null default clock_timestamp()
);

-- ---------------------------------------------------------------------------
-- auth_role(): papel do chamador. service_role do JWT vira 'system'; sem profile, NULL.
-- ---------------------------------------------------------------------------
create function public.auth_role() returns public.user_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  jwt_role text;
  result public.user_role;
begin
  begin
    jwt_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  exception when others then
    jwt_role := null;
  end;
  if jwt_role = 'service_role' then
    return 'system'::public.user_role;
  end if;
  select p.role into result from public.profiles p where p.id = auth.uid();
  return result;
end;
$$;

revoke all on function public.auth_role() from public;
grant execute on function public.auth_role() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Auditoria: trigger genérico (SECURITY DEFINER; único caminho de escrita no audit_log)
-- ---------------------------------------------------------------------------
create function public.audit_row_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_j jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_j jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  fwd text;
  ip text;
  hashed text;
begin
  begin
    fwd := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    fwd := null;
  end;
  ip := nullif(btrim(split_part(coalesce(fwd, ''), ',', 1)), '');
  if ip is not null then
    hashed := encode(sha256(convert_to(ip, 'utf8')), 'hex');
  end if;

  insert into public.audit_log (action, entity_table, entity_id, before, after, actor_id, actor_role, ip_hash,
                                created_at, updated_at)
  values (
    tg_op, tg_table_name,
    coalesce(new_j ->> 'id', old_j ->> 'id')::uuid,
    old_j, new_j,
    auth.uid(), public.auth_role()::text, hashed,
    clock_timestamp(), clock_timestamp()
  );
  return null;
end;
$$;

revoke all on function public.audit_row_change() from public;

-- audit_log é append-only: bloqueia UPDATE/DELETE/TRUNCATE inclusive para o dono.
create function public.audit_log_block_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log é append-only (% bloqueado)', tg_op using errcode = '42501';
end;
$$;

create trigger audit_log_no_update_delete before update or delete on public.audit_log
  for each row execute function public.audit_log_block_mutation();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_block_mutation();

-- Só admin/system mudam profiles.role; admin não concede nem retira 'system'.
-- SECURITY INVOKER: current_user reflete o papel do chamador (postgres/supabase_admin = migrations).
create function public.profiles_guard_role() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  caller public.user_role := public.auth_role();
begin
  if new.role is not distinct from old.role then
    return new;
  end if;
  if current_user in ('postgres', 'supabase_admin') or caller = 'system' then
    return new;
  end if;
  if caller = 'admin' and old.role <> 'system' and new.role <> 'system' then
    return new;
  end if;
  raise exception 'sem permissão para alterar profiles.role' using errcode = '42501';
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger municipalities_set_updated_at before update on public.municipalities
  for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger profiles_guard_role before update on public.profiles
  for each row execute function public.profiles_guard_role();
create trigger municipalities_audit after insert or update or delete on public.municipalities
  for each row execute function public.audit_row_change();
create trigger profiles_audit after insert or update or delete on public.profiles
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- Grants (mínimos; RLS decide o resto)
-- ---------------------------------------------------------------------------
revoke all on public.municipalities, public.profiles, public.audit_log from anon, authenticated, service_role;
grant select on public.municipalities to anon, authenticated;
grant insert, update, delete on public.municipalities to authenticated;
grant all on public.municipalities to service_role;
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
grant select on public.audit_log to authenticated, service_role; -- sem insert/update/delete/truncate

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.municipalities enable row level security;
alter table public.profiles enable row level security;
alter table public.audit_log enable row level security;

-- municipalities: qualquer um lê os habilitados.
create policy municipalities_select_enabled on public.municipalities
  for select to anon, authenticated using (is_enabled);
-- municipalities: admin e system leem todos.
create policy municipalities_select_admin on public.municipalities
  for select to authenticated using (public.auth_role() in ('admin', 'system'));
-- municipalities: só admin/system inserem.
create policy municipalities_insert_admin on public.municipalities
  for insert to authenticated with check (public.auth_role() in ('admin', 'system'));
-- municipalities: só admin/system atualizam.
create policy municipalities_update_admin on public.municipalities
  for update to authenticated
  using (public.auth_role() in ('admin', 'system')) with check (public.auth_role() in ('admin', 'system'));
-- municipalities: só admin/system apagam.
create policy municipalities_delete_admin on public.municipalities
  for delete to authenticated using (public.auth_role() in ('admin', 'system'));

-- profiles: cada um lê a própria linha; admin e system leem todas.
create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated using (id = auth.uid() or public.auth_role() in ('admin', 'system'));
-- profiles: só admin/system inserem; admin não cria 'system'.
create policy profiles_insert_admin on public.profiles
  for insert to authenticated
  with check (public.auth_role() = 'system' or (public.auth_role() = 'admin' and role <> 'system'));
-- profiles: usuário atualiza a própria linha (id imutável; role protegido pelo trigger).
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- profiles: admin/system atualizam qualquer linha (trigger limita o papel 'system' ao system).
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.auth_role() in ('admin', 'system')) with check (public.auth_role() in ('admin', 'system'));
-- profiles: só system apaga.
create policy profiles_delete_system on public.profiles
  for delete to authenticated using (public.auth_role() = 'system');

-- audit_log: só admin e system leem; sem políticas de insert/update/delete (append-only).
create policy audit_log_select_admin on public.audit_log
  for select to authenticated using (public.auth_role() in ('admin', 'system'));

-- ---------------------------------------------------------------------------
-- Seed: piloto Cuiabá/MT (na migration para existir em qualquer ambiente)
-- ---------------------------------------------------------------------------
insert into public.municipalities (ibge_code, uf, name, is_enabled)
values ('5103403', 'MT', 'Cuiabá', true)
on conflict (ibge_code) do nothing;
