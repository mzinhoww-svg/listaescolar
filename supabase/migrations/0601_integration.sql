-- 0601_integration: integração das trilhas (S11, Task 2). Depende da 0600 (FKs) e das 01xx/02xx/03xx.
-- Perfil técnico `system`; publicação atômica e idempotente (ListPublisher real); leituras das portas reais (contexto de
-- publicação, rótulos de escola, leitor de listas do carrinho, contexto do lead); vínculo da escola no envio (D-002);
-- escola atribuída na revisão; conciliação de publish_orphaned (D-066); origem da lista em carrinhos e leads;
-- pepper da auditoria lido do Vault quando o GUC não existe (D-059).
-- Todas as funções: SECURITY DEFINER, search_path vazio, EXECUTE só para service_role, erros com errcode + hint estáveis.

-- ---------------------------------------------------------------------------
-- 1. Publicação: chave idempotente, hash do payload, versão anterior e origem do item
-- ---------------------------------------------------------------------------
alter table public.list_versions
  add column publication_key text,
  add column publication_hash text,
  add column publication_previous_id uuid,
  add constraint list_versions_publication_key_len check (publication_key is null or length(publication_key) between 1 and 200),
  add constraint list_versions_publication_pair check ((publication_key is null) = (publication_hash is null));
create unique index list_versions_publication_key_idx on public.list_versions (publication_key) where publication_key is not null;
comment on column public.list_versions.publication_key is 'S11: chave idempotente da publicação (automática = id do envio; humana = id da versão aprovada da revisão). Interna, fora dos grants públicos.';
comment on column public.list_versions.publication_hash is 'S11: sha256 do payload canônico (escola, série, ano, origem e itens); chave repetida com hash diferente = idempotency_conflict.';
comment on column public.list_versions.publication_previous_id is 'S11: versão que estava publicada quando esta foi publicada (o replay devolve o mesmo previousVersionId).';

alter table public.list_items
  add column origin text not null default 'extracted',
  add constraint list_items_origin_valid check (origin in ('extracted', 'reviewed'));
comment on column public.list_items.origin is 'S11: extracted = veio da extração; reviewed = conferido/editado/adicionado pela equipe (confidence nula não é inventada). Interna.';

-- ---------------------------------------------------------------------------
-- 2. Perfil técnico `system` (UUID fixo; sem senha, sem identidade, banido, papel system)
-- ---------------------------------------------------------------------------
-- Risco de versão do GoTrue: só colunas estáveis de auth.users, e as de token com '' (versões antigas do GoTrue leem
-- NULL como erro). O usuário é banido para sempre, sem senha e sem identidade: nenhum login (senha, OTP, OAuth) o alcança.
insert into auth.users (id, aud, role, email, encrypted_password, banned_until, raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new, email_change, created_at, updated_at)
values ('00000000-0000-4000-8000-00000000c0de', 'authenticated', 'authenticated', 'system@listacerta.invalid', null, 'infinity',
        '{"provider":"system","providers":["system"]}'::jsonb, '{}'::jsonb, '', '', '', '', now(), now())
on conflict (id) do nothing;
-- o gatilho da 0002 cria o perfil `parent`; a promoção é explícita (o guard da 0001 a permite ao dono do banco).
insert into public.profiles (id, role, display_name) values ('00000000-0000-4000-8000-00000000c0de', 'parent', 'Sistema')
on conflict (id) do nothing;
update public.profiles set role = 'system', display_name = 'Sistema' where id = '00000000-0000-4000-8000-00000000c0de' and role <> 'system';

create function public.system_profile_id() returns uuid
language sql
immutable
set search_path = ''
as $$ select '00000000-0000-4000-8000-00000000c0de'::uuid; $$;

-- ---------------------------------------------------------------------------
-- 3. Conciliação: órfão pendente e decisão review/reconciled
-- ---------------------------------------------------------------------------
alter table public.ai_decisions drop constraint ai_decisions_kind_decision_valid;
alter table public.ai_decisions add constraint ai_decisions_kind_decision_valid check (
  (kind = 'extraction' and decision in ('accepted', 'escalated', 'failed'))
  or (kind = 'publication' and decision in ('auto_publish', 'human_review', 'published', 'publish_failed', 'publish_orphaned'))
  or (kind = 'review' and decision in ('edited', 'approved', 'rejected', 'published', 'publish_failed', 'publish_orphaned', 'reconciled'))
);

