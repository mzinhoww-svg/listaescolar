-- 0604_admin_reports: denúncias (S16, Admin). Fila de denúncia sobre lista publicada, papelaria ou item de
-- catálogo, com motivo por código (nunca prosa/dado pessoal) e resolução do admin. O dashboard (Admin01-Visao) e
-- a auditoria filtrável (Admin08-Eventos) NÃO precisam de função nova: `schools`, `school_lists`, `claims`,
-- `stationeries`, `leads` e `audit_log` já têm política `..._select_admin` desde S01–S14 (RLS por
-- `auth_role() in ('admin','system')`), lida pelo client de sessão. Arquivar lista reaproveita
-- `public.list_archive` (0103, S05), já existente e sem uso em nenhuma UI ainda. Nenhuma função desta migration
-- lê `public.students` (mínimo de dado de menor).
-- Idempotente sob `supabase db reset` (banco recriado do zero).
--
-- Revisão de segurança (rodada única, sem bloqueantes; editado no lugar por ainda não ter ido ao staging — ver
-- `docs/superpowers/ledger.md`, seção "S16 · correções da revisão de segurança"):
--  * `target_type` só aceita `school_list` por enquanto (CHECK + gatilho); os outros dois valores do enum ficam
--    reservados para quando existir UI e Ruling para eles (D-150).
--  * gatilho `reports_check_before_insert`: teto diário por denunciante (`reports_max_per_day()`, configurável
--    sem tocar no gatilho) e o alvo precisa existir e (para `school_list`) estar `published`.
--  * índice único parcial: nunca duas denúncias `open`/`reviewing` do MESMO denunciante para o MESMO alvo.
--  * `reports_guard` passa a FORÇAR `resolved_by := auth.uid()` na transição para `resolved`/`dismissed` — nunca
--    confia no valor que o cliente mandar na coluna (a coluna continua gravável por grant, é defesa em
--    profundidade real, não decorativa).
--  * `resolved_by` deixa de ser legível por `authenticated` (nem o próprio denunciante, nem o admin pela sessão):
--    quem resolveu já fica no `audit_log` (gatilho `reports_audit`), que é onde presta contas.
--  * `ai_settings`: revoga `UPDATE` de `auto_publish_enabled`/`routes` de `authenticated` — o Zod da S16 já não
--    aceitava os dois campos, mas o grant de tabela da 0202 permitia gravá-los direto via PostgREST; só liga
--    `auto_publish_enabled` com Ruling humano explícito, nunca por edição comum.
--  * `lead_reviews_audit`/`lead_disputes_audit` (0402, já no staging) recriados aqui (aditivo, sem tocar no
--    arquivo aplicado) excluindo `comment`/`detail` do `audit_row_change` — o mesmo padrão que a 0402 já usa para
--    `claimant_name`/`evidence_note` etc., só que esses dois escaparam na S22.

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
  ),
  -- revisão de segurança: só `school_list` por enquanto (D-150) — CHECK além do gatilho, defesa em profundidade.
  constraint reports_target_type_scope check (target_type = 'school_list')
);
create index reports_status_idx on public.reports (status, created_at);
create index reports_target_idx on public.reports (target_type, target_id);
-- revisão de segurança: nunca duas denúncias em aberto/em análise do MESMO denunciante para o MESMO alvo.
create unique index reports_no_duplicate_open on public.reports (reporter_id, target_type, target_id)
  where status in ('open', 'reviewing');

create trigger reports_set_updated_at before update on public.reports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Teto diário por denunciante: função própria (valor "em configuração", troca sem tocar no gatilho) e validação
-- de alvo no BEFORE INSERT (revisão de segurança).
-- ---------------------------------------------------------------------------
create function public.reports_max_per_day() returns integer
language sql
immutable
set search_path = ''
as $$
  select 10;
$$;

create function public.reports_check_before_insert() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  select count(*) into v_count from public.reports
   where reporter_id = new.reporter_id and created_at >= (now() - interval '1 day');
  if v_count >= public.reports_max_per_day() then
    raise exception 'limite diário de denúncias atingido' using errcode = '42501', hint = 'daily_limit';
  end if;

  if new.target_type = 'school_list' then
    if not exists (select 1 from public.school_lists where id = new.target_id and status = 'published') then
      raise exception 'lista não encontrada ou não publicada' using errcode = 'P0002', hint = 'target_not_found';
    end if;
  else
    -- inalcançável hoje pelo CHECK reports_target_type_scope; mensagem amigável se algum dia o CHECK mudar antes
    -- deste gatilho (o gatilho roda primeiro: BEFORE trigger antes das constraints).
    raise exception 'tipo de denúncia não habilitado' using errcode = '22023', hint = 'target_type_not_allowed';
  end if;
  return new;
end;
$$;

create trigger reports_check_before_insert before insert on public.reports
  for each row execute function public.reports_check_before_insert();
alter table public.reports enable always trigger reports_check_before_insert;

