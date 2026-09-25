-- 0201_submissions_and_jobs: envios de lista, consentimento, jobs, filas pgmq e bucket privado (S07, trilha Pipeline).
-- Sem FK para tabelas de outras trilhas (ADR-004): school_id é uuid solto até a 0600.
-- pgmq: `create extension pgmq` cria o schema próprio `pgmq` (local e hospedado). Esse schema NÃO é exposto pela
-- API do PostgREST; o app e o worker só falam com a fila pelas funções public.jobs_* abaixo (SECURITY DEFINER,
-- EXECUTE só service_role). anon/authenticated não têm USAGE no schema pgmq.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.submission_source as enum ('parent', 'school');
create type public.notify_channel as enum ('none', 'browser', 'email', 'whatsapp');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  purpose text not null check (length(btrim(purpose)) > 0),
  text_version text not null check (length(btrim(text_version)) > 0),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (revoked_at is null or revoked_at >= granted_at)
);
create index consents_profile_id_idx on public.consents (profile_id);

create table public.list_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references public.profiles (id) on delete cascade,
  source public.submission_source not null,
  school_id uuid, -- sem FK (ADR-004)
  grade text check (grade is null or length(btrim(grade)) between 1 and 60),
  school_year int check (school_year is null or school_year between 2000 and 2100),
  storage_path text not null,
  file_name text not null check (length(file_name) between 1 and 255 and file_name !~ '[/\\[:cntrl:]]'),
  mime_type text not null check (
    mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic')
  ),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  consent_id uuid not null references public.consents (id),
  status public.list_status not null default 'submitted',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- caminho {profile_id}/{submission_id}/arquivo, sem traversal nem caractere de controle
  check (
    storage_path like submitted_by::text || '/' || id::text || '/%'
    and storage_path !~ '\.\./|[[:cntrl:]]'
  )
);
create index list_submissions_submitted_by_idx on public.list_submissions (submitted_by);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (length(btrim(kind)) > 0),
  payload jsonb not null default '{}'::jsonb,
  status public.job_status not null default 'queued',
  attempts int not null default 0 check (attempts >= 0),
  max_attempts int not null default 5 check (max_attempts > 0),
  last_error text check (last_error is null or length(last_error) <= 500),
  run_after timestamptz not null default now(),
  locked_at timestamptz, -- quando o worker assumiu; running antigo = crash e pode ser retomado
  idempotency_key text not null unique check (length(btrim(idempotency_key)) > 0),
  notify_channel public.notify_channel not null default 'none',
  notify_target text check (notify_target is null or length(notify_target) <= 254),
  submission_id uuid references public.list_submissions (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (notify_channel in ('none', 'browser') or notify_target is not null)
);
create index jobs_submission_id_idx on public.jobs (submission_id);

create table public.ocr_jobs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs (id) on delete cascade, -- um resultado por job
  submission_id uuid references public.list_submissions (id) on delete cascade,
  result jsonb,
  duration_ms int check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ocr_jobs_submission_id_idx on public.ocr_jobs (submission_id);

-- ---------------------------------------------------------------------------
-- Triggers (updated_at e auditoria; file_name e notify_target ficam fora do audit_log)
-- ---------------------------------------------------------------------------
create trigger consents_set_updated_at before update on public.consents
  for each row execute function public.set_updated_at();
create trigger list_submissions_set_updated_at before update on public.list_submissions
  for each row execute function public.set_updated_at();
create trigger jobs_set_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();
create trigger ocr_jobs_set_updated_at before update on public.ocr_jobs
  for each row execute function public.set_updated_at();

create trigger consents_audit after insert or update or delete on public.consents
  for each row execute function public.audit_row_change();
create trigger list_submissions_audit after insert or update or delete on public.list_submissions
  for each row execute function public.audit_row_change('file_name');
alter table public.consents enable always trigger consents_audit;
alter table public.list_submissions enable always trigger list_submissions_audit;

-- ---------------------------------------------------------------------------
-- Grants e RLS
-- ---------------------------------------------------------------------------
revoke all on public.consents, public.list_submissions, public.jobs, public.ocr_jobs from anon, authenticated, service_role;
grant select, insert on public.consents to authenticated;
grant update (revoked_at) on public.consents to authenticated; -- o dono só revoga
grant select, insert on public.list_submissions to authenticated;
grant select on public.jobs to authenticated;
grant update (notify_channel, notify_target) on public.jobs to authenticated;
grant select on public.ocr_jobs to authenticated;
grant select, insert, update, delete on public.consents, public.list_submissions, public.jobs, public.ocr_jobs to service_role;

alter table public.consents enable row level security;
alter table public.list_submissions enable row level security;
alter table public.jobs enable row level security;
alter table public.ocr_jobs enable row level security;

-- consents: dono lê o próprio; admin/system leem todos.
create policy consents_select_own_or_admin on public.consents
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.auth_role()) in ('admin', 'system'));
-- consents: só o próprio usuário (com papel) registra o próprio consentimento.
create policy consents_insert_own on public.consents
  for insert to authenticated
  with check (profile_id = (select auth.uid()) and (select public.auth_role()) is not null);
