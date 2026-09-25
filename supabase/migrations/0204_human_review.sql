-- 0204_human_review: revisão humana (S10, trilha Pipeline). Aditiva.
-- ai_decisions passa a aceitar kind='review' (edited/approved/rejected/published/publish_failed/publish_orphaned), sempre com actor_id e sem
-- provedor/modelo/prompt. O CONTEÚDO editado vive em review_versions (append-only) e o da cópia do pai em parent_list_copies;
-- ai_decisions só recebe códigos, ids e o ator. Toda decisão humana grava sua linha `review` na MESMA transação da transição do
-- envio, por funções review_* (SECURITY DEFINER, EXECUTE só service_role, papel admin conferido no SQL) sob FOR UPDATE do envio
-- e versão otimista. A cópia do pai nunca chega a review_versions, ai_decisions nem à publicação.
-- Não toca school_lists/list_versions/schools: a publicação real é da S11 (ADR-004).

-- ---------------------------------------------------------------------------
-- Validador puro dos itens da revisão (mesmas regras do Zod da S10)
-- ---------------------------------------------------------------------------
create function public.review_items_valid(p jsonb) returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  e jsonb;
  k text;
  q jsonb;
  keys constant text[] := array['name', 'quantity', 'unit', 'category', 'confidence', 'alerts', 'origin'];
  cats constant text[] := array['papelaria', 'escrita', 'arte', 'tecnologia', 'higiene', 'livros', 'uniforme', 'outros'];
  codes constant text[] := array[
    'low_confidence_item', 'ambiguous_item', 'handwritten', 'possible_collective_item',
    'restrictive_brand_or_spec', 'text_document_mismatch', 'invalid_school_grade_year'
  ];
  bad constant text := '[[:cntrl:]​-‏‪-‮⁦-⁩﻿]';
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 500 then
    return false;
  end if;
  for e in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(e) <> 'object' then
      return false;
    end if;
    for k in select jsonb_object_keys(e) loop
      if not (k = any (keys)) then
        return false;
      end if;
    end loop;
    foreach k in array keys loop
      if not (e ? k) then
        return false;
      end if;
    end loop;
    if jsonb_typeof(e -> 'name') <> 'string' or (e ->> 'name') <> btrim(e ->> 'name') or length(e ->> 'name') not between 1 and 300 or (e ->> 'name') ~ bad then
      return false;
    end if;
    q := e -> 'quantity';
    if jsonb_typeof(q) not in ('null', 'number') then
      return false;
    end if;
    if jsonb_typeof(q) = 'number' and not ((q #>> '{}')::numeric = trunc((q #>> '{}')::numeric) and (q #>> '{}')::numeric between 1 and 9999) then
      return false;
    end if;
    if jsonb_typeof(e -> 'unit') not in ('null', 'string') then
      return false;
    end if;
    if jsonb_typeof(e -> 'unit') = 'string' and (length(e ->> 'unit') > 40 or (e ->> 'unit') ~ bad) then
      return false;
    end if;
    if jsonb_typeof(e -> 'category') not in ('null', 'string') then
      return false;
    end if;
    if jsonb_typeof(e -> 'category') = 'string' and not ((e ->> 'category') = any (cats)) then
      return false;
    end if;
    if jsonb_typeof(e -> 'confidence') not in ('null', 'number') then
      return false;
    end if;
    if jsonb_typeof(e -> 'confidence') = 'number' and not ((e ->> 'confidence')::numeric between 0 and 1) then
      return false;
    end if;
    if jsonb_typeof(e -> 'alerts') <> 'array' or jsonb_array_length(e -> 'alerts') > 10 then
      return false;
    end if;
    if exists (
      select 1 from jsonb_array_elements(e -> 'alerts') x
       where jsonb_typeof(x) <> 'string' or not ((x #>> '{}') = any (codes))
    ) then
      return false;
    end if;
    if jsonb_typeof(e -> 'origin') <> 'string' or not ((e ->> 'origin') in ('extracted', 'edited', 'added')) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;
revoke execute on function public.review_items_valid(jsonb) from public, anon;
grant execute on function public.review_items_valid(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- ai_decisions: recria os CHECKs pelos nomes fixos da 0203 (aborta se algum não existir)
-- ---------------------------------------------------------------------------
do $$
declare
  n text;
begin
  foreach n in array array[
    'ai_decisions_kind_valid', 'ai_decisions_kind_decision_valid', 'ai_decisions_provider_coupling',
    'ai_decisions_reasons_scope', 'ai_decisions_published_has_version'
  ] loop
    if not exists (select 1 from pg_constraint where conrelid = 'public.ai_decisions'::regclass and conname = n and contype = 'c') then
      raise exception '0204: CHECK % não existe em ai_decisions (0203 não aplicada como esperado)', n;
    end if;
  end loop;
end
$$;

alter table public.ai_decisions
  drop constraint ai_decisions_kind_valid,
  drop constraint ai_decisions_kind_decision_valid,
  drop constraint ai_decisions_provider_coupling,
  drop constraint ai_decisions_reasons_scope;

alter table public.ai_decisions
  add constraint ai_decisions_kind_valid check (kind in ('extraction', 'publication', 'review')),
  add constraint ai_decisions_kind_decision_valid check (
    (kind = 'extraction' and decision in ('accepted', 'escalated', 'failed'))
    or (kind = 'publication' and decision in ('auto_publish', 'human_review', 'published', 'publish_failed', 'publish_orphaned'))
    or (kind = 'review' and decision in ('edited', 'approved', 'rejected', 'published', 'publish_failed', 'publish_orphaned'))
  ),
  add constraint ai_decisions_provider_coupling check (
    (kind = 'extraction' and provider is not null and model is not null and prompt_key is not null and prompt_version is not null)
    or (kind = 'publication' and provider is null and model is null and prompt_key is null and prompt_version is null)
    or (kind = 'review' and provider is null and model is null and prompt_key is null and prompt_version is null and actor_id is not null)
  ),
  add constraint ai_decisions_reasons_scope check (kind in ('publication', 'review') or reasons = '[]'::jsonb),
  add constraint ai_decisions_review_versions check (
    kind <> 'review'
    or (decision = 'edited' and previous_version_id is not null and new_version_id is not null)
    or (decision <> 'edited' and new_version_id is not null)
  );

-- No máximo uma publicação humana por envio, mesmo sem o lock.
create unique index ai_decisions_review_published_once on public.ai_decisions (entity_id)
  where kind = 'review' and decision = 'published';

-- ---------------------------------------------------------------------------
-- review_versions: versões numeradas da revisão do admin (append-only; a versão 1 é o retrato da extração)
-- ---------------------------------------------------------------------------
create table public.review_versions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.list_submissions (id) on delete cascade,
  version int not null check (version between 1 and 200),
  grade text check (grade is null or length(btrim(grade)) between 1 and 60),
  school_year int check (school_year is null or school_year between 2000 and 2100),
  items jsonb not null check (public.review_items_valid(items)),
  origin text not null check (origin in ('extraction', 'admin_edit')),
  actor_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, version),
  constraint review_versions_actor_coupling check (
    (origin = 'extraction' and actor_id is null and version = 1)
    or (origin = 'admin_edit' and actor_id is not null and version > 1)
  )
);

-- Append-only: UPDATE/TRUNCATE sempre bloqueados (inclusive em replica); DELETE só quando o envio já não existe
-- (cascata da exclusão do envio/conta), nunca direto.
create function public.review_versions_block_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.list_submissions s where s.id = old.submission_id) then
      return old;
    end if;
  end if;
  raise exception 'review_versions é append-only (% bloqueado)', tg_op using errcode = '42501';
end;
$$;
create trigger review_versions_no_update_delete before update or delete on public.review_versions
  for each row execute function public.review_versions_block_mutation();
create trigger review_versions_no_truncate before truncate on public.review_versions
  for each statement execute function public.review_versions_block_mutation();
alter table public.review_versions enable always trigger review_versions_no_update_delete;
alter table public.review_versions enable always trigger review_versions_no_truncate;

alter table public.review_versions enable row level security; -- sem política: leitura só pelo service role (após checar o papel na app)
revoke all on public.review_versions from public, anon, authenticated, service_role;
grant select on public.review_versions to service_role;

-- ---------------------------------------------------------------------------
-- parent_list_copies: cópia PRIVADA do pai (nunca oficial, nunca publicável)
-- ---------------------------------------------------------------------------
create table public.parent_list_copies (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.list_submissions (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  version int not null default 1 check (version >= 1),
  items jsonb not null check (public.review_items_valid(items)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger parent_list_copies_set_updated_at before update on public.parent_list_copies
  for each row execute function public.set_updated_at();

create function public.parent_list_copies_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.submission_id is distinct from old.submission_id or new.owner_id is distinct from old.owner_id then
    raise exception 'identidade da cópia é imutável' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger parent_list_copies_guard_update before update on public.parent_list_copies
  for each row execute function public.parent_list_copies_guard();

alter table public.parent_list_copies enable row level security;
create policy parent_list_copies_select_own on public.parent_list_copies
  for select to authenticated using (owner_id = (select auth.uid()));
revoke all on public.parent_list_copies from public, anon, authenticated, service_role;
grant select on public.parent_list_copies to authenticated; -- escrita só pelas funções parent_copy_*

-- ---------------------------------------------------------------------------
-- Auxiliares internos (ninguém executa direto; as funções abaixo rodam como dono)
-- ---------------------------------------------------------------------------
create function public.review_assert_admin(p_actor_id uuid) returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_actor_id is null or not exists (select 1 from public.profiles where id = p_actor_id and role = 'admin') then
    raise exception 'ator não é admin' using errcode = '42501';
  end if;
end;
$$;

-- Itens do resultado da extração no formato da revisão; nulo se o resultado for inválido. Não inventa: quantidade
-- fracionária ou fora de 1..9999 vira nula ("?" na tela), categoria ausente vira nula.
create function public.review_items_from_result(p_result jsonb) returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  mapped jsonb;
  cats constant text[] := array['papelaria', 'escrita', 'arte', 'tecnologia', 'higiene', 'livros', 'uniforme', 'outros'];
  codes constant text[] := array[
    'low_confidence_item', 'ambiguous_item', 'handwritten', 'possible_collective_item',
    'restrictive_brand_or_spec', 'text_document_mismatch', 'invalid_school_grade_year'
  ];
begin
  if p_result is null or jsonb_typeof(p_result -> 'items') is distinct from 'array' or jsonb_array_length(p_result -> 'items') > 500 then
    return null;
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'name', case when jsonb_typeof(i.value -> 'name') = 'string' then btrim(regexp_replace(i.value ->> 'name', '\s+', ' ', 'g')) end,
      'quantity', case when jsonb_typeof(i.value -> 'quantity') = 'number' then
          (case when (i.value ->> 'quantity')::numeric = trunc((i.value ->> 'quantity')::numeric)
                 and (i.value ->> 'quantity')::numeric between 1 and 9999
                then to_jsonb(((i.value ->> 'quantity')::numeric)::int) else 'null'::jsonb end)
        else 'null'::jsonb end,
      'unit', case when jsonb_typeof(i.value -> 'unit') = 'string' and btrim(i.value ->> 'unit') <> ''
                then to_jsonb(left(btrim(i.value ->> 'unit'), 40)) else 'null'::jsonb end,
      'category', case when jsonb_typeof(i.value -> 'category') = 'string' and (i.value ->> 'category') = any (cats)
                then i.value -> 'category' else 'null'::jsonb end,
      'confidence', case when jsonb_typeof(i.value -> 'confidence') = 'number'
                then (case when (i.value ->> 'confidence')::numeric between 0 and 1 then i.value -> 'confidence' else 'null'::jsonb end)
                else 'null'::jsonb end,
      'alerts', case when jsonb_typeof(i.value -> 'alerts') = 'array' then
          coalesce((select jsonb_agg(to_jsonb(x.a)) from (
             select distinct a from jsonb_array_elements_text(i.value -> 'alerts') a where a = any (codes) limit 10) x), '[]'::jsonb)
        else '[]'::jsonb end,
      'origin', 'extracted'
    ) order by i.ord
  ), '[]'::jsonb)
  into mapped
  from jsonb_array_elements(p_result -> 'items') with ordinality as i(value, ord)
  where jsonb_typeof(i.value) = 'object';
  if jsonb_array_length(p_result -> 'items') <> jsonb_array_length(mapped) or not public.review_items_valid(mapped) then
    return null;
  end if;
  return mapped;
end;
$$;

-- Há alerta crítico no resultado? Mesma regra de criticalAlertsIn (TS): criticalAlerts não vazio OU alerta do documento/itens
-- dentro de ai_settings.critical_alerts. Resultado ausente/não objeto = não.
create function public.review_has_critical_alert(p_result jsonb, p_config text[]) returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_result) = 'object' and (
      (jsonb_typeof(p_result -> 'criticalAlerts') = 'array' and jsonb_array_length(p_result -> 'criticalAlerts') > 0)
      or exists (
        select 1 from jsonb_array_elements_text(case when jsonb_typeof(p_result -> 'alerts') = 'array' then p_result -> 'alerts' else '[]'::jsonb end) a
         where a = any (coalesce(p_config, '{}'::text[])))
      or exists (
        select 1
          from jsonb_array_elements(case when jsonb_typeof(p_result -> 'items') = 'array' then p_result -> 'items' else '[]'::jsonb end) i,
               jsonb_array_elements_text(case when jsonb_typeof(i.value -> 'alerts') = 'array' then i.value -> 'alerts' else '[]'::jsonb end) a
         where a = any (coalesce(p_config, '{}'::text[])))
    ), false);
