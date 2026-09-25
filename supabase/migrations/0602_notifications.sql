-- 0602_notifications: notificações (S11, Task 3). Depende da 0601.
-- Central in-app + entregas externas (Web Push, e-mail atrás de flag de BANCO desligada por padrão). Nada de dado de menor nem de
-- responsável: `params` é lista fechada (escola pública, rótulo da série, ano, código do lead, código de status); push e e-mail levam só
-- título genérico e o caminho do link (o texto é montado no TypeScript). Notificação nasce por gatilho AFTER na mesma transação do fato;
-- erro na emissão nunca desfaz o fato (contador em notification_emit_errors). Funções: SECURITY DEFINER, search_path vazio, EXECUTE só service_role.

-- ---------------------------------------------------------------------------
-- Flag de e-mail (uma linha; padrão desligado) e contador de erros de emissão
-- ---------------------------------------------------------------------------
create table public.notification_settings (
  id boolean primary key default true check (id),
  email_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.notification_settings (id, email_enabled) values (true, false);
create trigger notification_settings_set_updated_at before update on public.notification_settings for each row execute function public.set_updated_at();

create table public.notification_emit_errors (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (length(event_type) between 1 and 60),
  sqlstate text not null check (sqlstate ~ '^[0-9A-Z]{5}$'), -- só o código, nunca a mensagem
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.notification_email_enabled() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select s.email_enabled from public.notification_settings s where s.id), false); $$;

-- ---------------------------------------------------------------------------
-- Validador dos params (lista fechada; sem texto livre, sem objeto aninhado)
-- ---------------------------------------------------------------------------
create function public.notification_params_valid(p jsonb) returns boolean
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
       )
    )
  end;
$$;
revoke execute on function public.notification_params_valid(jsonb) from public, anon;
grant execute on function public.notification_params_valid(jsonb) to authenticated, service_role; -- CHECK roda com o papel de quem grava

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null,
  event_key text not null check (length(event_key) between 1 and 200),
  params jsonb not null default '{}'::jsonb,
  link_path text not null,
  is_demo boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notifications_event_type_valid check (event_type in (
    'submission_ready', 'submission_failed', 'submission_published', 'submission_not_published', 'list_published',
    'lead_received', 'lead_quote_sent', 'lead_expired', 'claim_updated', 'publication_orphaned')),
  constraint notifications_params_valid check (public.notification_params_valid(params)),
  -- caminho relativo do próprio site: nunca URL externa, nunca "//"
  constraint notifications_link_path_valid check (link_path ~ '^/[A-Za-z0-9/_?=&.%-]*$' and link_path !~ '//' and length(link_path) <= 300),
  constraint notifications_recipient_key unique (recipient_id, event_key)
);
create index notifications_recipient_idx on public.notifications (recipient_id, read_at, created_at desc);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  channel text not null check (channel in ('web_push', 'email')),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped', 'dead')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[a-z][a-z0-9_]{0,59}$'), -- só código, sem texto do provedor
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_deliveries_channel_key unique (notification_id, channel)
);
create index notification_deliveries_due_idx on public.notification_deliveries (next_attempt_at) where status in ('queued', 'failed', 'sending');

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null check (length(endpoint) <= 2000 and (endpoint ~ '^https://[^\s]+$' or endpoint ~ '^http://(127\.0\.0\.1|localhost)(:[0-9]+)?/[^\s]*$')),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{20,200}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{10,100}$'),
  last_success_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_key unique (endpoint)
);
create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id) where revoked_at is null;
comment on table public.push_subscriptions is 'S11: assinaturas Web Push. Sem user agent nem IP. http só de loopback (a action recusa fora de local/development).';

create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null,
  channel text not null check (channel in ('web_push', 'email')),
  enabled boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_preferences_event_valid check (event_type in (
    'submission_ready', 'submission_failed', 'submission_published', 'submission_not_published', 'list_published',
    'lead_received', 'lead_quote_sent', 'lead_expired', 'claim_updated', 'publication_orphaned')),
  constraint notification_preferences_key unique (profile_id, event_type, channel)
);