-- consents: dono revoga o próprio (grant de coluna limita a revoked_at).
create policy consents_update_own on public.consents
  for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

-- list_submissions: dono lê os próprios; admin/system leem todos.
create policy list_submissions_select_own_or_admin on public.list_submissions
  for select to authenticated
  using (submitted_by = (select auth.uid()) or (select public.auth_role()) in ('admin', 'system'));
-- list_submissions: parent/school_member/admin criam em nome próprio, sempre como 'submitted', com consentimento
-- próprio, 'list_upload' e não revogado; origem 'school' só para school_member/admin.
create policy list_submissions_insert_own on public.list_submissions
  for insert to authenticated
  with check (
    submitted_by = (select auth.uid())
    and (select public.auth_role()) in ('parent', 'school_member', 'admin')
    and (source = 'parent' or (select public.auth_role()) in ('school_member', 'admin'))
    and status = 'submitted'
    and exists (
      select 1 from public.consents c
      where c.id = consent_id and c.profile_id = submitted_by and c.purpose = 'list_upload' and c.revoked_at is null
    )
  );

-- jobs: dono do envio lê o job (inclui notify_target, invisível a terceiros); admin/system leem todos.
create policy jobs_select_owner_or_admin on public.jobs
  for select to authenticated
  using (
    (select public.auth_role()) in ('admin', 'system')
    or exists (select 1 from public.list_submissions s where s.id = submission_id and s.submitted_by = (select auth.uid()))
  );
-- jobs: só o dono do envio ajusta notify_channel/notify_target (grant de coluna); estado só via jobs_* .
create policy jobs_update_notify_owner on public.jobs
  for update to authenticated
  using (exists (select 1 from public.list_submissions s where s.id = submission_id and s.submitted_by = (select auth.uid())))
  with check (exists (select 1 from public.list_submissions s where s.id = submission_id and s.submitted_by = (select auth.uid())));

