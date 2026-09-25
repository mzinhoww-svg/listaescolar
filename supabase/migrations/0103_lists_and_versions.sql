-- 0103_lists_and_versions: listas oficiais, versões e itens (S05, trilha Dados).
-- O público só enxerga lista `published` (e as versões published/superseded dela); candidatas, aprovadas,
-- rejeitadas e arquivadas nunca vazam. Estado da lista e versões só mudam pelas funções SECURITY DEFINER
-- (service_role), que aplicam a matriz de transições, travam a linha e gravam eventos imutáveis.
-- FKs só para schools, profiles e tabelas desta migration (ADR-004); submission_id é uuid solto (Pipeline).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.grade_stage as enum ('ei', 'ef', 'em');
create type public.version_status as enum ('candidate', 'published', 'superseded', 'archived');
create type public.list_version_source as enum ('school_upload', 'parent_upload', 'admin');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.grades (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(btrim(name)) > 0),
  stage public.grade_stage not null,
  sort_order integer not null check (sort_order > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grades_slug_key unique (slug),
  constraint grades_sort_order_key unique (sort_order)
);

create table public.school_lists (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete restrict,
  grade_id uuid not null references public.grades (id) on delete restrict,
  school_year integer not null check (school_year between 2020 and 2100),
  status public.list_status not null default 'draft',
  current_version_id uuid, -- FK composta deferrable adicionada depois de list_versions
  published_at timestamptz,
  archived_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_lists_school_grade_year_key unique (school_id, grade_id, school_year),
  -- publicada exige versão atual; só a publicada tem versão atual (arquivada zera o ponteiro).
  constraint school_lists_published_has_version check ((status = 'published') = (current_version_id is not null)),
  constraint school_lists_published_has_date check (status <> 'published' or published_at is not null),
  constraint school_lists_archived_has_date check ((status = 'archived') = (archived_at is not null))
);

