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
  size_bytes bigint not null check (size_bytes between 1 and 4000000),
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
  -- e-mail simples ou telefone E.164 (o formato é validado de novo na borda com Zod)
  notify_target text check (
    notify_target is null
    or (length(notify_target) <= 254 and (notify_target ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or notify_target ~ '^\+[1-9][0-9]{7,14}$'))
  ),
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
-- Menor privilégio: authenticated só LÊ o que é seu. O envio (consentimento, linha e arquivo) é feito pelo
-- servidor com service_role; a revogação passa por public.consents_revoke (única via, sem UPDATE direto).
grant select on public.consents to authenticated;
grant select on public.list_submissions to authenticated;
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
-- list_submissions: dono lê os próprios; admin/system leem todos.
create policy list_submissions_select_own_or_admin on public.list_submissions
  for select to authenticated
  using (submitted_by = (select auth.uid()) or (select public.auth_role()) in ('admin', 'system'));
-- Regras de criação do envio (antes eram políticas de INSERT do usuário; agora valem também para o service_role,
-- que ignora RLS): dono com papel de envio, origem 'school' só para school_member/admin, status inicial 'submitted',
-- consentimento próprio, 'list_upload' e não revogado.
create function public.list_submissions_check_insert() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_role public.user_role;
begin
  select role into owner_role from public.profiles where id = new.submitted_by;
  if owner_role is null or owner_role not in ('parent', 'school_member', 'admin') then
    raise exception 'papel sem permissão de envio' using errcode = '42501';
  end if;
  if new.source = 'school' and owner_role not in ('school_member', 'admin') then
    raise exception 'origem school só para school_member/admin' using errcode = '42501';
  end if;
  if new.status <> 'submitted' then
    raise exception 'envio nasce como submitted' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.consents c
     where c.id = new.consent_id and c.profile_id = new.submitted_by
       and c.purpose = 'list_upload' and c.revoked_at is null
  ) then
    raise exception 'consentimento ausente, alheio ou revogado' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger list_submissions_check_insert before insert on public.list_submissions
  for each row execute function public.list_submissions_check_insert();
revoke execute on function public.list_submissions_check_insert() from public, anon, authenticated, service_role;

-- Identidade do envio é imutável: nem o service_role troca dono, consentimento, arquivo ou id depois de criado
-- (o consentimento que sustentou o envio não pode ser substituído por outro). Status, is_demo etc. seguem livres.
create function public.list_submissions_guard_update() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.submitted_by is distinct from old.submitted_by
     or new.consent_id is distinct from old.consent_id
     or new.source is distinct from old.source
     or new.storage_path is distinct from old.storage_path then
    raise exception 'identidade do envio é imutável' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger list_submissions_guard_update before update on public.list_submissions
  for each row execute function public.list_submissions_guard_update();

-- Consentimento é imutável, exceto a revogação (revoked_at nulo -> data, uma única vez).
create function public.consents_guard_update() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.profile_id is distinct from old.profile_id
     or new.purpose is distinct from old.purpose
     or new.text_version is distinct from old.text_version
     or new.granted_at is distinct from old.granted_at then
    raise exception 'consentimento é imutável' using errcode = '42501';
  end if;
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'consentimento revogado não pode ser alterado nem restaurado' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger consents_guard_update before update on public.consents
  for each row execute function public.consents_guard_update();

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
-- Revoga o consentimento do dono, uma única vez (idempotente: se já revogado, não altera nada).
create function public.consents_revoke(p_consent_id uuid, p_profile_id uuid) returns void
language sql
security definer
set search_path = ''
as $$
  update public.consents
     set revoked_at = now()
   where id = p_consent_id and profile_id = p_profile_id and revoked_at is null;
$$;

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

-- Reivindica o job para o worker. Devolve:
--   'claimed'  transição queued|retrying vencido -> running, ou reclaim de running com lease vencido (attempts+1);
--   'busy'     running com lease vigente (outro worker está com ele);
--   'not_due'  queued/retrying com run_after no futuro;
--   'finished' succeeded, dead ou inexistente (também quando precisava reclamar mas as tentativas acabaram: vira dead).
-- LEASE de 5 minutos (locked_at): o worker DEVE terminar (ou falhar) abaixo dela; senão outro worker reclama o job.
-- O SELECT ... FOR UPDATE serializa as chamadas: sob concorrência só uma devolve 'claimed', as demais 'busy'.
create function public.jobs_claim(p_job_id uuid) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.jobs;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if not found or j.status in ('succeeded', 'dead') then
    return 'finished';
  end if;
  if j.status = 'running' then
    if j.locked_at is not null and j.locked_at >= now() - interval '5 minutes' then
      return 'busy';
    end if;
  elsif j.run_after > now() then
    return 'not_due';
  end if;
  if j.attempts >= j.max_attempts then
    perform public.jobs_mark_dead(j.id, 'tentativas esgotadas');
    return 'finished';
  end if;
  update public.jobs set status = 'running', attempts = attempts + 1, locked_at = now() where id = j.id;
  return 'claimed';
