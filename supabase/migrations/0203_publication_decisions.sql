-- 0203_publication_decisions: decisão automática de publicação (S09, trilha Pipeline). Aditiva, sem tabela nova e sem FK.
-- ai_decisions passa a aceitar kind='publication' (auto_publish/human_review/published/publish_failed) com vários motivos
-- (reasons), sem provedor/modelo/prompt. Linhas 'publication' só nascem pelas funções publication_* abaixo, junto com a
-- transição do envio (list_submissions.status), sob lock do envio e com índices únicos como defesa extra.
-- Não toca school_lists/list_versions/schools: a publicação real é da S11 (ADR-004).

-- ---------------------------------------------------------------------------
-- Validador puro dos motivos (mesmo padrão dos validadores da 0202)
-- ---------------------------------------------------------------------------
create function public.ai_reason_codes_valid(r jsonb) returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(r) <> 'array' then false
    when jsonb_array_length(r) > 32 then false
    else not exists (
      select 1 from jsonb_array_elements(r) e
      where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^[a-z][a-z0-9_]{0,63}$'
    )
  end;
$$;
revoke execute on function public.ai_reason_codes_valid(jsonb) from public, anon;
grant execute on function public.ai_reason_codes_valid(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- ai_settings: interruptor da publicação automática (auditado pelo trigger ai_settings_audit)
-- ---------------------------------------------------------------------------
alter table public.ai_settings add column auto_publish_enabled boolean not null default true;

-- ---------------------------------------------------------------------------
-- ai_decisions: kind/decision por acoplamento, provider/model/prompt nulos só em publication, reasons
-- ---------------------------------------------------------------------------
-- Os CHECKs de coluna única da 0202 (kind e decision) têm nome gerado; leio o nome real em pg_constraint,
-- removo explicitamente e confirmo que sobrou nenhum antes de recriar com nomes fixos.
do $$
declare
  col text;
  cname text;
  n int;
begin
  foreach col in array array['kind', 'decision'] loop
    n := 0;
    for cname in
      select c.conname
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
       where c.conrelid = 'public.ai_decisions'::regclass
         and c.contype = 'c'
         and array_length(c.conkey, 1) = 1
         and a.attname = col
    loop
      execute format('alter table public.ai_decisions drop constraint %I', cname);
      n := n + 1;
    end loop;
    if n <> 1 then
      raise exception '0203: esperado exatamente 1 CHECK de coluna única em ai_decisions.%, achei %', col, n;
    end if;
  end loop;
end
$$;

alter table public.ai_decisions
  alter column provider drop not null,
  alter column model drop not null,
  alter column prompt_key drop not null,
  alter column prompt_version drop not null;

alter table public.ai_decisions add column reasons jsonb not null default '[]'::jsonb;

alter table public.ai_decisions
  add constraint ai_decisions_kind_valid check (kind in ('extraction', 'publication')),
  add constraint ai_decisions_kind_decision_valid check (
    (kind = 'extraction' and decision in ('accepted', 'escalated', 'failed'))
    or (kind = 'publication' and decision in ('auto_publish', 'human_review', 'published', 'publish_failed'))
  ),
  add constraint ai_decisions_provider_coupling check (
    (kind = 'extraction' and provider is not null and model is not null and prompt_key is not null and prompt_version is not null)
    or (kind = 'publication' and provider is null and model is null and prompt_key is null and prompt_version is null)
  ),
  add constraint ai_decisions_reasons_valid check (public.ai_reason_codes_valid(reasons)),
  add constraint ai_decisions_reasons_scope check (kind = 'publication' or reasons = '[]'::jsonb),
  add constraint ai_decisions_published_has_version check (decision <> 'published' or new_version_id is not null);

-- No máximo um veredito (auto_publish OU human_review) e um published por envio, mesmo sem o lock.
create unique index ai_decisions_publication_one_verdict on public.ai_decisions (entity_id)
  where kind = 'publication' and decision in ('auto_publish', 'human_review');
create unique index ai_decisions_publication_once on public.ai_decisions (entity_id, decision)
  where kind = 'publication';

-- ---------------------------------------------------------------------------
-- ai_record_decision: só extraction (create or replace; corpo da 0202 + a recusa de kind)
-- ---------------------------------------------------------------------------
create or replace function public.ai_record_decision(p_decision jsonb) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed constant text[] := array[
    'entity_type', 'entity_id', 'kind', 'provider', 'model', 'prompt_key', 'prompt_version', 'pipeline_version',
    'overall_score', 'item_scores', 'alerts', 'decision', 'justification', 'actor_id', 'previous_version_id',
    'new_version_id', 'attempt', 'started_at', 'finished_at', 'latency_ms'
  ];
  required constant text[] := array[
    'entity_type', 'entity_id', 'kind', 'provider', 'model', 'prompt_key', 'prompt_version', 'pipeline_version', 'decision'
  ];
  k text;
  new_id uuid;
begin
  if p_decision is null or jsonb_typeof(p_decision) <> 'object' then
    raise exception 'decisão inválida: esperado objeto' using errcode = '22023';
  end if;
  if octet_length(p_decision::text) > 100000 then
    raise exception 'decisão inválida: JSON grande demais' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_decision) loop
    if not (k = any (allowed)) then
      raise exception 'decisão inválida: campo não permitido' using errcode = '22023';
    end if;
  end loop;
  -- publication nunca entra por aqui: pularia a transição do envio (use publication_record_verdict/complete/fail).
  if p_decision ->> 'kind' is distinct from 'extraction' then
    raise exception 'decisão inválida: só kind extraction' using errcode = '22023';
  end if;
  foreach k in array required loop
    if not (p_decision ? k) or jsonb_typeof(p_decision -> k) <> 'string' and k <> 'prompt_version' then
      raise exception 'decisão inválida: campo obrigatório ausente ou com tipo errado (%)', k using errcode = '22023';
    end if;
  end loop;
  if jsonb_typeof(p_decision -> 'prompt_version') <> 'number' then
    raise exception 'decisão inválida: prompt_version' using errcode = '22023';
  end if;
  if p_decision ? 'overall_score' and jsonb_typeof(p_decision -> 'overall_score') not in ('number', 'null') then
    raise exception 'decisão inválida: overall_score' using errcode = '22023';
  end if;
  if p_decision ? 'attempt' and jsonb_typeof(p_decision -> 'attempt') <> 'number' then
    raise exception 'decisão inválida: attempt' using errcode = '22023';
  end if;
  if p_decision ? 'latency_ms' and jsonb_typeof(p_decision -> 'latency_ms') not in ('number', 'null') then
    raise exception 'decisão inválida: latency_ms' using errcode = '22023';
  end if;
  if p_decision ? 'item_scores' and not public.ai_item_scores_valid(p_decision -> 'item_scores') then
    raise exception 'decisão inválida: item_scores' using errcode = '22023';
  end if;
  if p_decision ? 'alerts' and not public.ai_alerts_valid(p_decision -> 'alerts') then
    raise exception 'decisão inválida: alerts' using errcode = '22023';
  end if;
  foreach k in array array['justification', 'actor_id', 'previous_version_id', 'new_version_id', 'started_at', 'finished_at'] loop
    if p_decision ? k and jsonb_typeof(p_decision -> k) not in ('string', 'null') then
      raise exception 'decisão inválida: % deve ser texto', k using errcode = '22023';
    end if;
  end loop;

  -- demais limites (faixas, enums, tamanhos) são CHECKs da tabela.
  insert into public.ai_decisions (
    entity_type, entity_id, kind, provider, model, prompt_key, prompt_version, pipeline_version,
    overall_score, item_scores, alerts, decision, justification, actor_id, previous_version_id, new_version_id,
    attempt, started_at, finished_at, latency_ms
  ) values (
    p_decision ->> 'entity_type', (p_decision ->> 'entity_id')::uuid, p_decision ->> 'kind',
    p_decision ->> 'provider', p_decision ->> 'model', p_decision ->> 'prompt_key',
    (p_decision ->> 'prompt_version')::int, p_decision ->> 'pipeline_version',
    (p_decision ->> 'overall_score')::numeric,
    coalesce(p_decision -> 'item_scores', '[]'::jsonb), coalesce(p_decision -> 'alerts', '[]'::jsonb),
    p_decision ->> 'decision', p_decision ->> 'justification', (p_decision ->> 'actor_id')::uuid,
    (p_decision ->> 'previous_version_id')::uuid, (p_decision ->> 'new_version_id')::uuid,
    coalesce((p_decision ->> 'attempt')::int, 1),
    coalesce((p_decision ->> 'started_at')::timestamptz, now()),
    coalesce((p_decision ->> 'finished_at')::timestamptz, now()),
    (p_decision ->> 'latency_ms')::int
  ) returning id into new_id;
  return new_id;