create table public.list_versions (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.school_lists (id) on delete restrict,
  version_number integer not null check (version_number > 0),
  status public.version_status not null default 'candidate',
  source public.list_version_source not null,
  submission_id uuid, -- sem FK (pertence ao Pipeline; a 0600 decide)
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  item_count integer not null default 0 check (item_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint list_versions_list_number_key unique (list_id, version_number),
  constraint list_versions_id_list_key unique (id, list_id), -- alvo da FK composta de school_lists
  constraint list_versions_published_dates check (
    (status in ('published', 'superseded') and published_at is not null)
    or (status = 'candidate' and published_at is null)
    or status = 'archived'
  ),
  constraint list_versions_archived_date check ((status = 'archived') = (archived_at is not null))
);

-- Ponteiro da versão atual: (versão, lista) precisa existir junto => versão da própria lista.
-- Deferrable: publicar/arquivar reordena os dois lados dentro da mesma transação.
alter table public.school_lists
  add constraint school_lists_current_version_fkey
  foreign key (current_version_id, id) references public.list_versions (id, list_id)
  deferrable initially deferred;

-- No máximo uma versão published por lista.
create unique index list_versions_one_published_idx on public.list_versions (list_id) where status = 'published';

create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.list_versions (id) on delete restrict,
  position integer not null check (position > 0),
  original_name text not null check (length(btrim(original_name)) > 0 and length(original_name) <= 500),
  normalized_name text not null check (length(btrim(normalized_name)) > 0 and length(normalized_name) <= 500),
  category text check (category is null or length(category) <= 100),
  quantity numeric(10, 2) check (quantity is null or quantity > 0),
  unit text check (unit is null or length(unit) <= 30),
  confidence numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  -- códigos do spec §6; sinalizações internas para revisão, nunca parecer jurídico.
  alerts jsonb not null default '[]'::jsonb check (
    jsonb_typeof(alerts) = 'array'
    and jsonb_array_length(alerts) <= 20
    and alerts <@ '["low_confidence_item","ambiguous_item","handwritten","possible_collective_item","restrictive_brand_or_spec","text_document_mismatch","invalid_school_grade_year"]'::jsonb
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint list_items_version_position_key unique (version_id, position)
);

-- Trilha imutável de estados. actor_id sem FK de propósito: o histórico sobrevive à remoção do perfil.
create table public.list_status_events (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.school_lists (id) on delete restrict,
  version_id uuid references public.list_versions (id) on delete restrict,
  from_status public.list_status,
  to_status public.list_status not null,
  actor_id uuid,
  reason text check (reason is null or length(reason) <= 1000),
  created_at timestamptz not null default clock_timestamp(), -- ordem dos eventos dentro de uma transação
  updated_at timestamptz not null default now()
);

create index school_lists_grade_idx on public.school_lists (grade_id);
create index school_lists_current_version_idx on public.school_lists (current_version_id);
create index list_versions_created_by_idx on public.list_versions (created_by);
create index list_status_events_list_idx on public.list_status_events (list_id, created_at);
create index list_status_events_version_idx on public.list_status_events (version_id);

-- ---------------------------------------------------------------------------
-- Seed: catálogo de séries (espelha features/grades/catalog.ts; um teste compara os dois)
-- ---------------------------------------------------------------------------
insert into public.grades (slug, name, stage, sort_order) values
  ('ei-maternal-1', 'Maternal I', 'ei', 1),
  ('ei-maternal-2', 'Maternal II', 'ei', 2),
  ('ei-pre-1', 'Pré I', 'ei', 3),
  ('ei-pre-2', 'Pré II', 'ei', 4),
  ('ef-1', '1º ano', 'ef', 5),
  ('ef-2', '2º ano', 'ef', 6),
  ('ef-3', '3º ano', 'ef', 7),
  ('ef-4', '4º ano', 'ef', 8),
  ('ef-5', '5º ano', 'ef', 9),
  ('ef-6', '6º ano', 'ef', 10),
  ('ef-7', '7º ano', 'ef', 11),
  ('ef-8', '8º ano', 'ef', 12),
  ('ef-9', '9º ano', 'ef', 13),
  ('em-1', '1ª série', 'em', 14),
  ('em-2', '2ª série', 'em', 15),
  ('em-3', '3ª série', 'em', 16);

-- ---------------------------------------------------------------------------
-- Triggers de manutenção e integridade
-- ---------------------------------------------------------------------------
create trigger grades_set_updated_at before update on public.grades
  for each row execute function public.set_updated_at();
create trigger school_lists_set_updated_at before update on public.school_lists
  for each row execute function public.set_updated_at();
create trigger list_versions_set_updated_at before update on public.list_versions
  for each row execute function public.set_updated_at();
create trigger list_items_set_updated_at before update on public.list_items
  for each row execute function public.set_updated_at();
create trigger list_status_events_set_updated_at before update on public.list_status_events
  for each row execute function public.set_updated_at();

-- Eventos são imutáveis (append-only).
create function public.list_status_events_block_mutation() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'list_status_events é imutável' using errcode = '23514';
end;
$$;
create trigger list_status_events_immutable before update or delete on public.list_status_events
  for each row execute function public.list_status_events_block_mutation();

-- Versão: só transições candidate->published|archived, published->superseded|archived, superseded->archived;
-- list_id e version_number nunca mudam.
create function public.list_versions_guard() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.list_id <> old.list_id or new.version_number <> old.version_number then
    raise exception 'list_id e version_number da versão são imutáveis' using errcode = '23514';
  end if;
  if new.status <> old.status and not (
    (old.status = 'candidate' and new.status in ('published', 'archived'))
    or (old.status = 'published' and new.status in ('superseded', 'archived'))
    or (old.status = 'superseded' and new.status = 'archived')
  ) then
    raise exception 'transição de versão inválida: % -> %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger list_versions_guard before update on public.list_versions
  for each row execute function public.list_versions_guard();

-- Itens: só versão candidate aceita insert/update/delete. A leitura da versão trava a linha em modo
-- compartilhado (publicar pega `for update`), então item e publicação se serializam.
create function public.list_items_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ids uuid[];
  v_id uuid;
  v_status public.version_status;
begin
  if tg_op = 'INSERT' then v_ids := array[new.version_id];
  elsif tg_op = 'DELETE' then v_ids := array[old.version_id];
  else v_ids := array[old.version_id, new.version_id];
  end if;
  foreach v_id in array v_ids loop
    select v.status into v_status from public.list_versions v where v.id = v_id for share;
    if v_status is distinct from 'candidate' then
      raise exception 'itens de versão % são imutáveis: só versão candidate aceita alterações', coalesce(v_status::text, 'inexistente')
        using errcode = '23514';
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger list_items_guard before insert or update or delete on public.list_items
  for each row execute function public.list_items_guard();

-- item_count da versão acompanha os itens.
create function public.list_items_sync_count() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in select distinct x from unnest(array[
    case when tg_op <> 'INSERT' then old.version_id end,
    case when tg_op <> 'DELETE' then new.version_id end
  ]) as x where x is not null loop
    update public.list_versions v
       set item_count = (select count(*) from public.list_items i where i.version_id = v_id)
     where v.id = v_id;
  end loop;
  return null;
end;
$$;
create trigger list_items_sync_count after insert or update or delete on public.list_items
  for each row execute function public.list_items_sync_count();

-- A versão atual da lista precisa estar `published` (checado no fim da transação: publicar e arquivar
-- reordenam lista e versões dentro da mesma transação).
create function public.list_current_version_check() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_list_id uuid;
  v_current uuid;
  v_status public.version_status;
begin
  if tg_table_name = 'school_lists' then v_list_id := new.id; else v_list_id := new.list_id; end if;
  select l.current_version_id into v_current from public.school_lists l where l.id = v_list_id;
  if v_current is null then return null; end if;
  select v.status into v_status from public.list_versions v where v.id = v_current;
  if v_status is distinct from 'published' then
    raise exception 'a versão atual da lista precisa estar published (está %)', coalesce(v_status::text, 'inexistente')
      using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger school_lists_current_version_check after insert or update of current_version_id on public.school_lists
  deferrable initially deferred for each row execute function public.list_current_version_check();
create constraint trigger list_versions_current_version_check after update of status on public.list_versions
  deferrable initially deferred for each row execute function public.list_current_version_check();

revoke execute on function public.list_status_events_block_mutation() from public, anon, authenticated, service_role;
revoke execute on function public.list_versions_guard() from public, anon, authenticated, service_role;
revoke execute on function public.list_items_guard() from public, anon, authenticated, service_role;
revoke execute on function public.list_items_sync_count() from public, anon, authenticated, service_role;
revoke execute on function public.list_current_version_check() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Grants (mínimos; RLS decide o resto). Ninguém escreve pelo PostgREST: estado e versões só pelas funções.
-- ---------------------------------------------------------------------------
revoke all on public.grades, public.school_lists, public.list_versions, public.list_items, public.list_status_events
  from anon, authenticated, service_role;
grant select on public.grades, public.school_lists to anon, authenticated;
-- Colunas públicas: sem submission_id/created_by/source (internas), sem alerts/confidence (sinalizações internas).
grant select (id, list_id, version_number, status, published_at, archived_at, item_count, created_at, updated_at)
  on public.list_versions to anon, authenticated;
grant select (id, version_id, position, original_name, normalized_name, category, quantity, unit, created_at, updated_at)
  on public.list_items to anon, authenticated;
grant select on public.list_status_events to authenticated;
grant select on public.grades, public.school_lists, public.list_versions, public.list_items, public.list_status_events to service_role;
-- service_role cria o rascunho e edita itens (o gatilho só deixa versão candidate); o resto só pelas funções.
grant insert (school_id, grade_id, school_year, is_demo) on public.school_lists to service_role;
grant insert, update, delete on public.list_items to service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.grades enable row level security;
alter table public.school_lists enable row level security;
alter table public.list_versions enable row level security;
alter table public.list_items enable row level security;
alter table public.list_status_events enable row level security;

-- grades: catálogo público.
create policy grades_select_public on public.grades
  for select to anon, authenticated using (true);

-- school_lists: público lê só lista publicada de escola em município habilitado.
create policy school_lists_select_published on public.school_lists
  for select to anon, authenticated
  using (
    status = 'published'
    and exists (
      select 1 from public.schools s join public.municipalities m on m.id = s.municipality_id
       where s.id = school_id and m.is_enabled
    )
  );
-- school_lists: admin e system leem todas.
create policy school_lists_select_admin on public.school_lists
  for select to authenticated using ((select public.auth_role()) in ('admin', 'system'));

-- list_versions: público lê published/superseded, e só se a lista está publicada (e visível ao público).
create policy list_versions_select_published on public.list_versions
  for select to anon, authenticated
  using (
    status in ('published', 'superseded')
    and exists (select 1 from public.school_lists l where l.id = list_id and l.status = 'published')
  );
-- list_versions: admin e system leem todas.
create policy list_versions_select_admin on public.list_versions
  for select to authenticated using ((select public.auth_role()) in ('admin', 'system'));

-- list_items: público lê itens das versões que a política de versões deixa ver.
create policy list_items_select_published on public.list_items
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.list_versions v
       where v.id = version_id and v.status in ('published', 'superseded')
    )
  );