revoke execute on function public.reports_max_per_day() from public, anon, authenticated, service_role;
revoke execute on function public.reports_check_before_insert() from public, anon, authenticated, service_role;

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
    -- revisão de segurança: `resolved_by` nunca vem do valor que o cliente mandou (a coluna é gravável por
    -- grant); quem resolveu é sempre quem está autenticado agora, não um id arbitrário passado no UPDATE.
    if new.status in ('resolved', 'dismissed') then
      new.resolved_by := auth.uid();
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
-- revisão de segurança: um GRANT de tabela cobre a coluna independente de qualquer REVOKE de coluna feito depois
-- (a ACL de coluna só reduz o que NÃO está coberto por um grant de tabela — achado desta rodada, confirmado
-- contra o Postgres local: `revoke select (col) ...` depois de um `grant select on tabela ...` não muda nada).
-- Por isso `resolved_by` fica de fora da lista de colunas concedida a `authenticated` desde o início, em vez de
-- conceder tudo e tentar revogar depois; quem resolveu já fica no `audit_log` (gatilho `reports_audit`).
grant select (
  id, target_type, target_id, reason, detail_code, reporter_id, status, resolution, resolution_note,
  resolved_at, created_at, updated_at
) on public.reports to authenticated;
grant select on public.reports to service_role;
-- denunciante: só os campos de identidade da denúncia (status/resolução nascem do default/nulo, nunca vêm do form).
grant insert (target_type, target_id, reason, detail_code, reporter_id) on public.reports to authenticated;
-- admin: só os campos de resolução (o gatilho acima trava o resto, isto é defesa adicional em profundidade;
-- resolved_by continua gravável — precisa estar no SET da atualização — mas reports_guard sobrescreve o valor).
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

-- ---------------------------------------------------------------------------
-- Revisão de segurança — ai_settings (0202, S08, já no staging): o Zod da S16 já não aceitava
-- `auto_publish_enabled`/`routes` no formulário, mas o GRANT de tabela da 0202 (`grant ... update on ai_settings
-- to authenticated`) continua permitindo gravar as duas colunas direto via PostgREST, sem passar pela Server
-- Action. `revoke update (auto_publish_enabled, routes) on ai_settings from authenticated` NÃO funciona aqui:
-- um REVOKE de coluna não reduz nada que já esteja coberto por um GRANT de TABELA (achado desta rodada, mesmo
-- caso de `reports.resolved_by` acima) — e o grant de tabela da 0202 já está aplicado no staging, fora de
-- alcance para editar. Gatilho, não grant: só liga `auto_publish_enabled` com Ruling humano explícito (fora
-- desta tela); `routes` fica para uma fatia com tempo de cobrir o formulário (D-152). `service_role` (o pipeline
-- de IA, S08/S09) continua podendo gravar as duas.
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER (não definer, ao contrário de reports_guard): current_user precisa refletir quem chamou, não
-- o dono da função — mesmo padrão de public.profiles_guard_role (0001) para o mesmo tipo de bypass de superusuário/
-- migration. Com security definer, current_user seria sempre o dono da função (ex.: postgres), e o bypass abaixo
-- ficaria sempre verdadeiro para qualquer chamador — achado desta rodada, ao testar contra o pipeline real
-- (tests/db/extraction-real-pipeline.test.ts, que escreve `routes` como dono via `reset role`).
create function public.ai_settings_lock_sensitive_fields() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'supabase_admin') or (select public.auth_role()) = 'system' then
    return new;
  end if;
  if new.auto_publish_enabled is distinct from old.auto_publish_enabled then
    raise exception 'auto_publish_enabled só muda por decisão humana explícita (Ruling), fora desta tela' using errcode = '42501', hint = 'auto_publish_locked';
  end if;
  if new.routes is distinct from old.routes then
    raise exception 'routes ainda não tem tela de edição' using errcode = '42501', hint = 'routes_locked';
  end if;
  return new;
end;
$$;

create trigger ai_settings_lock_sensitive_fields before update on public.ai_settings
  for each row execute function public.ai_settings_lock_sensitive_fields();
alter table public.ai_settings enable always trigger ai_settings_lock_sensitive_fields;
revoke execute on function public.ai_settings_lock_sensitive_fields() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Revisão de segurança — lead_reviews/lead_disputes (0402, S22, já no staging): os gatilhos de auditoria
-- originais gravavam `comment`/`detail` (texto livre do usuário, pode conter dado pessoal) no `audit_log`
-- imutável — o mesmo padrão que a 0402 já aplica em `claims`/`stationeries` (`claimant_name`, `evidence_note`
-- etc.) escapou dessas duas colunas. Recriados aqui (aditivo: DROP + CREATE do gatilho, sem tocar no arquivo já
-- aplicado no staging) excluindo as duas do `audit_row_change`.
-- ---------------------------------------------------------------------------
drop trigger if exists lead_reviews_audit on public.lead_reviews;
create trigger lead_reviews_audit after insert or update on public.lead_reviews
  for each row execute function public.audit_row_change('comment');
alter table public.lead_reviews enable always trigger lead_reviews_audit;

drop trigger if exists lead_disputes_audit on public.lead_disputes;
create trigger lead_disputes_audit after insert or update on public.lead_disputes
  for each row execute function public.audit_row_change('detail');
alter table public.lead_disputes enable always trigger lead_disputes_audit;