end;
$$;
revoke execute on function public.ai_record_decision(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.ai_record_decision(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Funções da publicação (SECURITY DEFINER, search_path vazio, EXECUTE só service_role)
-- ---------------------------------------------------------------------------
-- Entrada do motor: só o que a decisão precisa (sem file_name, storage_path, notify_target, nome ou contato).
create function public.publication_load_input(p_submission_id uuid) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s record;
  r jsonb;
begin
  select id, status, source, school_id, submitted_by, grade, school_year, is_demo
    into s from public.list_submissions where id = p_submission_id;
  if not found then
    raise exception 'envio inexistente' using errcode = 'P0002';
  end if;
  select o.result into r from public.ocr_jobs o
   where o.submission_id = p_submission_id and o.result is not null
   order by o.created_at desc, o.id desc limit 1;
  return jsonb_build_object(
    'status', s.status::text, 'source', s.source::text, 'school_id', s.school_id, 'submitted_by', s.submitted_by,
    'grade', s.grade, 'school_year', s.school_year, 'is_demo', s.is_demo, 'result', r
  );
end;
$$;

-- Grava o veredito e move o envio na MESMA transação, sob lock do envio. O status é o claim:
-- review_needed -> approved (auto_publish) ou human_review. Quem perde a corrida recebe already_decided.
create function public.publication_record_verdict(p_submission_id uuid, p_verdict jsonb) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed constant text[] := array[
    'decision', 'justification', 'reasons', 'overall_score', 'item_scores', 'alerts', 'pipeline_version',
    'started_at', 'finished_at', 'latency_ms'
  ];
  k text;
  st public.list_status;
  dec text;
begin
  if p_verdict is null or jsonb_typeof(p_verdict) <> 'object' then
    raise exception 'veredito inválido: esperado objeto' using errcode = '22023';
  end if;
  if octet_length(p_verdict::text) > 100000 then
    raise exception 'veredito inválido: JSON grande demais' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_verdict) loop
    if not (k = any (allowed)) then
      raise exception 'veredito inválido: campo não permitido' using errcode = '22023';
    end if;
  end loop;
  foreach k in array array['decision', 'justification', 'reasons', 'pipeline_version'] loop
    if not (p_verdict ? k) then
      raise exception 'veredito inválido: campo obrigatório ausente (%)', k using errcode = '22023';
    end if;
  end loop;
  if jsonb_typeof(p_verdict -> 'decision') <> 'string' or (p_verdict ->> 'decision') not in ('auto_publish', 'human_review') then
    raise exception 'veredito inválido: decision' using errcode = '22023';
  end if;
  dec := p_verdict ->> 'decision';
  if jsonb_typeof(p_verdict -> 'justification') <> 'string' or (p_verdict ->> 'justification') !~ '^[a-z][a-z0-9_:.-]{0,59}$' then
    raise exception 'veredito inválido: justification' using errcode = '22023';
  end if;
  if jsonb_typeof(p_verdict -> 'pipeline_version') <> 'string' or length(btrim(p_verdict ->> 'pipeline_version')) not between 1 and 40 then
    raise exception 'veredito inválido: pipeline_version' using errcode = '22023';
  end if;
  if not public.ai_reason_codes_valid(p_verdict -> 'reasons') then
    raise exception 'veredito inválido: reasons' using errcode = '22023';
  end if;
  -- auto_publish só com todas as regras passando; human_review sempre com ao menos um motivo.
  if (dec = 'auto_publish') <> (jsonb_array_length(p_verdict -> 'reasons') = 0) then
    raise exception 'veredito inválido: decision incoerente com reasons' using errcode = '22023';
  end if;
  if p_verdict ? 'overall_score' and jsonb_typeof(p_verdict -> 'overall_score') not in ('number', 'null') then
    raise exception 'veredito inválido: overall_score' using errcode = '22023';
  end if;
  if p_verdict ? 'latency_ms' and jsonb_typeof(p_verdict -> 'latency_ms') not in ('number', 'null') then
    raise exception 'veredito inválido: latency_ms' using errcode = '22023';
  end if;
  if p_verdict ? 'item_scores' and not public.ai_item_scores_valid(p_verdict -> 'item_scores') then
    raise exception 'veredito inválido: item_scores' using errcode = '22023';
  end if;
  if p_verdict ? 'alerts' and not public.ai_alerts_valid(p_verdict -> 'alerts') then
    raise exception 'veredito inválido: alerts' using errcode = '22023';
  end if;
  foreach k in array array['started_at', 'finished_at'] loop
    if p_verdict ? k and jsonb_typeof(p_verdict -> k) not in ('string', 'null') then
      raise exception 'veredito inválido: % deve ser texto', k using errcode = '22023';
    end if;
  end loop;

  select status into st from public.list_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'envio inexistente' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.ai_decisions
     where kind = 'publication' and entity_id = p_submission_id and decision in ('auto_publish', 'human_review')
  ) then
    return 'already_decided';
  end if;
  if st in ('draft', 'submitted', 'processing', 'processing_async', 'rejected') then
    return 'not_ready';
  end if;
  if st <> 'review_needed' then
    return 'already_decided';
  end if;
  if not exists (select 1 from public.ocr_jobs o where o.submission_id = p_submission_id and o.result is not null) then
    return 'not_ready';
  end if;

  insert into public.ai_decisions (
    entity_type, entity_id, kind, pipeline_version, overall_score, item_scores, alerts, decision, justification,
    reasons, actor_id, started_at, finished_at, latency_ms
  ) values (
    'list_submission', p_submission_id, 'publication', p_verdict ->> 'pipeline_version',
    (p_verdict ->> 'overall_score')::numeric,
    coalesce(p_verdict -> 'item_scores', '[]'::jsonb), coalesce(p_verdict -> 'alerts', '[]'::jsonb),
    dec, p_verdict ->> 'justification', p_verdict -> 'reasons', null,
    coalesce((p_verdict ->> 'started_at')::timestamptz, now()),
    coalesce((p_verdict ->> 'finished_at')::timestamptz, now()),
    (p_verdict ->> 'latency_ms')::int
  );
  update public.list_submissions
     set status = case when dec = 'auto_publish' then 'approved'::public.list_status else 'human_review'::public.list_status end
   where id = p_submission_id;
  return 'recorded';