-- list_items: admin e system leem todos.
create policy list_items_select_admin on public.list_items
  for select to authenticated using ((select public.auth_role()) in ('admin', 'system'));

-- list_status_events: só admin e system leem.
create policy list_status_events_select_admin on public.list_status_events
  for select to authenticated using ((select public.auth_role()) in ('admin', 'system'));

-- ---------------------------------------------------------------------------
-- Matriz de transições da lista (espelha features/lists/state.ts; um teste compara os dois)
-- ---------------------------------------------------------------------------
create function public.list_transition_allowed(p_from public.list_status, p_to public.list_status) returns boolean
language sql immutable security definer set search_path = ''
as $$
  select exists (
    select 1 from (values
      ('draft', 'submitted'),
      ('submitted', 'processing'),
      ('processing', 'processing_async'), ('processing', 'review_needed'), ('processing', 'human_review'),
      ('processing', 'approved'), ('processing', 'rejected'),
      ('processing_async', 'processing'), ('processing_async', 'review_needed'), ('processing_async', 'human_review'),
      ('processing_async', 'approved'), ('processing_async', 'rejected'),
      ('review_needed', 'human_review'), ('review_needed', 'approved'), ('review_needed', 'rejected'),
      ('human_review', 'approved'), ('human_review', 'rejected'),
      ('approved', 'published'),
      ('published', 'archived'),
      ('rejected', 'draft')
    ) as t (f, t)
    where t.f = p_from::text and t.t = p_to::text
  );