create table public.list_watches (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete restrict,
  grade_id uuid not null references public.grades (id) on delete restrict,
  school_year integer not null check (school_year between 2000 and 2100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint list_watches_key unique (profile_id, school_id, grade_id, school_year)
);
create index list_watches_target_idx on public.list_watches (school_id, grade_id, school_year);
create index list_watches_grade_idx on public.list_watches (grade_id);

create trigger notifications_set_updated_at before update on public.notifications for each row execute function public.set_updated_at();
create trigger notification_deliveries_set_updated_at before update on public.notification_deliveries for each row execute function public.set_updated_at();
create trigger push_subscriptions_set_updated_at before update on public.push_subscriptions for each row execute function public.set_updated_at();
create trigger notification_preferences_set_updated_at before update on public.notification_preferences for each row execute function public.set_updated_at();
create trigger list_watches_set_updated_at before update on public.list_watches for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS e grants (o dono lê/marca as suas; entregas, flag e erros só pelo servidor)
-- ---------------------------------------------------------------------------
alter table public.notifications enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.list_watches enable row level security;
alter table public.notification_settings enable row level security;
alter table public.notification_emit_errors enable row level security;

revoke all on public.notifications, public.notification_deliveries, public.push_subscriptions, public.notification_preferences,
  public.list_watches, public.notification_settings, public.notification_emit_errors from public, anon, authenticated, service_role;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated;
grant select, delete on public.list_watches to authenticated;
grant select on public.notifications, public.notification_deliveries, public.push_subscriptions, public.notification_preferences,
  public.list_watches, public.notification_emit_errors to service_role;
grant select on public.notification_settings to service_role;

create policy notifications_select_own on public.notifications for select to authenticated using (recipient_id = (select auth.uid()));
create policy notifications_update_own on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
create policy push_subscriptions_select_own on public.push_subscriptions for select to authenticated using (profile_id = (select auth.uid()));
create policy push_subscriptions_delete_own on public.push_subscriptions for delete to authenticated using (profile_id = (select auth.uid()));
create policy notification_preferences_select_own on public.notification_preferences for select to authenticated using (profile_id = (select auth.uid()));
create policy notification_preferences_insert_own on public.notification_preferences for insert to authenticated with check (profile_id = (select auth.uid()));
create policy notification_preferences_update_own on public.notification_preferences for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy notification_preferences_delete_own on public.notification_preferences for delete to authenticated using (profile_id = (select auth.uid()));
create policy list_watches_select_own on public.list_watches for select to authenticated using (profile_id = (select auth.uid()));
create policy list_watches_delete_own on public.list_watches for delete to authenticated using (profile_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Emissão
-- ---------------------------------------------------------------------------
-- Insere a notificação (idempotente por destinatário + event_key) e as entregas externas dos canais que o DONO ligou: web_push com
-- assinatura ativa; e-mail só com a flag de banco ligada. Teto de 10 entregas externas por hora e destinatário (excedente skipped).
create function public.notification_emit(
  p_recipient uuid, p_event text, p_key text, p_params jsonb, p_link text, p_demo boolean, p_in_app_only boolean default false
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_channel text;
  v_recent integer;
begin
  insert into public.notifications (recipient_id, event_type, event_key, params, link_path, is_demo)
  values (p_recipient, p_event, p_key, coalesce(p_params, '{}'::jsonb), p_link, coalesce(p_demo, false))
  on conflict (recipient_id, event_key) do nothing
  returning id into v_id;
  if v_id is null or p_in_app_only then
    return v_id;
  end if;
  foreach v_channel in array array['web_push', 'email'] loop
    continue when not exists (
      select 1 from public.notification_preferences pr
       where pr.profile_id = p_recipient and pr.event_type = p_event and pr.channel = v_channel and pr.enabled);
    if v_channel = 'web_push' and not exists (select 1 from public.push_subscriptions s where s.profile_id = p_recipient and s.revoked_at is null) then
      continue;
    end if;
    if v_channel = 'email' and not public.notification_email_enabled() then
      continue;
    end if;
    select count(*) into v_recent
      from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
     where n.recipient_id = p_recipient and d.status in ('queued', 'sending', 'sent', 'failed') and d.created_at > now() - interval '1 hour';
    if v_recent >= 10 then
      insert into public.notification_deliveries (notification_id, channel, status, last_error_code) values (v_id, v_channel, 'skipped', 'rate_limited');
    else
      insert into public.notification_deliveries (notification_id, channel) values (v_id, v_channel);
    end if;
  end loop;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Gatilhos por evento (AFTER, mesma transação do fato). Quem causou o fato (auth.uid()) não é notificado.
-- ---------------------------------------------------------------------------
create function public.notify_submission_status() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_params jsonb := '{}'::jsonb;
  v_name text;
  v_grade text;
  v_link text := '/enviar-lista/' || new.id::text;
  v_actor uuid := auth.uid();
begin
  if old.status = 'processing_async' and new.status in ('review_needed', 'human_review', 'approved', 'published', 'rejected') then
    if new.status = 'rejected' then
      if new.submitted_by is distinct from v_actor then
        perform public.notification_emit(new.submitted_by, 'submission_failed', 'submission_failed:' || new.id::text, '{}'::jsonb, v_link, new.is_demo);
      end if;
    else
      select s.name into v_name from public.schools s where s.id = new.school_id;
      select g.name into v_grade from public.grades g where new.grade is not null and lower(g.name) = lower(btrim(new.grade));
      v_params := jsonb_strip_nulls(jsonb_build_object('school_name', v_name, 'grade_label', v_grade, 'school_year', new.school_year));
      if new.submitted_by is distinct from v_actor then
        perform public.notification_emit(new.submitted_by, 'submission_ready', 'submission_ready:' || new.id::text, v_params, v_link, new.is_demo);
      end if;
    end if;
  end if;
  if new.status = 'published' and new.submitted_by is distinct from v_actor then
    perform public.notification_emit(new.submitted_by, 'submission_published', 'submission_published:' || new.id::text, '{}'::jsonb, v_link, new.is_demo);
  end if;
  return null;
exception when others then
  insert into public.notification_emit_errors (event_type, sqlstate) values ('submission_status', sqlstate);
  raise warning 'notification_emit_error %', sqlstate;
  return null;
end;
$$;
create trigger notify_submission_status after update of status on public.list_submissions
  for each row when (old.status is distinct from new.status) execute function public.notify_submission_status();

create function public.notify_review_rejected() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_to uuid;
  v_demo boolean;
begin
  select s.submitted_by, s.is_demo into v_to, v_demo from public.list_submissions s where s.id = new.entity_id;
  if v_to is not null and v_to is distinct from new.actor_id then
    perform public.notification_emit(v_to, 'submission_not_published', 'submission_not_published:' || new.id::text, '{}'::jsonb, '/enviar-lista/' || new.entity_id::text, v_demo);
  end if;
  return null;
exception when others then
  insert into public.notification_emit_errors (event_type, sqlstate) values ('submission_not_published', sqlstate);
  raise warning 'notification_emit_error %', sqlstate;
  return null;
end;
$$;
create trigger notify_review_rejected after insert on public.ai_decisions
  for each row when (new.kind = 'review' and new.decision = 'rejected') execute function public.notify_review_rejected();

create function public.notify_publication_orphaned() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  for r in select p.id from public.profiles p where p.role = 'admin' and p.id is distinct from new.actor_id loop
    perform public.notification_emit(r.id, 'publication_orphaned', 'publication_orphaned:' || new.id::text, '{}'::jsonb, '/admin/revisao/' || new.entity_id::text, false, true);
  end loop;
  return null;
exception when others then
  insert into public.notification_emit_errors (event_type, sqlstate) values ('publication_orphaned', sqlstate);
  raise warning 'notification_emit_error %', sqlstate;
  return null;
end;
$$;
create trigger notify_publication_orphaned after insert on public.ai_decisions
  for each row when (new.kind in ('publication', 'review') and new.decision = 'publish_orphaned') execute function public.notify_publication_orphaned();

create function public.notify_list_published() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_actor uuid := auth.uid();
begin
  for r in
    select w.profile_id, s.inep, s.name as school_name, g.slug, g.name as grade_name, l.school_year, l.is_demo
      from public.school_lists l
      join public.schools s on s.id = l.school_id
      join public.grades g on g.id = l.grade_id
      join public.list_watches w on w.school_id = l.school_id and w.grade_id = l.grade_id and w.school_year = l.school_year
     where l.id = new.list_id and w.profile_id is distinct from v_actor
  loop
    perform public.notification_emit(
      r.profile_id, 'list_published', 'list_published:' || new.id::text,
      jsonb_build_object('school_name', r.school_name, 'grade_label', r.grade_name, 'school_year', r.school_year),
      '/escolas/' || r.inep || '/' || r.slug || '?ano=' || r.school_year::text, r.is_demo);
  end loop;
  return null;
exception when others then
  insert into public.notification_emit_errors (event_type, sqlstate) values ('list_published', sqlstate);
  raise warning 'notification_emit_error %', sqlstate;
  return null;
end;
$$;
create trigger notify_list_published after update of status on public.list_versions
  for each row when (new.status = 'published' and old.status is distinct from 'published') execute function public.notify_list_published();

create function public.notify_lead_created() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  for r in select m.profile_id from public.stationery_members m where m.stationery_id = new.stationery_id loop
    perform public.notification_emit(r.profile_id, 'lead_received', 'lead_received:' || new.id::text, jsonb_build_object('lead_code', new.code), '/papelaria/leads/' || new.code, new.is_demo);
  end loop;
  return null;
exception when others then
  insert into public.notification_emit_errors (event_type, sqlstate) values ('lead_received', sqlstate);
  raise warning 'notification_emit_error %', sqlstate;
  return null;
end;
$$;
create trigger notify_lead_created after insert on public.leads for each row execute function public.notify_lead_created();

create function public.notify_lead_status() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.requester_id is not null and new.requester_id is distinct from auth.uid() then
    perform public.notification_emit(
      new.requester_id, case new.status when 'quote_sent' then 'lead_quote_sent' else 'lead_expired' end,
      case new.status when 'quote_sent' then 'lead_quote_sent:' else 'lead_expired:' end || new.id::text,
      jsonb_build_object('lead_code', new.code), '/cotacao/' || new.code, new.is_demo);
  end if;
  return null;
exception when others then
  insert into public.notification_emit_errors (event_type, sqlstate) values ('lead_status', sqlstate);
  raise warning 'notification_emit_error %', sqlstate;
  return null;
end;
$$;
create trigger notify_lead_status after update of status on public.leads
  for each row when (new.status in ('quote_sent', 'expired') and old.status is distinct from new.status) execute function public.notify_lead_status();

create function public.notify_claim_status() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_inep text;
  v_name text;
begin
  if new.claimant_id is distinct from auth.uid() then
    select s.inep, s.name into v_inep, v_name from public.schools s where s.id = new.school_id;
    perform public.notification_emit(
      new.claimant_id, 'claim_updated', 'claim_updated:' || new.id::text || ':' || new.status::text,
      jsonb_build_object('school_name', v_name, 'status_code', new.status::text), '/escolas/' || v_inep || '/reivindicar', new.is_demo);
  end if;
  return null;
exception when others then
  insert into public.notification_emit_errors (event_type, sqlstate) values ('claim_updated', sqlstate);
  raise warning 'notification_emit_error %', sqlstate;
  return null;
end;
$$;
create trigger notify_claim_status after update of status on public.claims
  for each row when (new.status in ('approved', 'rejected', 'insufficient_evidence', 'token_expired') and old.status is distinct from new.status)
  execute function public.notify_claim_status();

alter table public.list_submissions enable always trigger notify_submission_status;
alter table public.ai_decisions enable always trigger notify_review_rejected;
alter table public.ai_decisions enable always trigger notify_publication_orphaned;
alter table public.list_versions enable always trigger notify_list_published;
alter table public.leads enable always trigger notify_lead_created;
alter table public.leads enable always trigger notify_lead_status;
alter table public.claims enable always trigger notify_claim_status;

-- ---------------------------------------------------------------------------
-- Despacho: claim com lease de 60 s (skip locked), marcação, limpeza, leitura e assinaturas
-- ---------------------------------------------------------------------------
create function public.notification_claim_deliveries(p_limit int) returns setof jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if p_limit is null or p_limit not between 1 and 50 then
    raise exception 'limite inválido' using errcode = '22023';
  end if;
  return query
  with c as (
    select d.id from public.notification_deliveries d
     where (d.status in ('queued', 'failed') and d.next_attempt_at <= now() and (d.locked_until is null or d.locked_until < now()))
        or (d.status = 'sending' and d.locked_until < now())
     order by d.next_attempt_at, d.id limit p_limit for update skip locked
  ), u as (
    update public.notification_deliveries d
       set status = 'sending', locked_until = now() + interval '60 seconds', attempts = d.attempts + 1
      from c where d.id = c.id returning d.*
  )
  select jsonb_build_object(
      'id', u.id, 'channel', u.channel, 'eventType', n.event_type, 'linkPath', n.link_path, 'attempts', u.attempts, 'isDemo', n.is_demo,
      'subscriptions', case when u.channel = 'web_push' then coalesce((
          select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
            from public.push_subscriptions s where s.profile_id = n.recipient_id and s.revoked_at is null), '[]'::jsonb) else '[]'::jsonb end,
      'email', case when u.channel = 'email' then (select au.email from auth.users au where au.id = n.recipient_id) end)
    from u join public.notifications n on n.id = u.notification_id;
end;
$$;

-- Resultado do envio: sent | transient (retry exponencial de 1, 2, 4, 8 min; dead na 5ª tentativa) | permanent (dead) | skipped.
create function public.notification_mark_delivery(p_id uuid, p_outcome text, p_code text, p_revoke uuid[]) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_attempts integer;
begin
  if p_outcome is null or p_outcome not in ('sent', 'transient', 'permanent', 'skipped') then
    raise exception 'resultado inválido' using errcode = '22023';
  end if;
  if p_code is not null and p_code !~ '^[a-z][a-z0-9_]{0,59}$' then
    raise exception 'código inválido' using errcode = '22023';
  end if;
  select d.attempts into v_attempts from public.notification_deliveries d where d.id = p_id for update;
  if not found then
    return false;
  end if;
  update public.notification_deliveries set
    status = case p_outcome when 'sent' then 'sent' when 'skipped' then 'skipped' when 'permanent' then 'dead'
                            else case when v_attempts >= 5 then 'dead' else 'failed' end end,
    sent_at = case when p_outcome = 'sent' then now() else sent_at end,
    next_attempt_at = case when p_outcome = 'transient' and v_attempts < 5 then now() + make_interval(mins => (2 ^ greatest(v_attempts - 1, 0))::int) else next_attempt_at end,
    locked_until = null,
    last_error_code = case when p_outcome = 'sent' then null else p_code end
   where id = p_id;
  if p_revoke is not null then
    update public.push_subscriptions set revoked_at = now() where id = any (p_revoke) and revoked_at is null;
  end if;
  if p_outcome = 'sent' then
    update public.push_subscriptions s set last_success_at = now(), failure_count = 0
     where s.profile_id = (select n.recipient_id from public.notification_deliveries d join public.notifications n on n.id = d.notification_id where d.id = p_id)
       and s.revoked_at is null and (select d.channel from public.notification_deliveries d where d.id = p_id) = 'web_push';
  end if;
  return true;
end;
$$;

create function public.notification_purge_old(p_days int) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  if p_days is null or p_days < 1 then
    raise exception 'dias inválidos' using errcode = '22023';
  end if;
  delete from public.notifications where read_at is not null and read_at < now() - make_interval(days => p_days);
  get diagnostics n = row_count;
  return n;
end;
$$;

create function public.notifications_mark_read(p_profile_id uuid, p_ids uuid[]) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  update public.notifications set read_at = now()
   where recipient_id = p_profile_id and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end;
$$;

create function public.list_watch_add(p_profile_id uuid, p_school_id uuid, p_grade_slug text, p_year int) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_grade uuid;
begin
  select g.id into v_grade from public.grades g where g.slug = p_grade_slug;
  if v_grade is null then
    return 'grade_unknown';
  end if;
  if p_year is null or p_year not between 2000 and 2100 then
    raise exception 'ano inválido' using errcode = '22023';
  end if;
  if not exists (select 1 from public.schools s where s.id = p_school_id) then
    return 'school_not_found';
  end if;
  if exists (select 1 from public.list_watches w where w.profile_id = p_profile_id and w.school_id = p_school_id and w.grade_id = v_grade and w.school_year = p_year) then
    return 'exists';
  end if;
  if (select count(*) from public.list_watches w where w.profile_id = p_profile_id) >= 20 then
    return 'limit';
  end if;
  insert into public.list_watches (profile_id, school_id, grade_id, school_year) values (p_profile_id, p_school_id, v_grade, p_year);
  return 'added';
end;
$$;

create function public.list_watch_remove(p_profile_id uuid, p_school_id uuid, p_grade_slug text, p_year int) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.list_watches w using public.grades g
   where g.id = w.grade_id and g.slug = p_grade_slug and w.profile_id = p_profile_id and w.school_id = p_school_id and w.school_year = p_year;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

create function public.push_subscription_upsert(p_profile_id uuid, p_endpoint text, p_p256dh text, p_auth text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth) values (p_profile_id, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set profile_id = excluded.profile_id, p256dh = excluded.p256dh, auth = excluded.auth, revoked_at = null, failure_count = 0
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilégios: EXECUTE só service_role (gatilhos e auxiliares internas: ninguém)
-- ---------------------------------------------------------------------------
revoke execute on function
  public.notification_email_enabled(), public.notification_emit(uuid, text, text, jsonb, text, boolean, boolean),
  public.notify_submission_status(), public.notify_review_rejected(), public.notify_publication_orphaned(), public.notify_list_published(),
  public.notify_lead_created(), public.notify_lead_status(), public.notify_claim_status(),
  public.notification_claim_deliveries(int), public.notification_mark_delivery(uuid, text, text, uuid[]), public.notification_purge_old(int),
  public.notifications_mark_read(uuid, uuid[]), public.list_watch_add(uuid, uuid, text, int), public.list_watch_remove(uuid, uuid, text, int),
  public.push_subscription_upsert(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function
  public.notification_emit(uuid, text, text, jsonb, text, boolean, boolean), public.notification_claim_deliveries(int),
  public.notification_mark_delivery(uuid, text, text, uuid[]), public.notification_purge_old(int), public.notifications_mark_read(uuid, uuid[]),
  public.list_watch_add(uuid, uuid, text, int), public.list_watch_remove(uuid, uuid, text, int), public.push_subscription_upsert(uuid, text, text, text)
  to service_role;