end;
$$;

-- Registra a publicação feita pela porta (versões anterior e nova) e fecha o envio como published.
create function public.publication_complete(p_submission_id uuid, p_result jsonb) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed constant text[] := array['new_version_id', 'previous_version_id', 'started_at', 'finished_at', 'latency_ms'];
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  k text;
  st public.list_status;
  pv text;
begin
  if p_result is null or jsonb_typeof(p_result) <> 'object' then
    raise exception 'resultado inválido: esperado objeto' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_result) loop
    if not (k = any (allowed)) then
      raise exception 'resultado inválido: campo não permitido' using errcode = '22023';
    end if;
  end loop;
  if jsonb_typeof(p_result -> 'new_version_id') is distinct from 'string' or lower(p_result ->> 'new_version_id') !~ uuid_re then
    raise exception 'resultado inválido: new_version_id obrigatório (uuid)' using errcode = '22023';
  end if;
  if p_result ? 'previous_version_id' and jsonb_typeof(p_result -> 'previous_version_id') <> 'null'
     and (jsonb_typeof(p_result -> 'previous_version_id') <> 'string' or lower(p_result ->> 'previous_version_id') !~ uuid_re) then
    raise exception 'resultado inválido: previous_version_id' using errcode = '22023';
  end if;
  if p_result ? 'latency_ms' and jsonb_typeof(p_result -> 'latency_ms') not in ('number', 'null') then
    raise exception 'resultado inválido: latency_ms' using errcode = '22023';
  end if;
  foreach k in array array['started_at', 'finished_at'] loop
    if p_result ? k and jsonb_typeof(p_result -> k) not in ('string', 'null') then
      raise exception 'resultado inválido: % deve ser texto', k using errcode = '22023';
    end if;
  end loop;

  select status into st from public.list_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'envio inexistente' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.ai_decisions where kind = 'publication' and entity_id = p_submission_id and decision = 'published') then
    return 'already_completed';
  end if;
  select d.pipeline_version into pv from public.ai_decisions d
   where d.kind = 'publication' and d.entity_id = p_submission_id and d.decision = 'auto_publish';
  if st <> 'approved' or pv is null then
    return 'not_approved';
  end if;

  insert into public.ai_decisions (
    entity_type, entity_id, kind, pipeline_version, decision, justification, reasons, actor_id,
    previous_version_id, new_version_id, started_at, finished_at, latency_ms
  ) values (
    'list_submission', p_submission_id, 'publication', pv, 'published', 'published', '[]'::jsonb, null,
    (p_result ->> 'previous_version_id')::uuid, (p_result ->> 'new_version_id')::uuid,
    coalesce((p_result ->> 'started_at')::timestamptz, now()),
    coalesce((p_result ->> 'finished_at')::timestamptz, now()),
    (p_result ->> 'latency_ms')::int
  );
  update public.list_submissions set status = 'published' where id = p_submission_id;
  return 'completed';