$$;

-- ---------------------------------------------------------------------------
-- list_transition: aplica a matriz com lock da linha e grava o evento. `published` só por
-- list_publish_version (exige a versão); `archived` delega a list_archive (versões arquivadas junto).
-- ---------------------------------------------------------------------------
create function public.list_transition(
  p_list_id uuid, p_to public.list_status, p_actor_id uuid, p_reason text default null
) returns public.list_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.list_status;
begin
  select l.status into v_from from public.school_lists l where l.id = p_list_id for no key update;
  if not found then
    raise exception 'lista não encontrada' using errcode = 'P0002';
  end if;
  if not public.list_transition_allowed(v_from, p_to) then
    raise exception 'transição de lista inválida: % -> %', v_from, p_to using errcode = '23514';
  end if;
  if p_to = 'published' then
    raise exception 'publicar exige uma versão: use list_publish_version' using errcode = '22023';
  end if;
  if p_to = 'archived' then
    perform public.list_archive(p_list_id, p_actor_id, p_reason);
    return p_to;
  end if;
  if p_to = 'approved' and p_actor_id is null or p_to = 'rejected' and p_actor_id is null then
    raise exception 'p_actor_id obrigatório para %', p_to using errcode = '22023';
  end if;

  update public.school_lists set status = p_to where id = p_list_id;
  insert into public.list_status_events (list_id, from_status, to_status, actor_id, reason)
  values (p_list_id, v_from, p_to, p_actor_id, p_reason);
  return p_to;
end;
$$;

-- ---------------------------------------------------------------------------
-- list_publish_version: publica uma versão candidate da própria lista. Lista `approved` (primeira
-- publicação) ou `published` (troca: a versão atual vira superseded). Numa transação, sob lock.
-- Devolve o número da versão publicada.
-- ---------------------------------------------------------------------------
create function public.list_publish_version(p_list_id uuid, p_version_id uuid, p_actor_id uuid) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list_status public.list_status;
  v_number integer;
  v_status public.version_status;