-- Última decisão de revisão que vale para o fluxo (edições, órfãos e conciliações não contam).
create or replace function public.review_last_decision(p_submission_id uuid) returns table (decision text, new_version_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select d.decision, d.new_version_id from public.ai_decisions d
   where d.kind = 'review' and d.entity_id = p_submission_id and d.decision not in ('edited', 'publish_orphaned', 'reconciled')
   order by d.created_at desc, d.id desc limit 1;
$$;

-- Órfão pendente: há publish_orphaned (publicação automática ou humana) mais novo que a última conciliação.
create function public.publication_orphan_pending(p_submission_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.ai_decisions o
     where o.entity_id = p_submission_id and o.kind in ('publication', 'review') and o.decision = 'publish_orphaned'
       and not exists (
         select 1 from public.ai_decisions r
          where r.entity_id = p_submission_id and r.kind = 'review' and r.decision = 'reconciled'
            and (r.created_at, r.id) > (o.created_at, o.id)
       )
  );
$$;

-- review_begin_publish: corpo da 0204; a única mudança é ignorar o órfão já conciliado.
create or replace function public.review_begin_publish(p_submission_id uuid, p_actor_id uuid, p_lease_seconds int) returns jsonb
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
  if public.publication_orphan_pending(p_submission_id) then
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

-- review_complete_publish: corpo da 0204; a única mudança é ignorar o órfão já conciliado.
create or replace function public.review_complete_publish(p_submission_id uuid, p_actor_id uuid, p_result jsonb) returns text
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
  if public.publication_orphan_pending(p_submission_id) then
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

-- Conciliação por ação do admin. Resultados: reconciled (versão encontrada, envio published), orphan_not_found (registrado;
-- a publicação humana fica liberada) e not_orphaned (nada pendente: no-op). Nunca vincula sozinha uma versão duvidosa:
-- só vale a versão que a própria porta registrou no órfão E que existe publicada/superseded com chave do próprio envio.
create function public.publication_reconcile_orphan(p_submission_id uuid, p_actor_id uuid) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.list_status;
  o record;
  v record;
begin
  perform public.review_assert_admin(p_actor_id);
  select status into st from public.list_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'envio inexistente' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.ai_decisions where entity_id = p_submission_id and decision = 'published' and kind in ('review', 'publication'))
     or not public.publication_orphan_pending(p_submission_id) then
    return 'not_orphaned';
  end if;
  select d.previous_version_id, d.new_version_id into o from public.ai_decisions d
   where d.entity_id = p_submission_id and d.kind in ('publication', 'review') and d.decision = 'publish_orphaned'
   order by d.created_at desc, d.id desc limit 1;
  select lv.id into v from public.list_versions lv
   where lv.status in ('published', 'superseded')
     and (lv.publication_key = p_submission_id::text
          or lv.publication_key in (select rv.id::text from public.review_versions rv where rv.submission_id = p_submission_id))
   order by (lv.id = o.new_version_id) desc, lv.published_at desc limit 1;
  if v.id is not null then
    insert into public.ai_decisions (entity_type, entity_id, kind, pipeline_version, decision, justification, reasons, actor_id, previous_version_id, new_version_id, created_at)
    values ('list_submission', p_submission_id, 'review', 's11.1', 'published', 'reconciled_publication', '[]'::jsonb, p_actor_id, o.previous_version_id, v.id, clock_timestamp());
    insert into public.ai_decisions (entity_type, entity_id, kind, pipeline_version, decision, justification, reasons, actor_id, new_version_id, created_at)
    values ('list_submission', p_submission_id, 'review', 's11.1', 'reconciled', 'orphan_reconciled', '["orphan_reconciled"]'::jsonb, p_actor_id, v.id, clock_timestamp());
    update public.list_submissions set status = 'published' where id = p_submission_id;
    delete from public.publication_leases where submission_id = p_submission_id;
    return 'reconciled';
  end if;
  insert into public.ai_decisions (entity_type, entity_id, kind, pipeline_version, decision, justification, reasons, actor_id, new_version_id, created_at)
  values ('list_submission', p_submission_id, 'review', 's11.1', 'reconciled', 'orphan_not_found', '["orphan_not_found"]'::jsonb, p_actor_id, o.new_version_id, clock_timestamp());
  return 'orphan_not_found';
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Vínculo da escola no envio (D-002) e escola atribuída na revisão
-- ---------------------------------------------------------------------------
-- submissions_create: corpo da 0201; a única mudança é a checagem do vínculo em school_members para source = 'school'.
create or replace function public.submissions_create(
  p_id uuid, p_profile_id uuid, p_source public.submission_source, p_school_id uuid, p_grade text, p_school_year int,
  p_storage_path text, p_file_name text, p_mime_type text, p_size_bytes bigint, p_is_demo boolean,
  p_consent_purpose text, p_consent_text_version text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_id uuid;
begin
  if p_source = 'school' and (
       p_school_id is null
       or not exists (select 1 from public.school_members m where m.school_id = p_school_id and m.profile_id = p_profile_id)
     ) then
    raise exception 'envio de escola exige vínculo confirmado com a escola' using errcode = '42501', hint = 'school_not_linked';
  end if;
  insert into public.consents (profile_id, purpose, text_version)
  values (p_profile_id, p_consent_purpose, p_consent_text_version)
  returning id into c_id;
  insert into public.list_submissions (
    id, submitted_by, source, school_id, grade, school_year, storage_path, file_name, mime_type, size_bytes,
    consent_id, is_demo
  ) values (
    p_id, p_profile_id, p_source, p_school_id, p_grade, p_school_year, p_storage_path, p_file_name, p_mime_type,
    p_size_bytes, c_id, coalesce(p_is_demo, false)
  );
  update public.list_submissions set status = 'processing' where id = p_id;
  insert into public.jobs (kind, payload, status, attempts, locked_at, idempotency_key, submission_id)
  values ('ocr_jobs', jsonb_build_object('submission_id', p_id), 'running', 1, now(), p_id::text, p_id);
  return p_id;
end;
$$;

create function public.review_assign_school(p_submission_id uuid, p_actor_id uuid, p_expected_version int, p_school_id uuid) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.list_status;
  sid uuid;
  latest record;
begin
  perform public.review_assert_admin(p_actor_id);
  select status, school_id into st, sid from public.list_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'envio inexistente' using errcode = 'P0002';
  end if;
  select v.id, v.version into latest from public.review_versions v where v.submission_id = p_submission_id order by v.version desc limit 1;
  if st <> 'human_review' or sid is not null or latest.id is null then
    return 'not_reviewable';
  end if;
  if p_expected_version is distinct from latest.version then
    return 'stale';
  end if;
  if p_school_id is null then
    raise exception 'escola inexistente' using errcode = '22023', hint = 'school_not_found';
  end if;
  -- a existência da escola é garantida pela FK da 0600 (a trilha Pipeline não lê `schools`: ADR-004).
  begin
    update public.list_submissions set school_id = p_school_id where id = p_submission_id;
  exception when foreign_key_violation then
    raise exception 'escola inexistente' using errcode = '22023', hint = 'school_not_found';
  end;
  insert into public.ai_decisions (entity_type, entity_id, kind, pipeline_version, decision, justification, reasons, actor_id, previous_version_id, new_version_id, created_at)
  values ('list_submission', p_submission_id, 'review', 's11.1', 'edited', 'school_assigned', '["school_assigned"]'::jsonb, p_actor_id, latest.id, latest.id, clock_timestamp());
  return 'assigned';
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Publicação real: list_publish_from_pipeline
-- ---------------------------------------------------------------------------
-- Uma transação: locks (chave e lista), idempotência por chave + hash, lista (escola × série × ano), candidate → approve →
-- publish com as funções da 0103 e o ator resolvido. Erros permanentes saem com hint estável (o TypeScript os mapeia):
-- invalid_request, invalid_items, no_items, invalid_actor, system_profile_missing, school_not_found, school_suspended,
-- grade_unknown, demo_mismatch, idempotency_conflict, list_archived, list_state_conflict.
create function public.list_publish_from_pipeline(p_request jsonb) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  top_keys constant text[] := array['key', 'submissionId', 'schoolId', 'gradeSlug', 'schoolYear', 'source', 'actor', 'actorId', 'items'];
  item_keys constant text[] := array['position', 'originalName', 'normalizedName', 'category', 'quantity', 'unit', 'confidence', 'origin'];
  k text;
  it jsonb;
  v_key text;
  v_school uuid;
  v_sub uuid;
  v_grade_slug text;
  v_year int;
  v_source text;
  v_actor uuid;
  v_actor_kind text;
  v_items jsonb;
  v_hash text;
  v_school_status public.verification_status;
  v_grade uuid;
  v_list record;
  v_sub_demo boolean;
  v_prev uuid;
  v_version uuid;
  v_existing record;
begin
  if p_request is null or jsonb_typeof(p_request) <> 'object' then
    raise exception 'pedido inválido' using errcode = '22023', hint = 'invalid_request';
  end if;
  for k in select jsonb_object_keys(p_request) loop
    if not (k = any (top_keys)) then
      raise exception 'pedido inválido: campo não permitido' using errcode = '22023', hint = 'invalid_request';
    end if;
  end loop;
  if jsonb_typeof(p_request -> 'key') is distinct from 'string' or length(p_request ->> 'key') not between 1 and 200
     or jsonb_typeof(p_request -> 'schoolId') is distinct from 'string' or lower(p_request ->> 'schoolId') !~ uuid_re
     or jsonb_typeof(p_request -> 'submissionId') is distinct from 'string' or lower(p_request ->> 'submissionId') !~ uuid_re
     or jsonb_typeof(p_request -> 'gradeSlug') is distinct from 'string' or (p_request ->> 'gradeSlug') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or jsonb_typeof(p_request -> 'schoolYear') is distinct from 'number'
     or (p_request ->> 'source') is null or (p_request ->> 'source') not in ('school_upload', 'parent_upload')
     or (p_request ->> 'actor') is null or (p_request ->> 'actor') not in ('system', 'admin')
     or jsonb_typeof(p_request -> 'items') is distinct from 'array' then
    raise exception 'pedido inválido' using errcode = '22023', hint = 'invalid_request';
  end if;
  if (p_request ->> 'schoolYear') !~ '^[0-9]{4}$' or (p_request ->> 'schoolYear')::int not between 2020 and 2100 then
    raise exception 'pedido inválido: ano' using errcode = '22023', hint = 'invalid_request';
  end if;
  v_key := p_request ->> 'key';
  v_school := lower(p_request ->> 'schoolId')::uuid;
  v_sub := lower(p_request ->> 'submissionId')::uuid;
  v_grade_slug := p_request ->> 'gradeSlug';
  v_year := (p_request ->> 'schoolYear')::int;
  v_source := p_request ->> 'source';
  v_actor_kind := p_request ->> 'actor';
  v_items := p_request -> 'items';

  if v_actor_kind = 'admin' then
    if jsonb_typeof(p_request -> 'actorId') is distinct from 'string' or lower(p_request ->> 'actorId') !~ uuid_re then
      raise exception 'ator inválido' using errcode = '22023', hint = 'invalid_actor';
    end if;
    v_actor := lower(p_request ->> 'actorId')::uuid;
    if not exists (select 1 from public.profiles p where p.id = v_actor and p.role = 'admin') then
      raise exception 'ator inválido' using errcode = '22023', hint = 'invalid_actor';
    end if;
  else
    if p_request ? 'actorId' then
      raise exception 'pedido inválido: actorId só com ator admin' using errcode = '22023', hint = 'invalid_request';
    end if;
    v_actor := public.system_profile_id();
    if not exists (select 1 from public.profiles p where p.id = v_actor and p.role = 'system') then
      raise exception 'perfil system ausente' using errcode = '22023', hint = 'system_profile_missing';
    end if;
  end if;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'sem itens' using errcode = '22023', hint = 'no_items';
  end if;
  if jsonb_array_length(v_items) > 500 then
    raise exception 'itens demais' using errcode = '22023', hint = 'invalid_items';
  end if;
  for it in select e from jsonb_array_elements(v_items) e loop
    if jsonb_typeof(it) <> 'object' then
      raise exception 'item inválido' using errcode = '22023', hint = 'invalid_items';
    end if;
    for k in select jsonb_object_keys(it) loop
      if not (k = any (item_keys)) then
        raise exception 'item inválido' using errcode = '22023', hint = 'invalid_items';
      end if;
    end loop;
    if jsonb_typeof(it -> 'position') is distinct from 'number' or (it ->> 'position') !~ '^[0-9]{1,4}$' or (it ->> 'position')::int < 1
       or jsonb_typeof(it -> 'originalName') is distinct from 'string' or length(btrim(it ->> 'originalName')) not between 1 and 500
       or jsonb_typeof(it -> 'normalizedName') is distinct from 'string' or length(btrim(it ->> 'normalizedName')) not between 1 and 500
       or jsonb_typeof(it -> 'category') is distinct from 'string' or length(it ->> 'category') > 100
       or jsonb_typeof(it -> 'quantity') is distinct from 'number' or (it ->> 'quantity')::numeric <= 0 or (it ->> 'quantity')::numeric >= 100000000
       or jsonb_typeof(it -> 'unit') not in ('string', 'null') or length(coalesce(it ->> 'unit', '')) > 30
       or jsonb_typeof(it -> 'confidence') not in ('number', 'null')
       or (jsonb_typeof(it -> 'confidence') = 'number' and ((it ->> 'confidence')::numeric < 0 or (it ->> 'confidence')::numeric > 1))
       or (it ? 'origin' and (it ->> 'origin') not in ('extracted', 'reviewed')) then
      raise exception 'item inválido' using errcode = '22023', hint = 'invalid_items';
    end if;
  end loop;
  if (select count(distinct (e ->> 'position')) from jsonb_array_elements(v_items) e) <> jsonb_array_length(v_items) then
    raise exception 'posições repetidas' using errcode = '22023', hint = 'invalid_items';
  end if;

  v_hash := encode(sha256(convert_to(jsonb_build_object('schoolId', v_school, 'gradeSlug', v_grade_slug, 'schoolYear', v_year, 'source', v_source, 'items', v_items)::text, 'utf8')), 'hex');

  -- Ordem fixa de locks (chave, depois lista): chaves iguais se serializam; chaves diferentes da mesma lista também.
  perform pg_advisory_xact_lock(hashtextextended('lpfp:key:' || v_key, 0));
  select lv.id, lv.list_id, lv.publication_hash, lv.publication_previous_id into v_existing
    from public.list_versions lv where lv.publication_key = v_key;
  if found then
    if v_existing.publication_hash is distinct from v_hash then
      raise exception 'chave já usada com outro conteúdo' using errcode = '23505', hint = 'idempotency_conflict';
    end if;
    return jsonb_build_object('listId', v_existing.list_id, 'previousVersionId', v_existing.publication_previous_id, 'newVersionId', v_existing.id, 'replay', true);
  end if;

  select s.verification_status into v_school_status from public.schools s where s.id = v_school;
  if not found then
    raise exception 'escola inexistente' using errcode = '22023', hint = 'school_not_found';
  end if;
  if v_school_status = 'suspended' then
    raise exception 'escola suspensa' using errcode = '22023', hint = 'school_suspended';
  end if;
  select g.id into v_grade from public.grades g where g.slug = v_grade_slug;
  if not found then
    raise exception 'série desconhecida' using errcode = '22023', hint = 'grade_unknown';
  end if;
  select s.is_demo into v_sub_demo from public.list_submissions s where s.id = v_sub;
  if not found then
    v_sub := null; -- publicação sem envio de origem (ex.: importação): a versão não aponta para envio algum
  end if;

  perform pg_advisory_xact_lock(hashtextextended('lpfp:list:' || v_school::text || v_grade::text || v_year::text, 0));
  select l.id, l.status, l.current_version_id, l.is_demo into v_list from public.school_lists l
   where l.school_id = v_school and l.grade_id = v_grade and l.school_year = v_year for no key update;
  if not found then
    insert into public.school_lists (school_id, grade_id, school_year, is_demo) values (v_school, v_grade, v_year, coalesce(v_sub_demo, false))
    on conflict (school_id, grade_id, school_year) do nothing;
    select l.id, l.status, l.current_version_id, l.is_demo into v_list from public.school_lists l
     where l.school_id = v_school and l.grade_id = v_grade and l.school_year = v_year for no key update;
  end if;
  if v_sub_demo is not null and v_list.is_demo is distinct from v_sub_demo then
    raise exception 'demonstração e lista real não se misturam' using errcode = '23514', hint = 'demo_mismatch';
  end if;
  if v_list.status = 'archived' then
    raise exception 'lista arquivada' using errcode = '23514', hint = 'list_archived';
  end if;
  if v_list.status = 'draft' then
    perform public.list_transition(v_list.id, 'submitted', v_actor, null);
    perform public.list_transition(v_list.id, 'processing', v_actor, null);
    perform public.list_transition(v_list.id, 'approved', v_actor, null);
  elsif v_list.status not in ('approved', 'published') then
    -- D-068: outro fluxo trabalha esta lista (matriz da 0103); o envio vai à revisão humana.
    raise exception 'lista em estado que não permite publicar' using errcode = '23514', hint = 'list_state_conflict';
  end if;
  v_prev := v_list.current_version_id;

  select c.version_id into v_version
    from public.list_create_candidate_version(v_list.id, v_source::public.list_version_source, v_sub, v_actor) c;
  update public.list_versions
     set publication_key = v_key, publication_hash = v_hash, publication_previous_id = v_prev
   where id = v_version;
  begin
    insert into public.list_items (version_id, position, original_name, normalized_name, category, quantity, unit, confidence, origin)
    select v_version, (e ->> 'position')::int, e ->> 'originalName', e ->> 'normalizedName', e ->> 'category',
           (e ->> 'quantity')::numeric, e ->> 'unit', (e ->> 'confidence')::numeric, coalesce(e ->> 'origin', 'extracted')
      from jsonb_array_elements(v_items) e;
  exception when data_exception or integrity_constraint_violation then
    raise exception 'item inválido' using errcode = '22023', hint = 'invalid_items';
  end;
  perform public.list_approve_version(v_list.id, v_version, v_actor);
  perform public.list_publish_version(v_list.id, v_version, v_actor);
  return jsonb_build_object('listId', v_list.id, 'previousVersionId', v_prev, 'newVersionId', v_version, 'replay', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Leituras das portas reais
-- ---------------------------------------------------------------------------
create function public.publication_context(p_query jsonb) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  k text;
  v_school uuid;
  v_grade text;
  v_year int;
  v_by uuid;
  v_school_json jsonb;
  v_slug text;
  v_linked boolean := false;
  v_list jsonb;
begin
  if p_query is null or jsonb_typeof(p_query) <> 'object' then
    raise exception 'consulta inválida' using errcode = '22023', hint = 'invalid_request';
  end if;
  for k in select jsonb_object_keys(p_query) loop
    if not (k = any (array['schoolId', 'grade', 'schoolYear', 'submittedBy'])) then
      raise exception 'consulta inválida' using errcode = '22023', hint = 'invalid_request';
    end if;
  end loop;
  if not (p_query ?& array['schoolId', 'grade', 'schoolYear', 'submittedBy'])
     or jsonb_typeof(p_query -> 'schoolId') not in ('null', 'string') or jsonb_typeof(p_query -> 'grade') not in ('null', 'string')
     or jsonb_typeof(p_query -> 'schoolYear') not in ('null', 'number') or jsonb_typeof(p_query -> 'submittedBy') is distinct from 'string'
     or lower(p_query ->> 'submittedBy') !~ uuid_re
     or (jsonb_typeof(p_query -> 'schoolId') = 'string' and lower(p_query ->> 'schoolId') !~ uuid_re)
     or (jsonb_typeof(p_query -> 'schoolYear') = 'number' and (p_query ->> 'schoolYear') !~ '^[0-9]{1,4}$') then
    raise exception 'consulta inválida' using errcode = '22023', hint = 'invalid_request';
  end if;
  v_school := case when jsonb_typeof(p_query -> 'schoolId') = 'string' then lower(p_query ->> 'schoolId')::uuid end;
  v_grade := case when jsonb_typeof(p_query -> 'grade') = 'string' then btrim(p_query ->> 'grade') end;
  v_year := case when jsonb_typeof(p_query -> 'schoolYear') = 'number' then (p_query ->> 'schoolYear')::int end;
  v_by := lower(p_query ->> 'submittedBy')::uuid;

  select jsonb_build_object('verification', s.verification_status::text, 'municipalityEnabled', m.is_enabled) into v_school_json
    from public.schools s join public.municipalities m on m.id = s.municipality_id where s.id = v_school;
  if v_grade is not null and v_grade <> '' then
    select g.slug into v_slug from public.grades g
     where g.slug = lower(v_grade)
        or regexp_replace(lower(btrim(g.name)), '\s+', ' ', 'g') = regexp_replace(lower(v_grade), '\s+', ' ', 'g')
     order by g.sort_order limit 1;
  end if;
  if v_school_json is not null then
    v_linked := exists (select 1 from public.school_members sm where sm.school_id = v_school and sm.profile_id = v_by);
  end if;
  if v_school_json is not null and v_slug is not null and v_year is not null then
    select jsonb_build_object('listId', l.id, 'status', l.status::text, 'currentVersionId', l.current_version_id) into v_list
      from public.school_lists l join public.grades g on g.id = l.grade_id
     where l.school_id = v_school and g.slug = v_slug and l.school_year = v_year;
  end if;
  return jsonb_build_object('school', v_school_json, 'gradeSlug', v_slug, 'submitterLinked', v_linked, 'currentList', v_list);
end;
$$;

create function public.school_labels(p_ids uuid[]) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_ids is null or cardinality(p_ids) > 100 then
    raise exception 'lista de ids inválida' using errcode = '22023', hint = 'invalid_request';
  end if;
  return coalesce(
    (select jsonb_object_agg(s.id::text, jsonb_build_object('name', s.name, 'inep', s.inep)) from public.schools s where s.id = any (p_ids)),
    '{}'::jsonb
  );
end;
$$;

-- Quantidade inteira para o carrinho: nunca inventa (item sem quantidade vale 1, o mínimo comprável) e fracionário sobe ao inteiro.
create function public.cart_quantity(p numeric) returns integer
language sql
immutable
set search_path = ''
as $$ select greatest(1, least(2147483647, ceil(coalesce(p, 1))))::integer; $$;

create function public.list_reader_get(p_list_id uuid, p_actor_id uuid) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_demo boolean;
  v_items jsonb;
  c record;
begin
  -- 1. versão oficial visível ao público (mesma regra das políticas da 0103): published/superseded de lista published em município habilitado.
  select l.is_demo into v_demo
    from public.list_versions v
    join public.school_lists l on l.id = v.list_id
    join public.schools s on s.id = l.school_id
    join public.municipalities m on m.id = s.municipality_id
   where v.id = p_list_id and v.status in ('published', 'superseded') and l.status = 'published' and m.is_enabled;
  if found then
    select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.original_name, 'quantity', public.cart_quantity(i.quantity)) order by i.position), '[]'::jsonb)
      into v_items from public.list_items i where i.version_id = p_list_id;
    return jsonb_build_object('kind', 'official', 'isDemo', v_demo, 'items', v_items);
  end if;
  -- 2. cópia do pai: só do próprio dono (alheia e sem ator = mesma resposta de inexistente).
  if p_actor_id is not null then
    select pc.id, pc.items, sub.is_demo as demo into c
      from public.parent_list_copies pc join public.list_submissions sub on sub.id = pc.submission_id
     where pc.id = p_list_id and pc.owner_id = p_actor_id;
    if found then
      select coalesce(jsonb_agg(jsonb_build_object('id', c.id::text || ':' || e.n, 'name', e.item ->> 'name',
                                                    'quantity', public.cart_quantity(case when jsonb_typeof(e.item -> 'quantity') = 'number' then (e.item ->> 'quantity')::numeric end)) order by e.n), '[]'::jsonb)
        into v_items from jsonb_array_elements(c.items) with ordinality as e(item, n);
      return jsonb_build_object('kind', 'parent_copy', 'isDemo', c.demo, 'items', v_items);
    end if;
  end if;
  return null;