end;
$$;

-- A publicação não aconteceu (erro permanente ou prazo): approved -> human_review com linha publish_failed.
-- O envio não é school_lists: a matriz de transições da 0103 não se aplica.
create function public.publication_fail(p_submission_id uuid, p_reason text) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.list_status;
  pv text;
begin
  if p_reason is null or p_reason !~ '^[a-z][a-z0-9_:.-]{0,59}$' then
    raise exception 'motivo inválido: esperado código' using errcode = '22023';
  end if;
  select status into st from public.list_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'envio inexistente' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.ai_decisions where kind = 'publication' and entity_id = p_submission_id and decision = 'publish_failed') then
    return 'already_failed';
  end if;
  select d.pipeline_version into pv from public.ai_decisions d
   where d.kind = 'publication' and d.entity_id = p_submission_id and d.decision = 'auto_publish';
  if st <> 'approved' or pv is null
     or exists (select 1 from public.ai_decisions where kind = 'publication' and entity_id = p_submission_id and decision = 'published') then
    return 'not_approved';
  end if;

  insert into public.ai_decisions (entity_type, entity_id, kind, pipeline_version, decision, justification, reasons, actor_id)
  values ('list_submission', p_submission_id, 'publication', pv, 'publish_failed', p_reason, jsonb_build_array(p_reason), null);
  update public.list_submissions set status = 'human_review' where id = p_submission_id;
  return 'failed';