begin
  if p_actor_id is null then
    raise exception 'p_actor_id obrigatório para publicar' using errcode = '22023';
  end if;
  select l.status into v_list_status from public.school_lists l where l.id = p_list_id for no key update;
  if not found then
    raise exception 'lista não encontrada' using errcode = 'P0002';
  end if;
  if v_list_status not in ('approved', 'published') then
    raise exception 'transição de lista inválida: % -> published', v_list_status using errcode = '23514';
  end if;
  select v.status, v.version_number into v_status, v_number
    from public.list_versions v where v.id = p_version_id and v.list_id = p_list_id for update;
  if not found or v_status <> 'candidate' then
    raise exception 'versão inválida para publicação: precisa ser candidate da própria lista' using errcode = '22023';
  end if;

  update public.list_versions set status = 'superseded'
   where list_id = p_list_id and status = 'published';
  update public.list_versions set status = 'published', published_at = now() where id = p_version_id;
  update public.school_lists
     set status = 'published', current_version_id = p_version_id, published_at = now()
   where id = p_list_id;
  insert into public.list_status_events (list_id, version_id, from_status, to_status, actor_id)
  values (p_list_id, p_version_id, v_list_status, 'published', p_actor_id);
  return v_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- list_archive: published -> archived; todas as versões viram archived e a lista perde a versão atual.
-- ---------------------------------------------------------------------------
create function public.list_archive(p_list_id uuid, p_actor_id uuid, p_reason text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.list_status;
begin
  select l.status into v_from from public.school_lists l where l.id = p_list_id for no key update;
  if not found then
    raise exception 'lista não encontrada' using errcode = 'P0002';
  end if;
  if not public.list_transition_allowed(v_from, 'archived') then
    raise exception 'transição de lista inválida: % -> archived', v_from using errcode = '23514';
  end if;
  update public.school_lists
     set status = 'archived', current_version_id = null, archived_at = now()
   where id = p_list_id;
  update public.list_versions set status = 'archived', archived_at = now()
   where list_id = p_list_id and status <> 'archived';
  insert into public.list_status_events (list_id, from_status, to_status, actor_id, reason)
  values (p_list_id, v_from, 'archived', p_actor_id, p_reason);
end;
$$;

-- ---------------------------------------------------------------------------
-- list_create_candidate_version: próxima versão candidate (número sequencial sob lock da lista).
-- Não muda o estado da lista: uma lista published continua pública com a versão atual.
-- ---------------------------------------------------------------------------
create function public.list_create_candidate_version(
  p_list_id uuid, p_source public.list_version_source, p_submission_id uuid, p_created_by uuid
) returns table (version_id uuid, version_number integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.list_status;
  v_next integer;
  v_id uuid;
begin
  select l.status into v_status from public.school_lists l where l.id = p_list_id for no key update;
  if not found then
    raise exception 'lista não encontrada' using errcode = 'P0002';
  end if;
  if v_status = 'archived' then
    raise exception 'lista arquivada não aceita versões' using errcode = '23514';
  end if;
  select coalesce(max(v.version_number), 0) + 1 into v_next from public.list_versions v where v.list_id = p_list_id;
  insert into public.list_versions (list_id, version_number, source, submission_id, created_by)
  values (p_list_id, v_next, p_source, p_submission_id, p_created_by)
  returning id into v_id;
  return query select v_id, v_next;
end;
$$;

-- EXECUTE só para service_role (o Supabase concede a anon/authenticated por padrão).
revoke execute on function public.list_transition_allowed(public.list_status, public.list_status) from public, anon, authenticated, service_role;
revoke execute on function public.list_transition(uuid, public.list_status, uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.list_publish_version(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.list_archive(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.list_create_candidate_version(uuid, public.list_version_source, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.list_transition_allowed(public.list_status, public.list_status) to service_role;
grant execute on function public.list_transition(uuid, public.list_status, uuid, text) to service_role;
grant execute on function public.list_publish_version(uuid, uuid, uuid) to service_role;
grant execute on function public.list_archive(uuid, uuid, text) to service_role;
grant execute on function public.list_create_candidate_version(uuid, public.list_version_source, uuid, uuid) to service_role;