$$;

-- Última decisão `review` do envio (a mais recente vale: aprovar de novo depois de um publish_failed).
create function public.review_last_decision(p_submission_id uuid) returns table (decision text, new_version_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select d.decision, d.new_version_id from public.ai_decisions d
   where d.kind = 'review' and d.entity_id = p_submission_id and d.decision not in ('edited', 'publish_orphaned')
   order by d.created_at desc, d.id desc limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Funções da revisão do admin
-- ---------------------------------------------------------------------------
create function public.review_open(p_submission_id uuid, p_actor_id uuid) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  r jsonb;
  items jsonb;
  latest record;
begin
  perform public.review_assert_admin(p_actor_id);
  select id, status, grade, school_year into s from public.list_submissions where id = p_submission_id for update;
  if not found or s.status not in ('human_review', 'approved', 'published', 'rejected') then
    raise exception 'envio inexistente ou não revisável' using errcode = 'P0002';
  end if;
  select v.id, v.version into latest from public.review_versions v where v.submission_id = p_submission_id order by v.version desc limit 1;
  if latest.id is null then
    select o.result into r from public.ocr_jobs o
     where o.submission_id = p_submission_id and o.result is not null
     order by o.created_at desc, o.id desc limit 1;
    items := public.review_items_from_result(r);
    if items is null then
      -- Resultado ausente/inválido: versão 1 vazia. A aprovação segue bloqueada (no_items); o admin recusa ou digita os itens.
      items := '[]'::jsonb;
    end if;
    insert into public.review_versions (submission_id, version, grade, school_year, items, origin, actor_id)
    values (p_submission_id, 1, s.grade, s.school_year, items, 'extraction', null)
    returning id, version into latest;
  end if;
  return jsonb_build_object('version', latest.version, 'versionId', latest.id);
end;
$$;

create function public.review_save_version(p_submission_id uuid, p_actor_id uuid, p_expected_version int, p_payload jsonb) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
  st public.list_status;
  latest record;
  new_id uuid;
  g text;
  y int;
begin
  perform public.review_assert_admin(p_actor_id);
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload inválido: esperado objeto' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_payload) loop
    if not (k = any (array['grade', 'school_year', 'items'])) then
      raise exception 'payload inválido: campo não permitido' using errcode = '22023';
    end if;
  end loop;
  if not (p_payload ? 'items') or not public.review_items_valid(p_payload -> 'items') then
    raise exception 'payload inválido: items' using errcode = '22023';
  end if;
  if not (p_payload ? 'grade') or not (p_payload ? 'school_year') then
    raise exception 'payload inválido: grade e school_year são obrigatórios (null explícito)' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload -> 'grade') not in ('null', 'string') then
    raise exception 'payload inválido: grade' using errcode = '22023';
  end if;
  g := case when jsonb_typeof(p_payload -> 'grade') = 'string' then btrim(p_payload ->> 'grade') end;
  if g is not null and (length(g) not between 1 and 60 or g ~ '[[:cntrl:]]') then
    raise exception 'payload inválido: grade' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload -> 'school_year') not in ('null', 'number') then
    raise exception 'payload inválido: school_year' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload -> 'school_year') = 'number' then
    if (p_payload ->> 'school_year')::numeric <> trunc((p_payload ->> 'school_year')::numeric) or (p_payload ->> 'school_year')::numeric not between 2000 and 2100 then
      raise exception 'payload inválido: school_year' using errcode = '22023';
    end if;
    y := (p_payload ->> 'school_year')::int;
  end if;

  select status into st from public.list_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'envio inexistente' using errcode = 'P0002';
  end if;
  select v.id, v.version into latest from public.review_versions v where v.submission_id = p_submission_id order by v.version desc limit 1;
  if st <> 'human_review' or latest.id is null then
    return jsonb_build_object('state', 'not_reviewable');
  end if;
  if p_expected_version is distinct from latest.version then
    return jsonb_build_object('state', 'stale', 'version', latest.version, 'versionId', latest.id);
  end if;
  if latest.version >= 200 then
    raise exception 'limite de versões da revisão' using errcode = '22023';
  end if;
  insert into public.review_versions (submission_id, version, grade, school_year, items, origin, actor_id)
  values (p_submission_id, latest.version + 1, g, y, p_payload -> 'items', 'admin_edit', p_actor_id)
  returning id into new_id;
  insert into public.ai_decisions (entity_type, entity_id, kind, pipeline_version, decision, justification, actor_id, previous_version_id, new_version_id, created_at)
  values ('list_submission', p_submission_id, 'review', 's10.1', 'edited', 'human_edit', p_actor_id, latest.id, new_id, clock_timestamp());
  return jsonb_build_object('state', 'saved', 'version', latest.version + 1, 'versionId', new_id);