end;
$$;

-- Varredor: envios prontos para decidir (review_needed com resultado e sem veredito) e veredito sem publicação
-- (approved sem published), do mais antigo ao mais novo, com idade mínima e lote no máximo 50.
create function public.publication_pending(p_limit int, p_min_age_seconds int)
returns table (submission_id uuid, state text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    select s.id as submission_id, 'decide'::text as state, s.updated_at
      from public.list_submissions s
     where s.status = 'review_needed'
       and s.updated_at <= now() - make_interval(secs => greatest(coalesce(p_min_age_seconds, 0), 0))
       and exists (select 1 from public.ocr_jobs o where o.submission_id = s.id and o.result is not null)
       and not exists (
         select 1 from public.ai_decisions d
          where d.kind = 'publication' and d.entity_id = s.id and d.decision in ('auto_publish', 'human_review')
       )
    union all
    select s.id, 'publish'::text, s.updated_at
      from public.list_submissions s
     where s.status = 'approved'
       and s.updated_at <= now() - make_interval(secs => greatest(coalesce(p_min_age_seconds, 0), 0))
       and not exists (
         select 1 from public.ai_decisions d where d.kind = 'publication' and d.entity_id = s.id and d.decision = 'published'
       )
  ) q
  order by q.updated_at, q.submission_id
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

comment on function public.publication_load_input(uuid) is 'S09: entrada do motor de publicação (sem arquivo, caminho nem contato).';
comment on function public.publication_record_verdict(uuid, jsonb) is 'S09: grava o veredito e move o envio (approved/human_review) sob lock; recorded, already_decided ou not_ready.';
comment on function public.publication_complete(uuid, jsonb) is 'S09: registra a publicação (versões anterior e nova) e fecha o envio como published.';
comment on function public.publication_fail(uuid, text) is 'S09: publicação não ocorreu; approved vira human_review com publish_failed.';
comment on function public.publication_pending(int, int) is 'S09: varredor de envios a decidir ou a publicar (lote máximo 50).';

revoke execute on function
  public.publication_load_input(uuid), public.publication_record_verdict(uuid, jsonb), public.publication_complete(uuid, jsonb),
  public.publication_fail(uuid, text), public.publication_pending(int, int)
  from public, anon, authenticated, service_role;
grant execute on function
  public.publication_load_input(uuid), public.publication_record_verdict(uuid, jsonb), public.publication_complete(uuid, jsonb),
  public.publication_fail(uuid, text), public.publication_pending(int, int)
  to service_role;
