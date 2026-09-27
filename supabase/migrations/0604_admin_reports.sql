-- 0604_admin_reports: denúncias (S16, Admin). Fila de denúncia sobre lista publicada, papelaria ou item de
-- catálogo, com motivo por código (nunca prosa/dado pessoal) e resolução do admin. O dashboard (Admin01-Visao) e
-- a auditoria filtrável (Admin08-Eventos) NÃO precisam de função nova: `schools`, `school_lists`, `claims`,
-- `stationeries`, `leads` e `audit_log` já têm política `..._select_admin` desde S01–S14 (RLS por
-- `auth_role() in ('admin','system')`), lida pelo client de sessão. Arquivar lista reaproveita
-- `public.list_archive` (0103, S05), já existente e sem uso em nenhuma UI ainda. Nenhuma função desta migration
-- lê `public.students` (mínimo de dado de menor).
-- Idempotente sob `supabase db reset` (banco recriado do zero).

create type public.report_target_type as enum ('school_list', 'stationery', 'catalog_item');
create type public.report_reason as enum (
  'preco_incorreto', 'informacao_desatualizada', 'conteudo_inadequado', 'suspeita_fraude', 'outro'
);
create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');
create type public.report_resolution as enum ('upheld', 'no_action');

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  target_type public.report_target_type not null,
  target_id uuid not null, -- sem FK: alvo polimórfico (lista, papelaria ou item de catálogo), mesmo padrão de ai_decisions.entity_id
  reason public.report_reason not null,
  -- código curto, nunca prosa: mesma regra de ai_decisions.justification (0202) — a regex não aceita espaço,
  -- o que bloqueia dado pessoal por construção (não é uma checagem de conteúdo, é uma forma que não cabe prosa).
  detail_code text check (detail_code is null or detail_code ~ '^[a-z][a-z0-9_:.-]{0,59}$'),
  reporter_id uuid not null, -- sem FK (ADR-004, mesmo padrão de ai_decisions.actor_id); a fila sobrevive à remoção do usuário
  status public.report_status not null default 'open',
  resolution public.report_resolution,
  resolution_note text check (resolution_note is null or resolution_note ~ '^[a-z][a-z0-9_:.-]{0,59}$'),
  resolved_by uuid, -- sem FK, mesmo motivo de reporter_id
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_resolution_consistency check (
    (status in ('resolved', 'dismissed')) = (resolution is not null)
    and (resolution is not null) = (resolved_by is not null)
    and (resolution is not null) = (resolved_at is not null)
  )
);
create index reports_status_idx on public.reports (status, created_at);
create index reports_target_idx on public.reports (target_type, target_id);

create trigger reports_set_updated_at before update on public.reports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Transição de estado (mesmo padrão de list_transition_allowed, 0103): sem "resolvido -> aberto" de novo.
-- ---------------------------------------------------------------------------
create function public.report_transition_allowed(p_from public.report_status, p_to public.report_status) returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from (values
      ('open', 'reviewing'), ('open', 'resolved'), ('open', 'dismissed'),
      ('reviewing', 'resolved'), ('reviewing', 'dismissed')
    ) as t (f, t)
    where t.f = p_from::text and t.t = p_to::text
  );
$$;

-- Identidade (target/reason/detail_code/reporter/created_at) imutável; transição de estado só pela matriz acima;
-- resolução (resolution/resolution_note/resolved_by/resolved_at) só muda JUNTO da transição para
-- resolved/dismissed — nunca solta, nunca revertida depois.
create function public.reports_guard() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.target_type is distinct from old.target_type
     or new.target_id is distinct from old.target_id or new.reason is distinct from old.reason
     or new.detail_code is distinct from old.detail_code or new.reporter_id is distinct from old.reporter_id
     or new.created_at is distinct from old.created_at then
    raise exception 'reports: identidade da denúncia é imutável' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if not public.report_transition_allowed(old.status, new.status) then
      raise exception 'transição de denúncia inválida: % -> %', old.status, new.status using errcode = '23514';
    end if;
  elsif new.resolution is distinct from old.resolution or new.resolution_note is distinct from old.resolution_note
     or new.resolved_by is distinct from old.resolved_by or new.resolved_at is distinct from old.resolved_at then
    raise exception 'reports: resolução só muda junto da transição de estado' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger reports_guard_update before update on public.reports
  for each row execute function public.reports_guard();
create trigger reports_audit after insert or update or delete on public.reports
  for each row execute function public.audit_row_change();

-- Guarda e auditoria valem mesmo com session_replication_role = replica (mesmo padrão de audit_log/ai_settings).
alter table public.reports enable always trigger reports_guard_update;
alter table public.reports enable always trigger reports_audit;

revoke execute on function public.report_transition_allowed(public.report_status, public.report_status)
  from public, anon, authenticated, service_role;
revoke execute on function public.reports_guard() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Grants por coluna e RLS
-- ---------------------------------------------------------------------------
revoke all on public.reports from anon, authenticated, service_role;
grant select on public.reports to authenticated, service_role;
-- denunciante: só os campos de identidade da denúncia (status/resolução nascem do default/nulo, nunca vêm do form).
grant insert (target_type, target_id, reason, detail_code, reporter_id) on public.reports to authenticated;
-- admin: só os campos de resolução (o gatilho acima trava o resto, isto é defesa adicional em profundidade).
grant update (status, resolution, resolution_note, resolved_by, resolved_at) on public.reports to authenticated;
grant insert, update on public.reports to service_role;

alter table public.reports enable row level security;

create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (
    reporter_id = auth.uid() and status = 'open' and resolution is null and resolved_by is null and resolved_at is null
  );
-- admin/system leem tudo; o próprio denunciante acompanha a própria denúncia (sem ver as de terceiros).
create policy reports_select_admin_or_own on public.reports
  for select to authenticated
  using ((select public.auth_role()) in ('admin', 'system') or reporter_id = auth.uid());
create policy reports_update_admin on public.reports
  for update to authenticated
  using ((select public.auth_role()) in ('admin', 'system'))
  with check ((select public.auth_role()) in ('admin', 'system'));

comment on table public.reports is 'S16: fila de denúncias (Admin). Motivo e resolução só por código (sem prosa/PII); transição por public.reports_guard.';