end;
$$;

create function public.review_approve(p_submission_id uuid, p_actor_id uuid, p_expected_version int, p_reasons jsonb) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.list_status;
  sid uuid;
  latest record;
  ocr_result jsonb;
  cfg text[];
  crit boolean;
  acked boolean;
begin
  perform public.review_assert_admin(p_actor_id);
  if p_reasons is null or not public.ai_reason_codes_valid(p_reasons)
     or exists (select 1 from jsonb_array_elements_text(p_reasons) r where r <> 'critical_alerts_acknowledged') then
    raise exception 'motivos inválidos' using errcode = '22023';
  end if;
  select status, school_id into st, sid from public.list_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'envio inexistente' using errcode = 'P0002';
  end if;
  select v.id, v.version, v.grade, v.school_year, v.items into latest from public.review_versions v where v.submission_id = p_submission_id order by v.version desc limit 1;
  if st <> 'human_review' or latest.id is null then
    return 'not_reviewable';
  end if;
  if p_expected_version is distinct from latest.version then
    return 'stale';
  end if;
  if jsonb_array_length(latest.items) < 1
     or exists (select 1 from jsonb_array_elements(latest.items) e where jsonb_typeof(e -> 'quantity') <> 'number' or jsonb_typeof(e -> 'category') <> 'string')
     or latest.grade is null or latest.school_year is null or sid is null then
    raise exception 'não aprovável: itens completos, série, ano e escola são obrigatórios' using errcode = '22023';
  end if;
  -- Alerta crítico (mesma definição de criticalAlertsIn, features/review/gate.ts): a confirmação é exigida quando há alerta
  -- crítico e recusada quando não há (a trilha não pode afirmar uma confirmação que não existia).
  select o.result into ocr_result from public.ocr_jobs o
   where o.submission_id = p_submission_id and o.result is not null
   order by o.created_at desc, o.id desc limit 1;
  select a.critical_alerts into cfg from public.ai_settings a where a.scope = 'default';
  crit := public.review_has_critical_alert(ocr_result, cfg);
  acked := p_reasons ? 'critical_alerts_acknowledged';
  if crit and not acked then
    raise exception 'alerta crítico: critical_alerts_acknowledged é obrigatório' using errcode = '22023';
  end if;
  if acked and not crit then
    raise exception 'critical_alerts_acknowledged sem alerta crítico' using errcode = '22023';
  end if;
  update public.list_submissions set status = 'approved' where id = p_submission_id;
  insert into public.ai_decisions (entity_type, entity_id, kind, pipeline_version, decision, justification, reasons, actor_id, new_version_id, created_at)
  values ('list_submission', p_submission_id, 'review', 's10.1', 'approved', 'human_approved', p_reasons, p_actor_id, latest.id, clock_timestamp());
  return 'approved';