-- ocr_jobs: dono do envio e admin/system leem; escrita só pelo service_role (jobs_complete).
create policy ocr_jobs_select_owner_or_admin on public.ocr_jobs
  for select to authenticated
  using (
    (select public.auth_role()) in ('admin', 'system')
    or exists (select 1 from public.list_submissions s where s.id = submission_id and s.submitted_by = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- pgmq: filas do OCR e dead letter
-- ---------------------------------------------------------------------------
create extension if not exists pgmq;
select pgmq.create('ocr_jobs');
select pgmq.create('ocr_jobs_dlq');

revoke all on schema pgmq from public, anon, authenticated;
revoke all on all tables in schema pgmq from public, anon, authenticated;
revoke all on all sequences in schema pgmq from public, anon, authenticated;
revoke execute on all functions in schema pgmq from public, anon, authenticated;
alter table pgmq.q_ocr_jobs enable row level security;
alter table pgmq.a_ocr_jobs enable row level security;
alter table pgmq.q_ocr_jobs_dlq enable row level security;
alter table pgmq.a_ocr_jobs_dlq enable row level security;

-- ---------------------------------------------------------------------------
-- Funções (SECURITY DEFINER, search_path vazio, EXECUTE só service_role)
-- ---------------------------------------------------------------------------
-- Envio ainda não concluído -> estado coerente com o resultado do job. Não mexe em estados adiante.
create function public.jobs_touch_submission(p_submission_id uuid, p_status public.list_status) returns void
language sql
security definer
set search_path = ''
as $$
  update public.list_submissions
     set status = p_status
   where id = p_submission_id and status in ('submitted', 'processing', 'processing_async');
$$;

-- Marca o job como dead, envia à DLQ e rejeita o envio. Só age se ainda não estiver dead/succeeded.
create function public.jobs_mark_dead(p_job_id uuid, p_error text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.jobs;
begin
  update public.jobs
     set status = 'dead', locked_at = null, last_error = left(coalesce(p_error, last_error), 500)
   where id = p_job_id and status not in ('dead', 'succeeded')
   returning * into j;
  if j.id is null then
    return;
  end if;
  perform pgmq.send('ocr_jobs_dlq', jsonb_build_object('job_id', j.id, 'error', left(coalesce(j.last_error, ''), 500)));
  perform public.jobs_touch_submission(j.submission_id, 'rejected');
end;
$$;

create function public.jobs_enqueue(p_kind text, p_payload jsonb, p_idempotency_key text, p_submission_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if p_kind is distinct from 'ocr_jobs' then
    raise exception 'kind de job desconhecido: %', p_kind using errcode = '22023';
  end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency_key obrigatória' using errcode = '22023';
  end if;
  insert into public.jobs (kind, payload, idempotency_key, submission_id)
  values (p_kind, coalesce(p_payload, '{}'::jsonb), p_idempotency_key, p_submission_id)
  on conflict (idempotency_key) do nothing
  returning id into new_id;
  if new_id is null then -- já existe: devolve o mesmo job, sem nova mensagem
    select id into new_id from public.jobs where idempotency_key = p_idempotency_key;
    return new_id;
  end if;
  perform pgmq.send('ocr_jobs', jsonb_build_object('job_id', new_id));
  return new_id;
end;
$$;

-- Um único vencedor mesmo sob concorrência: o UPDATE condicional serializa as chamadas.
create function public.jobs_claim(p_job_id uuid) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  got uuid;
begin
  update public.jobs
     set status = 'running', attempts = attempts + 1, locked_at = now()
   where id = p_job_id
     and attempts < max_attempts
     and (
       (status in ('queued', 'retrying') and run_after <= now())
       or (status = 'running' and locked_at < now() - interval '5 minutes') -- worker caiu no meio
     )
   returning id into got;
  if got is not null then
    return true;
  end if;
  -- running antigo sem tentativas restantes: esgotou (crash repetido) -> dead.
  perform public.jobs_mark_dead(id, 'tentativas esgotadas (worker interrompido)')
     from public.jobs
    where id = p_job_id and status = 'running' and attempts >= max_attempts and locked_at < now() - interval '5 minutes';
  return false;
end;
$$;

create function public.jobs_complete(p_job_id uuid, p_result jsonb, p_duration_ms int) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.jobs;
begin
  update public.jobs
     set status = 'succeeded', locked_at = null, last_error = null
   where id = p_job_id and status = 'running'
   returning * into j;
  if j.id is null then
    return; -- idempotente: já concluído, ou nunca reivindicado
  end if;
  insert into public.ocr_jobs (job_id, submission_id, result, duration_ms)
  values (j.id, j.submission_id, p_result, p_duration_ms)
  on conflict (job_id) do nothing;
  perform public.jobs_touch_submission(j.submission_id, 'review_needed');
end;
$$;

create function public.jobs_fail(p_job_id uuid, p_error text, p_retry_in_seconds int) returns public.job_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.jobs;
begin
  update public.jobs
     set status = 'retrying', locked_at = null, last_error = left(p_error, 500),
         run_after = now() + make_interval(secs => greatest(coalesce(p_retry_in_seconds, 0), 0))
   where id = p_job_id and status = 'running' and attempts < max_attempts
   returning * into j;
  if j.id is not null then
    return 'retrying';
  end if;
  update public.jobs set last_error = left(p_error, 500)
   where id = p_job_id and status = 'running' and attempts >= max_attempts;
  if found then
    perform public.jobs_mark_dead(p_job_id, p_error);
    return 'dead';
  end if;
  return (select status from public.jobs where id = p_job_id); -- no-op: já finalizado ou inexistente
end;
$$;

-- Acesso do worker à fila (pgmq não é exposto pela API).
create function public.jobs_read(p_qty int default 5, p_vt int default 60)
returns table (msg_id bigint, read_ct int, job_id uuid)
language sql
security definer
set search_path = ''
as $$
  select m.msg_id, m.read_ct, (m.message ->> 'job_id')::uuid
    from pgmq.read('ocr_jobs', p_vt, p_qty) m;
$$;

create function public.jobs_ack(p_msg_id bigint) returns boolean
language sql
security definer
set search_path = ''
as $$
  select pgmq.archive('ocr_jobs', p_msg_id);
$$;

create function public.jobs_set_vt(p_msg_id bigint, p_vt int) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pgmq.set_vt('ocr_jobs', p_msg_id, p_vt);
end;
$$;

revoke execute on function public.jobs_touch_submission(uuid, public.list_status) from public, anon, authenticated, service_role;
revoke execute on function public.jobs_mark_dead(uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.jobs_enqueue(text, jsonb, text, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.jobs_claim(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.jobs_complete(uuid, jsonb, int) from public, anon, authenticated, service_role;
revoke execute on function public.jobs_fail(uuid, text, int) from public, anon, authenticated, service_role;
revoke execute on function public.jobs_read(int, int) from public, anon, authenticated, service_role;
revoke execute on function public.jobs_ack(bigint) from public, anon, authenticated, service_role;
revoke execute on function public.jobs_set_vt(bigint, int) from public, anon, authenticated, service_role;
grant execute on function public.jobs_enqueue(text, jsonb, text, uuid) to service_role;
grant execute on function public.jobs_claim(uuid) to service_role;
grant execute on function public.jobs_complete(uuid, jsonb, int) to service_role;
grant execute on function public.jobs_fail(uuid, text, int) to service_role;
grant execute on function public.jobs_read(int, int) to service_role;
grant execute on function public.jobs_ack(bigint) to service_role;
grant execute on function public.jobs_set_vt(bigint, int) to service_role;

-- ---------------------------------------------------------------------------
-- Storage: bucket privado e políticas em storage.objects (RLS já vem habilitada pelo Supabase)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'list-uploads', 'list-uploads', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- list-uploads: parent/school_member/admin enviam só para {próprio uid}/{envio}/arquivo (sem traversal).
create policy list_uploads_insert_own_folder on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'list-uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and cardinality(storage.foldername(name)) >= 2
    and (select public.auth_role()) in ('parent', 'school_member', 'admin')
  );
-- list-uploads: dono lê a própria pasta; admin/system leem tudo. Sem update/delete/anon: objetos imutáveis.
create policy list_uploads_select_own_or_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'list-uploads'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.auth_role()) in ('admin', 'system')
    )
  );
