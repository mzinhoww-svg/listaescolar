-- 0805_s29_decision_notifications (S29 · UX-109): a decisão da equipe avisa quem foi afetado.
-- Antes só reivindicação e publicação de lista emitiam aviso; aprovar/recusar papelaria, decidir contestação e decidir
-- parceiro deixavam a pessoa descobrir só ao reabrir o painel. Segue o padrão da 0602/0606/0803:
--  * 3 novos event_type no catálogo fechado: stationery_decided, dispute_decided, partner_decided;
--  * status_code ganha 'accepted', 'sandbox' e 'active' (lista fechada; nunca motivo nem texto livre nos params);
--  * gatilhos AFTER (mesma transação do fato); erro na emissão nunca desfaz a decisão (notification_emit_errors);
--  * funções de gatilho SECURITY DEFINER, search_path vazio, sem EXECUTE para ninguém;
--  * stationery_decided e dispute_decided aceitam canal externo SE o dono ligar (padrão desligado); partner_decided só
--    central (o portal B2B não tem matriz de preferências). Título de push genérico (catalog.ts).

alter table public.notifications drop constraint notifications_event_type_valid;
alter table public.notifications add constraint notifications_event_type_valid check (event_type in (
  'submission_ready', 'submission_failed', 'submission_published', 'submission_not_published', 'list_published',
  'lead_received', 'lead_quote_sent', 'lead_expired', 'claim_updated', 'publication_orphaned', 'system_alert',
  'stationery_decided', 'dispute_decided', 'partner_decided'));

alter table public.notification_preferences drop constraint notification_preferences_event_valid;
alter table public.notification_preferences add constraint notification_preferences_event_valid check (event_type in (
  'submission_ready', 'submission_failed', 'submission_published', 'submission_not_published', 'list_published',
  'lead_received', 'lead_quote_sent', 'lead_expired', 'claim_updated', 'publication_orphaned',
  'stationery_decided', 'dispute_decided'));

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
              'received', 'viewed', 'in_progress', 'quote_sent', 'awaiting_customer', 'converted', 'declined', 'expired', 'cancelled',
              'accepted', 'sandbox', 'active']))
         or (e.key = 'alert_kind' and jsonb_typeof(e.value) = 'string' and (e.value #>> '{}') = any (array['dead_jobs', 'ai_error_rate']))
         or (e.key = 'alert_count' and jsonb_typeof(e.value) = 'number' and (e.value #>> '{}') ~ '^[0-9]{1,6}$')
       )
    )
  end;
$$;

-- Papelaria: em revisão -> aprovada/recusada. Avisa os membros da papelaria (quem foi promovido na aprovação já é membro).
create function public.notify_stationery_decided() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_actor uuid := auth.uid();
begin
  for r in select m.profile_id from public.stationery_members m where m.stationery_id = new.id and m.profile_id is distinct from v_actor loop
    perform public.notification_emit(
      r.profile_id, 'stationery_decided',
      'stationery_decided:' || new.id::text || ':' || new.status::text || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text,
      jsonb_build_object('status_code', new.status::text), '/papelaria', new.is_demo);
  end loop;
  return null;
exception when others then
  insert into public.notification_emit_errors (event_type, sqlstate) values ('stationery_decided', sqlstate);
  raise warning 'notification_emit_error %', sqlstate;
  return null;
end;
$$;
create trigger notify_stationery_decided after update of status on public.stationeries
  for each row when (old.status = 'under_review' and new.status in ('approved', 'rejected')) execute function public.notify_stationery_decided();

-- Contestação: aberta -> aceita/recusada. Avisa os membros da papelaria; o motivo da decisão fica só na página do pedido.
create function public.notify_dispute_decided() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_code text;
  v_demo boolean;
  v_actor uuid := auth.uid();
begin
  select l.code, l.is_demo into v_code, v_demo from public.leads l where l.id = new.lead_id;
  if v_code is null then
    return null;
  end if;
  for r in select m.profile_id from public.stationery_members m where m.stationery_id = new.stationery_id and m.profile_id is distinct from v_actor loop
    perform public.notification_emit(
      r.profile_id, 'dispute_decided', 'dispute_decided:' || new.id::text,
      jsonb_build_object('status_code', new.status), '/papelaria/leads/' || v_code, coalesce(v_demo, false));
  end loop;
  return null;
exception when others then
  insert into public.notification_emit_errors (event_type, sqlstate) values ('dispute_decided', sqlstate);
  raise warning 'notification_emit_error %', sqlstate;
  return null;
end;
$$;
create trigger notify_dispute_decided after update of status on public.lead_disputes
  for each row when (old.status = 'open' and new.status in ('accepted', 'rejected')) execute function public.notify_dispute_decided();

-- Parceiro: decisão para sandbox, produção ou recusa. Só central (in_app_only). Suspensão não avisa (fora do escopo).
create function public.notify_partner_decided() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_actor uuid := auth.uid();
begin
  for r in select m.profile_id from public.b2b_partner_members m where m.partner_id = new.id and m.profile_id is distinct from v_actor loop
    perform public.notification_emit(
      r.profile_id, 'partner_decided',
      'partner_decided:' || new.id::text || ':' || new.status::text || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text,
      jsonb_build_object('status_code', new.status::text), '/b2b/conta', new.is_demo, true);
  end loop;
  return null;
exception when others then
  insert into public.notification_emit_errors (event_type, sqlstate) values ('partner_decided', sqlstate);
  raise warning 'notification_emit_error %', sqlstate;
  return null;
end;
$$;
create trigger notify_partner_decided after update of status on public.b2b_partners
  for each row when (old.status is distinct from new.status and new.status in ('sandbox', 'active', 'rejected')) execute function public.notify_partner_decided();

alter table public.stationeries enable always trigger notify_stationery_decided;
alter table public.lead_disputes enable always trigger notify_dispute_decided;
alter table public.b2b_partners enable always trigger notify_partner_decided;

revoke execute on function public.notify_stationery_decided(), public.notify_dispute_decided(), public.notify_partner_decided()
  from public, anon, authenticated, service_role;