end;
$$;

create function public.review_reject(p_submission_id uuid, p_actor_id uuid, p_expected_version int, p_reason text) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.list_status;
  latest record;
begin
  perform public.review_assert_admin(p_actor_id);
  if p_reason is null or not (p_reason = any (array[
    'not_a_school_list', 'illegible_document', 'wrong_school_grade_year', 'duplicate_submission', 'incomplete_list',
    'inappropriate_content', 'other'
  ])) then
    raise exception 'motivo de recusa inválido' using errcode = '22023';
  end if;
  select status into st from public.list_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'envio inexistente' using errcode = 'P0002';
  end if;
  select v.id, v.version into latest from public.review_versions v where v.submission_id = p_submission_id order by v.version desc limit 1;
  if st <> 'human_review' or latest.id is null then
    return 'not_reviewable';
  end if;
  if p_expected_version is distinct from latest.version then
    return 'stale';
  end if;
  update public.list_submissions set status = 'rejected' where id = p_submission_id;
  insert into public.ai_decisions (entity_type, entity_id, kind, pipeline_version, decision, justification, reasons, actor_id, new_version_id, created_at)
  values ('list_submission', p_submission_id, 'review', 's10.1', 'rejected', p_reason, jsonb_build_array(p_reason), p_actor_id, latest.id, clock_timestamp());
  return 'rejected';