end;
$$;

create function public.lead_list_context(p_list_id uuid, p_actor_id uuid) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  v_items jsonb;
begin
  select s.name as school_name, g.name as grade_label, l.school_year, l.is_demo, s.municipality_id into r
    from public.list_versions v
    join public.school_lists l on l.id = v.list_id
    join public.schools s on s.id = l.school_id
    join public.grades g on g.id = l.grade_id
    join public.municipalities m on m.id = s.municipality_id
   where v.id = p_list_id and v.status in ('published', 'superseded') and l.status = 'published' and m.is_enabled;
  if found then
    select coalesce(jsonb_agg(jsonb_build_object('name', i.original_name, 'quantity', public.cart_quantity(i.quantity)) order by i.position), '[]'::jsonb)
      into v_items from public.list_items i where i.version_id = p_list_id;
    return jsonb_build_object('schoolName', r.school_name, 'gradeLabel', r.grade_label, 'schoolYear', r.school_year, 'items', v_items, 'isDemo', r.is_demo, 'municipalityId', r.municipality_id);
  end if;
  if p_actor_id is not null then
    -- cópia do pai: escola, série e ano vêm do envio; sem escola (ou sem série/ano) não há contexto (nada inventado).
    select s.name as school_name, sub.grade, sub.school_year, sub.is_demo, s.municipality_id, pc.items, pc.id as copy_id into r
      from public.parent_list_copies pc
      join public.list_submissions sub on sub.id = pc.submission_id
      join public.schools s on s.id = sub.school_id
     where pc.id = p_list_id and pc.owner_id = p_actor_id and sub.grade is not null and sub.school_year is not null;
    if found then
      select coalesce(jsonb_agg(jsonb_build_object('name', e.item ->> 'name', 'quantity', public.cart_quantity(case when jsonb_typeof(e.item -> 'quantity') = 'number' then (e.item ->> 'quantity')::numeric end)) order by e.n), '[]'::jsonb)
        into v_items from jsonb_array_elements(r.items) with ordinality as e(item, n);
      return jsonb_build_object('schoolName', r.school_name, 'gradeLabel', r.grade, 'schoolYear', r.school_year, 'items', v_items, 'isDemo', r.is_demo, 'municipalityId', r.municipality_id);
    end if;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Origem da lista em carrinhos e leads
