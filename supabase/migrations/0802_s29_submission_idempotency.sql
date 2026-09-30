-- S29 T14: envio de lista idempotente por (dono, chave). O formulário gera uma chave por renderização; o reenvio
-- ("Tentar de novo" depois de queda de rede, toque duplo) devolve o envio já criado em vez de um segundo envio, um
-- segundo job/leitura e mais uso do limite. Coluna nula para envios antigos e outros caminhos. Aditiva: RLS e grants
-- da tabela não mudam; a função nova (14 argumentos) recebe o mesmo grant restrito da de 13.
alter table public.list_submissions add column idempotency_key uuid;
create unique index list_submissions_owner_idempotency_key_uidx on public.list_submissions (submitted_by, idempotency_key) where idempotency_key is not null;

create function public.submissions_create(
  p_id uuid, p_profile_id uuid, p_source public.submission_source, p_school_id uuid, p_grade text, p_school_year int,
  p_storage_path text, p_file_name text, p_mime_type text, p_size_bytes bigint, p_is_demo boolean,
  p_consent_purpose text, p_consent_text_version text, p_idempotency_key uuid
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
    consent_id, is_demo, idempotency_key
  ) values (
    p_id, p_profile_id, p_source, p_school_id, p_grade, p_school_year, p_storage_path, p_file_name, p_mime_type,
    p_size_bytes, c_id, coalesce(p_is_demo, false), p_idempotency_key
  );
  update public.list_submissions set status = 'processing' where id = p_id;
  insert into public.jobs (kind, payload, status, attempts, locked_at, idempotency_key, submission_id)
  values ('ocr_jobs', jsonb_build_object('submission_id', p_id), 'running', 1, now(), p_id::text, p_id);
  return p_id;
end;
$$;

revoke execute on function public.submissions_create(uuid, uuid, public.submission_source, uuid, text, int, text, text, text, bigint, boolean, text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.submissions_create(uuid, uuid, public.submission_source, uuid, text, int, text, text, text, bigint, boolean, text, text, uuid) to service_role;