end;
$$;

-- Lease da chamada à porta (mesma tabela da S09). Só envio aprovado por HUMANO (última decisão review = approved).
create function public.review_begin_publish(p_submission_id uuid, p_actor_id uuid, p_lease_seconds int) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.list_status;
  last record;
  until_ts timestamptz;
begin
  perform public.review_assert_admin(p_actor_id);
  if p_lease_seconds is null or p_lease_seconds not between 1 and 3600 then
    raise exception 'lease inválida: esperado 1 a 3600 segundos' using errcode = '22023';
  end if;
  select status into st from public.list_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'envio inexistente' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.ai_decisions where entity_id = p_submission_id and decision = 'published' and kind in ('review', 'publication')) then
    return jsonb_build_object('state', 'already_completed', 'approvedVersionId', null);
  end if;
  select * into last from public.review_last_decision(p_submission_id);
  if st <> 'approved' or last.decision is distinct from 'approved' then
    return jsonb_build_object('state', 'not_approved', 'approvedVersionId', null);
  end if;
  if exists (select 1 from public.ai_decisions where kind in ('publication', 'review') and entity_id = p_submission_id and decision = 'publish_orphaned') then
    return jsonb_build_object('state', 'orphaned', 'approvedVersionId', last.new_version_id);
  end if;
  select lease_until into until_ts from public.publication_leases where submission_id = p_submission_id;
  if found and until_ts > now() then
    return jsonb_build_object('state', 'busy', 'approvedVersionId', last.new_version_id);
  end if;
  insert into public.publication_leases (submission_id, lease_until)
  values (p_submission_id, now() + make_interval(secs => p_lease_seconds))
  on conflict (submission_id) do update
    set lease_until = excluded.lease_until, attempts = public.publication_leases.attempts + 1;
  return jsonb_build_object('state', 'leased', 'approvedVersionId', last.new_version_id);