-- ---------------------------------------------------------------------------
-- official = list_versions.id publicada/superseded; parent_copy = parent_list_copies.id do próprio dono; demo = lista fictícia.
-- Todo carrinho anterior nasceu demo (S12): o default faz o backfill.
alter table public.carts add column list_kind text not null default 'demo', add constraint carts_list_kind_valid check (list_kind in ('official', 'parent_copy', 'demo'));
alter table public.leads add column list_kind text not null default 'demo', add constraint leads_list_kind_valid check (list_kind in ('official', 'parent_copy', 'demo'));
comment on column public.carts.list_kind is 'S11: origem de list_id (official | parent_copy | demo). Informativa: a leitura resolve o id no servidor, nunca confia nesta coluna.';
comment on column public.leads.list_kind is 'S11: origem de list_id, herdada do carrinho de origem (gatilho leads_set_list_kind).';

create function public.leads_set_list_kind() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cart_id is not null then
    new.list_kind := coalesce((select c.list_kind from public.carts c where c.id = new.cart_id), new.list_kind);
  end if;
  return new;
end;
$$;
create trigger leads_set_list_kind before insert on public.leads for each row execute function public.leads_set_list_kind();

-- ---------------------------------------------------------------------------
-- 8. audit_row_change: pepper do GUC ou, na falta dele, do Vault (D-059)
-- ---------------------------------------------------------------------------
-- Corpo igual ao da 0001; muda só a origem do pepper. `coalesce(nullif(GUC, ''), segredo do Vault 'audit_ip_pepper')` em duas
-- etapas com falha fechada: Vault ausente ou sem permissão = sem pepper = sem hash (nunca hash de IP sem pepper).
create or replace function public.audit_row_change() returns trigger
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
  pepper text := nullif(current_setting('app.audit_ip_pepper', true), '');
  i int;