end;
$$;

-- Rede de segurança do agendador: re-envia à fila jobs cuja mensagem se perdeu (running com lease vencido,
-- queued/retrying com run_after vencido e sem mensagem em q_ocr_jobs) e marca dead os sem tentativas restantes.
-- Devolve quantos jobs foram tratados. Idempotente: mensagem já presente não é duplicada.
-- Lease de 5 min: o worker deve rodar abaixo dela.
create function public.jobs_requeue_stale() returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id, attempts, max_attempts from public.jobs
     where kind = 'ocr_jobs'
       and (
         (status = 'running' and (locked_at is null or locked_at < now() - interval '5 minutes'))
         or (status in ('queued', 'retrying') and run_after <= now())
       )
     for update skip locked
  loop
    if r.attempts >= r.max_attempts then
      perform public.jobs_mark_dead(r.id, 'tentativas esgotadas');
      n := n + 1;
    elsif not exists (select 1 from pgmq.q_ocr_jobs m where m.message ->> 'job_id' = r.id::text) then
      perform pgmq.send('ocr_jobs', jsonb_build_object('job_id', r.id));
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- p_attempts (fencing): só conclui se o job ainda estiver na tentativa que este worker reivindicou; um worker antigo
-- (lease vencida, job reivindicado por outro) vira no-op. Nulo = sem fencing. p_is_demo: resultado do pipeline demo.
create function public.jobs_complete(
  p_job_id uuid, p_result jsonb, p_duration_ms int, p_attempts int default null, p_is_demo boolean default false
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.jobs;
begin
  update public.jobs
     set status = 'succeeded', locked_at = null, last_error = null
   where id = p_job_id and status = 'running' and (p_attempts is null or attempts = p_attempts)
   returning * into j;
  if j.id is null then
    return; -- idempotente: já concluído, nunca reivindicado ou tentativa superada
  end if;
  insert into public.ocr_jobs (job_id, submission_id, result, duration_ms)
  values (j.id, j.submission_id, p_result, p_duration_ms)
  on conflict (job_id) do nothing;
  if coalesce(p_is_demo, false) and j.submission_id is not null then
    update public.list_submissions set is_demo = true where id = j.submission_id;
  end if;
  perform public.jobs_touch_submission(j.submission_id, 'review_needed');
end;
$$;

-- p_permanent = true (ex.: arquivo armazenado inválido): vai direto a dead (DLQ + envio rejected), sem esgotar tentativas.
-- p_attempts (fencing): tentativa reivindicada por este worker; diferente da atual = no-op (devolve o status atual).
create function public.jobs_fail(
  p_job_id uuid, p_error text, p_retry_in_seconds int, p_permanent boolean default false, p_attempts int default null
) returns public.job_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.jobs;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if not found then
    return null; -- inexistente
  end if;
  if j.status <> 'running' then
    return j.status; -- no-op: já finalizado ou não reivindicado
  end if;
  if p_attempts is not null and j.attempts <> p_attempts then
    return j.status; -- tentativa superada: outro worker assumiu o job
  end if;
  if not coalesce(p_permanent, false) and j.attempts < j.max_attempts then
    update public.jobs
       set status = 'retrying', locked_at = null, last_error = left(p_error, 500),
           run_after = now() + make_interval(secs => greatest(coalesce(p_retry_in_seconds, 0), 0))
     where id = j.id;
    return 'retrying';
  end if;
  perform public.jobs_mark_dead(j.id, p_error);
  return 'dead';
end;
$$;

-- Envio síncrono (S07). O job nasce junto com o envio (idempotency_key = id do envio), `running` com lease: se o
-- processo do app morrer, jobs_requeue_stale recupera o órfão depois da lease. As funções abaixo fecham o envio.

-- Criação atômica do envio (consentimento + envio `processing` + job `running` com lease), UMA transação. O arquivo
-- já foi para o Storage no caminho {perfil}/{id}/{arquivo}; se esta função falhar, o servidor remove o objeto.
-- Os gatilhos (papel de envio, consentimento próprio, identidade imutável) continuam valendo dentro dela.
create function public.submissions_create(
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
  -- O job nasce com o envio: `running` com lease, chave = id do envio. Se o processo morrer daqui em diante,
  -- jobs_requeue_stale o recoloca na fila depois da lease (nenhum envio fica preso em `processing`).
  insert into public.jobs (kind, payload, status, attempts, locked_at, idempotency_key, submission_id)
  values ('ocr_jobs', jsonb_build_object('submission_id', p_id), 'running', 1, now(), p_id::text, p_id);
  return p_id;
end;
$$;

-- Resultado dentro do orçamento de 10 s, TUDO numa transação: job succeeded + ocr_jobs + envio review_needed.
-- Devolve false se o job não estiver mais `running` (ex.: já foi devolvido à fila); nada é gravado nesse caso.
create function public.submissions_record_sync_result(p_submission_id uuid, p_result jsonb, p_duration_ms int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.jobs;
begin
  select * into j from public.jobs where idempotency_key = p_submission_id::text for update;
  if not found or j.status <> 'running' then
    return false;
  end if;
  perform public.jobs_complete(j.id, p_result, p_duration_ms, j.attempts, false);
  return true;
end;
$$;

-- Estourou o orçamento: o job `running` vira `queued` (tentativas zeradas), entra na fila e o envio vira
-- processing_async, atomicamente (o worker nunca vê o envio no estado errado). Idempotente; sem job, cria um.
create function public.jobs_defer(p_submission_id uuid) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.jobs;
begin
  select * into j from public.jobs where idempotency_key = p_submission_id::text for update;
  if not found then
    insert into public.jobs (kind, payload, idempotency_key, submission_id)
    values ('ocr_jobs', jsonb_build_object('submission_id', p_submission_id), p_submission_id::text, p_submission_id)
    returning * into j;
    perform pgmq.send('ocr_jobs', jsonb_build_object('job_id', j.id));
  elsif j.status = 'running' then
    update public.jobs set status = 'queued', attempts = 0, locked_at = null, run_after = now() where id = j.id;
    perform pgmq.send('ocr_jobs', jsonb_build_object('job_id', j.id));
  end if;
  perform public.jobs_touch_submission(p_submission_id, 'processing_async');
  return j.id;
end;
$$;

-- Falha do envio antes de haver worker (pipeline falhou, enfileirar falhou): job dead (sem DLQ: não é falha de
-- fila) e envio rejected, juntos, para nenhum job órfão ser retomado depois.
create function public.submissions_reject(p_submission_id uuid, p_error text) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.jobs
     set status = 'dead', locked_at = null, last_error = left(p_error, 500)
   where idempotency_key = p_submission_id::text and status not in ('dead', 'succeeded');
  perform public.jobs_touch_submission(p_submission_id, 'rejected');
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
revoke execute on function public.jobs_complete(uuid, jsonb, int, int, boolean) from public, anon, authenticated, service_role;
revoke execute on function public.jobs_fail(uuid, text, int, boolean, int) from public, anon, authenticated, service_role;
revoke execute on function public.submissions_record_sync_result(uuid, jsonb, int) from public, anon, authenticated, service_role;
revoke execute on function public.jobs_defer(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.submissions_create(uuid, uuid, public.submission_source, uuid, text, int, text, text, text, bigint, boolean, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.submissions_reject(uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.jobs_read(int, int) from public, anon, authenticated, service_role;
revoke execute on function public.jobs_ack(bigint) from public, anon, authenticated, service_role;
revoke execute on function public.jobs_set_vt(bigint, int) from public, anon, authenticated, service_role;
revoke execute on function public.jobs_requeue_stale() from public, anon, authenticated, service_role;
revoke execute on function public.consents_revoke(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.jobs_enqueue(text, jsonb, text, uuid) to service_role;
grant execute on function public.jobs_claim(uuid) to service_role;
grant execute on function public.jobs_complete(uuid, jsonb, int, int, boolean) to service_role;
grant execute on function public.jobs_fail(uuid, text, int, boolean, int) to service_role;
grant execute on function public.submissions_record_sync_result(uuid, jsonb, int) to service_role;
grant execute on function public.jobs_defer(uuid) to service_role;
grant execute on function public.submissions_create(uuid, uuid, public.submission_source, uuid, text, int, text, text, text, bigint, boolean, text, text) to service_role;
grant execute on function public.submissions_reject(uuid, text) to service_role;
grant execute on function public.jobs_read(int, int) to service_role;
grant execute on function public.jobs_ack(bigint) to service_role;
grant execute on function public.jobs_set_vt(bigint, int) to service_role;
grant execute on function public.jobs_requeue_stale() to service_role;
grant execute on function public.consents_revoke(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Storage: bucket privado e políticas em storage.objects (RLS já vem habilitada pelo Supabase)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'list-uploads', 'list-uploads', false, 4000000,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- list-uploads: sem política de INSERT/UPDATE/DELETE para authenticated nem anon: o upload é feito pelo servidor
-- com service_role (que ignora RLS) para {uid}/{envio}/arquivo; objetos imutáveis para o usuário.
-- list-uploads: dono lê a própria pasta; admin/system leem tudo. Só caminhos {uid}/{uuid do envio}/... sem '..'.
create policy list_uploads_select_own_or_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'list-uploads'
    and name !~ '(^|/)\.\.(/|$)'
    and (storage.foldername(name))[2] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.auth_role()) in ('admin', 'system')
    )
  );
