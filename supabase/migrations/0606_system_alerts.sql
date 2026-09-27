-- 0606_system_alerts: alerta de fila morta e de taxa de erro do provedor de IA (S19). Depende da 0602
-- (notifications). Aditiva: novo event_type 'system_alert' + duas novas chaves fechadas em `params`
-- (alert_kind, alert_count — nunca id de entidade, nunca texto livre) + função que notifica todo perfil `admin`
-- pela central de notificações (S11), em memória do dia (dedup por `event_key`), sem nenhum dado pessoal.

-- ---------------------------------------------------------------------------
-- event_type: acrescenta 'system_alert' ao catálogo fechado
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_event_type_valid;
alter table public.notifications add constraint notifications_event_type_valid check (event_type in (
  'submission_ready', 'submission_failed', 'submission_published', 'submission_not_published', 'list_published',
  'lead_received', 'lead_quote_sent', 'lead_expired', 'claim_updated', 'publication_orphaned', 'system_alert'));

-- ---------------------------------------------------------------------------
-- params: acrescenta alert_kind/alert_count (mesma função, mesma assinatura — grants preservados pelo Postgres)
-- ---------------------------------------------------------------------------
create or replace function public.notification_params_valid(p jsonb) returns boolean
language sql immutable set search_path = ''
as $$
  select case
    when p is null or jsonb_typeof(p) <> 'object' then false
    else not exists (
      select 1 from jsonb_each(p) e
       where not (
         (e.key = 'school_name' and jsonb_typeof(e.value) = 'string' and length(e.value #>> '{}') between 1 and 120)
         or (e.key = 'grade_label' and jsonb_typeof(e.value) = 'string' and length(e.value #>> '{}') between 1 and 60)
         or (e.key = 'school_year' and jsonb_typeof(e.value) = 'number' and (e.value #>> '{}') ~ '^[0-9]{4}$' and (e.value #>> '{}')::int between 2000 and 2100)
         or (e.key = 'lead_code' and jsonb_typeof(e.value) = 'string' and (e.value #>> '{}') ~ '^LC-[0-9A-HJKMNP-TV-Z]{4,6}$')
         or (e.key = 'status_code' and jsonb_typeof(e.value) = 'string' and (e.value #>> '{}') = any (array[
              'draft', 'submitted', 'processing', 'processing_async', 'review_needed', 'human_review', 'approved', 'published', 'archived', 'rejected',
              'awaiting_verification', 'token_expired', 'insufficient_evidence',
              'received', 'viewed', 'in_progress', 'quote_sent', 'awaiting_customer', 'converted', 'declined', 'expired', 'cancelled']))
         or (e.key = 'alert_kind' and jsonb_typeof(e.value) = 'string' and (e.value #>> '{}') = any (array['dead_jobs', 'ai_error_rate']))
         or (e.key = 'alert_count' and jsonb_typeof(e.value) = 'number' and (e.value #>> '{}') ~ '^[0-9]{1,6}$')
       )
    )
  end;
$$;

-- ---------------------------------------------------------------------------
-- Notifica todo perfil admin (uma linha por admin, dedup por dia via event_key); só in-app (S19 não abre canal
-- externo novo). Chamada só pelo cron de verificação (`/api/cron/health-check`, service_role).
-- ---------------------------------------------------------------------------
create function public.system_alert_notify(p_kind text, p_count integer) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_key text;
  v_params jsonb;
  v_admin record;
  v_n integer := 0;
begin
  if p_kind not in ('dead_jobs', 'ai_error_rate') then
    raise exception 'alert_kind inválido: %', p_kind;
  end if;
  v_key := 'system_alert:' || p_kind || ':' || to_char(now(), 'YYYY-MM-DD');
  v_params := jsonb_build_object('alert_kind', p_kind, 'alert_count', greatest(coalesce(p_count, 0), 0));
  for v_admin in select id from public.profiles where role = 'admin' loop
    perform public.notification_emit(v_admin.id, 'system_alert', v_key, v_params, '/admin', false, true);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.system_alert_notify(text, integer) from public, anon, authenticated;
grant execute on function public.system_alert_notify(text, integer) to service_role;