begin
  -- colunas sensíveis (argumentos do trigger) nunca entram no audit_log, que é imutável.
  for i in 0 .. tg_nargs - 1 loop
    old_j := old_j - tg_argv[i];
    new_j := new_j - tg_argv[i];
  end loop;

  begin
    fwd := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    fwd := null;
  end;
  -- último valor: o acrescentado pelo proxy confiável (o primeiro é forjável pelo cliente).
  ip := nullif(btrim((string_to_array(coalesce(fwd, ''), ','))[cardinality(string_to_array(coalesce(fwd, ''), ','))]), '');
  -- o hospedado não permite o GUC no banco: o pepper vem do Vault (só lido quando há IP e o GUC não existe).
  if ip is not null and pepper is null then
    begin
      pepper := nullif((select decrypted_secret from vault.decrypted_secrets where name = 'audit_ip_pepper'), '');
    exception when others then
      pepper := null;
    end;
  end if;
  -- sem pepper não há hash (sha256 puro de IPv4 é reversível por força bruta).
  if ip is not null and pepper is not null then
    hashed := encode(sha256(convert_to(ip || pepper, 'utf8')), 'hex');
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

-- ---------------------------------------------------------------------------
-- 9. Privilégios (EXECUTE só service_role) e comentários
-- ---------------------------------------------------------------------------
revoke execute on function
  public.system_profile_id(), public.publication_orphan_pending(uuid), public.publication_reconcile_orphan(uuid, uuid),
  public.review_assign_school(uuid, uuid, int, uuid), public.list_publish_from_pipeline(jsonb), public.publication_context(jsonb),
  public.school_labels(uuid[]), public.cart_quantity(numeric), public.list_reader_get(uuid, uuid), public.lead_list_context(uuid, uuid),
  public.leads_set_list_kind()
  from public, anon, authenticated, service_role;