end;
$$;

-- Falha transitória: solta a lease para "Tentar publicar de novo" não esperar o vencimento.
create function public.review_release_publish(p_submission_id uuid, p_actor_id uuid) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.list_status;
  last record;
begin
  perform public.review_assert_admin(p_actor_id);
  select status into st from public.list_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'envio inexistente' using errcode = 'P0002';
  end if;
  select * into last from public.review_last_decision(p_submission_id);
  if st <> 'approved' or last.decision is distinct from 'approved' then
    return 'not_approved';
  end if;
  delete from public.publication_leases where submission_id = p_submission_id;
  return 'released';
end;
$$;

create function public.review_complete_publish(p_submission_id uuid, p_actor_id uuid, p_result jsonb) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  k text;
  st public.list_status;
  last record;
begin
  perform public.review_assert_admin(p_actor_id);
  if p_result is null or jsonb_typeof(p_result) <> 'object' then
    raise exception 'resultado inválido: esperado objeto' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_result) loop
    if not (k = any (array['newVersionId', 'previousVersionId', 'listId'])) then
      raise exception 'resultado inválido: campo não permitido' using errcode = '22023';
    end if;
  end loop;
  if jsonb_typeof(p_result -> 'newVersionId') is distinct from 'string' or lower(p_result ->> 'newVersionId') !~ uuid_re then
    raise exception 'resultado inválido: newVersionId obrigatório (uuid)' using errcode = '22023';
  end if;
  foreach k in array array['previousVersionId', 'listId'] loop
    if p_result ? k and jsonb_typeof(p_result -> k) <> 'null'
       and (jsonb_typeof(p_result -> k) <> 'string' or lower(p_result ->> k) !~ uuid_re) then
      raise exception 'resultado inválido: %', k using errcode = '22023';
    end if;
  end loop;
  select status into st from public.list_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'envio inexistente' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.ai_decisions where kind = 'review' and entity_id = p_submission_id and decision = 'published') then
    return 'already_completed';
  end if;
  if exists (select 1 from public.ai_decisions where kind in ('publication', 'review') and entity_id = p_submission_id and decision = 'publish_orphaned') then
    return 'orphaned';
  end if;
  select * into last from public.review_last_decision(p_submission_id);
  if st <> 'approved' or last.decision is distinct from 'approved' then
    -- A porta publicou depois de a falha (ou recusa) ter sido gravada: a versão publicada ficaria órfã. Nunca silêncio:
    -- registra review/publish_orphaned com as versões da porta. Sem histórico de aprovação humana não é resposta a nós.
    if exists (select 1 from public.ai_decisions where kind = 'review' and entity_id = p_submission_id and decision = 'approved') then
      insert into public.ai_decisions (entity_type, entity_id, kind, pipeline_version, decision, justification, reasons, actor_id, previous_version_id, new_version_id, created_at)
      values ('list_submission', p_submission_id, 'review', 's10.1', 'publish_orphaned', 'published_after_failure', '[]'::jsonb, p_actor_id,
              (p_result ->> 'previousVersionId')::uuid, (p_result ->> 'newVersionId')::uuid, clock_timestamp());
      return 'orphaned';
    end if;
    return 'not_approved';
  end if;
  insert into public.ai_decisions (entity_type, entity_id, kind, pipeline_version, decision, justification, actor_id, previous_version_id, new_version_id, created_at)
  values ('list_submission', p_submission_id, 'review', 's10.1', 'published', 'human_published', p_actor_id,
          (p_result ->> 'previousVersionId')::uuid, (p_result ->> 'newVersionId')::uuid, clock_timestamp());
  update public.list_submissions set status = 'published' where id = p_submission_id;
  delete from public.publication_leases where submission_id = p_submission_id;
  return 'completed';
end;
$$;

create function public.review_publish_fail(p_submission_id uuid, p_actor_id uuid, p_reason text) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.list_status;
  last record;
  until_ts timestamptz;
begin
  perform public.review_assert_admin(p_actor_id);
  if p_reason is null or p_reason !~ '^[a-z][a-z0-9_]{0,59}$' then
    raise exception 'motivo inválido: esperado código' using errcode = '22023';
  end if;
  select status into st from public.list_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'envio inexistente' using errcode = 'P0002';
  end if;
  select * into last from public.review_last_decision(p_submission_id);
  if st <> 'approved' or last.decision is distinct from 'approved' then
    return 'not_approved';
  end if;
  -- Chamada à porta em voo (lease ativa): falhar agora deixaria a publicação sem trilha. Quem tem a lease libera antes.
  select lease_until into until_ts from public.publication_leases where submission_id = p_submission_id;
  if found and until_ts > now() then
    return 'busy';
  end if;
  insert into public.ai_decisions (entity_type, entity_id, kind, pipeline_version, decision, justification, reasons, actor_id, new_version_id, created_at)
  values ('list_submission', p_submission_id, 'review', 's10.1', 'publish_failed', p_reason, jsonb_build_array(p_reason), p_actor_id, last.new_version_id, clock_timestamp());
  update public.list_submissions set status = 'human_review' where id = p_submission_id;
  delete from public.publication_leases where submission_id = p_submission_id;
  return 'failed';
end;
$$;

-- ---------------------------------------------------------------------------
-- Cópia privada do pai (sem admin, sem review_versions, sem ai_decisions, sem mexer no envio)
-- ---------------------------------------------------------------------------
create function public.parent_copy_open(p_submission_id uuid, p_owner_id uuid) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  items jsonb;
  c record;
begin
  select id, submitted_by, source into s from public.list_submissions where id = p_submission_id;
  if not found or p_owner_id is null or s.submitted_by <> p_owner_id or s.source <> 'parent' then
    raise exception 'cópia indisponível' using errcode = 'P0002';
  end if;
  select pc.id, pc.version, pc.items into c from public.parent_list_copies pc where pc.submission_id = p_submission_id;
  if c.id is null then
    items := public.review_items_from_result((
      select o.result from public.ocr_jobs o where o.submission_id = p_submission_id and o.result is not null
       order by o.created_at desc, o.id desc limit 1));
    if items is null then
      raise exception 'cópia indisponível' using errcode = 'P0002';
    end if;
    insert into public.parent_list_copies (submission_id, owner_id, items) values (p_submission_id, p_owner_id, items)
    on conflict (submission_id) do nothing;
    select pc.id, pc.version, pc.items into c from public.parent_list_copies pc where pc.submission_id = p_submission_id;
  end if;
  return jsonb_build_object('copyId', c.id, 'version', c.version, 'items', c.items);
end;
$$;