grant execute on function
  public.system_profile_id(), public.publication_reconcile_orphan(uuid, uuid), public.review_assign_school(uuid, uuid, int, uuid),
  public.list_publish_from_pipeline(jsonb), public.publication_context(jsonb), public.school_labels(uuid[]),
  public.list_reader_get(uuid, uuid), public.lead_list_context(uuid, uuid)
  to service_role;

comment on function public.system_profile_id() is 'S11: UUID do perfil técnico system (ator da publicação automática).';
comment on function public.list_publish_from_pipeline(jsonb) is 'S11: ListPublisher real (transação única; idempotente por chave + hash; candidate -> approve -> publish com o ator resolvido).';
comment on function public.publication_context(jsonb) is 'S11: contexto da decisão de publicação (escola, série, vínculo, lista atual) sem dado pessoal.';
comment on function public.school_labels(uuid[]) is 'S11: nome e INEP (colunas públicas) por id de escola.';
comment on function public.list_reader_get(uuid, uuid) is 'S11: itens de uma lista oficial pública ou de cópia do próprio pai (alheia = null). Demonstração nunca vem do banco.';
comment on function public.lead_list_context(uuid, uuid) is 'S11: contexto público da lista para o lead; cópia do pai sem escola = null (nada inventado).';
comment on function public.publication_reconcile_orphan(uuid, uuid) is 'S11: conciliação de publish_orphaned por ação do admin (reconciled | orphan_not_found | not_orphaned).';
comment on function public.review_assign_school(uuid, uuid, int, uuid) is 'S11: admin atribui a escola a um envio em human_review sem escola (grava review/edited com school_assigned).';