create function public.parent_copy_save(p_copy_id uuid, p_owner_id uuid, p_expected_version int, p_items jsonb) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  select pc.id, pc.version, pc.owner_id into c from public.parent_list_copies pc where pc.id = p_copy_id for update;
  if not found or p_owner_id is null or c.owner_id <> p_owner_id then
    raise exception 'cópia indisponível' using errcode = 'P0002';
  end if;
  if not public.review_items_valid(p_items) then
    raise exception 'itens inválidos' using errcode = '22023';
  end if;
  if p_expected_version is distinct from c.version then
    return 'stale';
  end if;
  update public.parent_list_copies set items = p_items, version = c.version + 1 where id = p_copy_id;
  return 'saved';
end;
$$;

-- ---------------------------------------------------------------------------
-- Comentários e privilégios (EXECUTE só service_role)
-- ---------------------------------------------------------------------------
comment on table public.review_versions is 'S10: versões da revisão do admin (append-only); a versão 1 é o retrato da extração.';
comment on table public.parent_list_copies is 'S10: cópia privada do pai; nunca oficial nem publicável; escrita só pelas funções parent_copy_*.';
comment on function public.review_items_valid(jsonb) is 'S10: validador puro dos itens da revisão (mesmas regras do Zod).';
comment on function public.review_open(uuid, uuid) is 'S10: cria a versão 1 (retrato da extração; vazia se o resultado faltar ou for inválido) se faltar; devolve a versão vigente.';
comment on function public.review_has_critical_alert(jsonb, text[]) is 'S10: paridade SQL de criticalAlertsIn (features/review/gate.ts).';
comment on column public.ai_decisions.new_version_id is 'Significado por decision: publication published/publish_orphaned e review published/publish_orphaned = versão da LISTA criada pela porta; review edited/approved/rejected/publish_failed = id de review_versions (a nova/vigente/aprovada).';
comment on function public.review_save_version(uuid, uuid, int, jsonb) is 'S10: edição versionada e auditada (saved/stale/not_reviewable) sob lock do envio.';
comment on function public.review_approve(uuid, uuid, int, jsonb) is 'S10: aprovação humana (human_review -> approved) com linha review/approved.';
comment on function public.review_reject(uuid, uuid, int, text) is 'S10: recusa humana com motivo de lista fechada (human_review -> rejected).';
comment on function public.review_begin_publish(uuid, uuid, int) is 'S10: lease da publicação humana (leased/busy/already_completed/not_approved/orphaned).';
comment on function public.review_release_publish(uuid, uuid) is 'S10: solta a lease após falha transitória da porta.';
comment on function public.review_complete_publish(uuid, uuid, jsonb) is 'S10: registra a publicação humana (review/published) e fecha o envio.';
comment on function public.review_publish_fail(uuid, uuid, text) is 'S10: publicação humana falhou de forma permanente (approved -> human_review).';
comment on function public.parent_copy_open(uuid, uuid) is 'S10: abre/cria a cópia privada do pai (dono do envio de origem parent).';
comment on function public.parent_copy_save(uuid, uuid, int, jsonb) is 'S10: salva a cópia do pai com versão otimista (saved/stale).';

revoke execute on function
  public.review_versions_block_mutation(), public.parent_list_copies_guard(),
  public.review_assert_admin(uuid), public.review_items_from_result(jsonb), public.review_last_decision(uuid), public.review_has_critical_alert(jsonb, text[]),
  public.review_open(uuid, uuid), public.review_save_version(uuid, uuid, int, jsonb), public.review_approve(uuid, uuid, int, jsonb),
  public.review_reject(uuid, uuid, int, text), public.review_begin_publish(uuid, uuid, int), public.review_release_publish(uuid, uuid),
  public.review_complete_publish(uuid, uuid, jsonb), public.review_publish_fail(uuid, uuid, text),
  public.parent_copy_open(uuid, uuid), public.parent_copy_save(uuid, uuid, int, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.review_open(uuid, uuid), public.review_save_version(uuid, uuid, int, jsonb), public.review_approve(uuid, uuid, int, jsonb),
  public.review_reject(uuid, uuid, int, text), public.review_begin_publish(uuid, uuid, int), public.review_release_publish(uuid, uuid),
  public.review_complete_publish(uuid, uuid, jsonb), public.review_publish_fail(uuid, uuid, text),
  public.parent_copy_open(uuid, uuid), public.parent_copy_save(uuid, uuid, int, jsonb)
  to service_role;
