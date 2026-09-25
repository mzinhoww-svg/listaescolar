-- 0104_claims: reivindicação de escola, tokens, evidências e vínculo escola↔administrador (S06, trilha Dados).
-- Regras:
--  * Cadastro INEP não é verificação e reivindicação não é verificação: `claimed` só significa "há pedido em
--    análise". Só a aprovação humana de um admin leva a escola a `verified`. Nada é aprovado automaticamente
--    (token confirmado é evidência, não decisão).
--  * Estado da reivindicação só muda por funções SECURITY DEFINER (EXECUTE só service_role) que aplicam a matriz
--    por ator (`claim_transition_allowed`: claimant, admin, system), travam escola -> reivindicação (nessa ordem),
--    gravam `claim_status_events` (imutável) e sincronizam `schools.verification_status`.
--  * O gatilho `schools_guard_verification` impede que qualquer papel fora do dono das funções (postgres /
--    supabase_admin) ponha ou tire uma escola de `claimed`/`verified`, inclusive admin pelo PostgREST e
--    service_role direto. `suspended` continua livre (S16).
--  * Tokens só existem como hash sha256 (hex); o token em claro nunca chega ao banco. O token vai só ao contato
--    registrado da escola (`schools.email` / `schools.phone` celular BR); `destination` só volta ao service_role.
--  * Evidências ficam no bucket privado `claim-evidence`, sem política em storage.objects para
--    anon/authenticated (upload, leitura e remoção só pelo servidor com service_role).
--  * Nenhuma escrita por anon/authenticated em nenhuma tabela; service_role só lê (escreve pelas funções).
-- FKs só para schools, profiles e tabelas desta migration (ADR-004). Errcodes: 23514 regra/estado, 42501 papel ou
-- dono, 22023 argumento inválido, P0002 não encontrado. Mensagens estáveis (a UI mapeia, nunca exibe).

-- ---------------------------------------------------------------------------
-- Enums (claim_status e claim_method já existem desde a 0001)
-- ---------------------------------------------------------------------------
create type public.claim_actor as enum ('claimant', 'admin', 'system');
create type public.claim_token_channel as enum ('email', 'whatsapp');
create type public.school_member_role as enum ('owner', 'co_admin'); -- co_admin reservado para convites (adiados)

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.claims (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete restrict,
  claimant_id uuid not null references public.profiles (id) on delete restrict,
  method public.claim_method not null,
  status public.claim_status not null default 'submitted',
  claimant_name text not null check (length(btrim(claimant_name)) between 2 and 120),
  claimant_role_title text not null check (length(btrim(claimant_role_title)) between 2 and 80),
  contact_email text not null check (length(btrim(contact_email)) between 3 and 254), -- snapshot do e-mail da sessão
  evidence_note text check (evidence_note is null or length(evidence_note) <= 500),
  privacy_ack_at timestamptz not null,
  privacy_text_version text not null check (length(btrim(privacy_text_version)) between 1 and 40),
  channel_confirmed_at timestamptz, -- token/código confirmado
  submitted_at timestamptz, -- primeira entrada em awaiting_verification
  decided_at timestamptz,
  decided_by uuid, -- sem FK (histórico sobrevive ao perfil)
  decision_reason text check (decision_reason is null or length(btrim(decision_reason)) between 3 and 500),
  decision_code text check (decision_code is null or length(decision_code) <= 60),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint claims_reason_required check (status not in ('rejected', 'insufficient_evidence') or decision_reason is not null),
  constraint claims_approved_decided check (status <> 'approved' or (decided_by is not null and decided_at is not null)),
  constraint claims_channel_only_token_methods check (channel_confirmed_at is null or method in ('institutional_email', 'institutional_whatsapp'))
);

-- Uma reivindicação aberta por escola×usuário; uma aprovada por escola.
create unique index claims_one_open_idx on public.claims (school_id, claimant_id) where status not in ('approved', 'rejected');
create unique index claims_one_approved_idx on public.claims (school_id) where status = 'approved';
create index claims_claimant_idx on public.claims (claimant_id);
create index claims_status_idx on public.claims (status, created_at);

create table public.claim_tokens (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims (id) on delete restrict,
  channel public.claim_token_channel not null,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'), -- nunca o token em claro
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  attempts integer not null default 0 check (attempts between 0 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint claim_tokens_hash_key unique (token_hash)
);
-- No máximo um token ativo (não consumido, não revogado) por reivindicação.
create unique index claim_tokens_one_active_idx on public.claim_tokens (claim_id) where consumed_at is null and revoked_at is null;
create index claim_tokens_claim_idx on public.claim_tokens (claim_id, created_at);

create table public.claim_evidence (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims (id) on delete restrict,
  storage_path text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes integer not null check (size_bytes between 1 and 4000000),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  original_name text not null check (length(btrim(original_name)) between 1 and 120),
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(), -- ordem real dentro da transação (novidade no reenvio)
  updated_at timestamptz not null default now(),
  constraint claim_evidence_path_key unique (storage_path),
  -- `<claim_id>/<uuid>.(pdf|jpg|png)`: pasta é a própria reivindicação; sem `..`.
  constraint claim_evidence_path_format check (
    storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$'
    and split_part(storage_path, '/', 1) = claim_id::text
  ),
  constraint claim_evidence_mime_ext check (
    (mime_type = 'application/pdf' and storage_path like '%.pdf')
    or (mime_type = 'image/jpeg' and storage_path like '%.jpg')
    or (mime_type = 'image/png' and storage_path like '%.png')
  )
);
create index claim_evidence_claim_idx on public.claim_evidence (claim_id, created_at);
create index claim_evidence_uploaded_by_idx on public.claim_evidence (uploaded_by);

-- Trilha imutável. actor_id sem FK: o histórico sobrevive ao perfil.
create table public.claim_status_events (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims (id) on delete restrict,
  from_status public.claim_status, -- nulo na criação
  to_status public.claim_status not null,
  actor_kind public.claim_actor not null,
  actor_id uuid,
  reason text check (reason is null or length(reason) <= 500),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now()
);
create index claim_status_events_claim_idx on public.claim_status_events (claim_id, created_at);

-- Vínculo escola↔administrador (a S05 adiou). Nasce da aprovação.
create table public.school_members (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete restrict,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  member_role public.school_member_role not null default 'owner',
  claim_id uuid references public.claims (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_members_school_profile_key unique (school_id, profile_id),
  constraint school_members_owner_has_claim check (member_role <> 'owner' or claim_id is not null)
);
create unique index school_members_one_owner_idx on public.school_members (school_id) where member_role = 'owner';
create index school_members_profile_idx on public.school_members (profile_id);
create index school_members_claim_idx on public.school_members (claim_id);

-- ---------------------------------------------------------------------------
-- Triggers de manutenção, integridade e auditoria
-- ---------------------------------------------------------------------------
create trigger claims_set_updated_at before update on public.claims for each row execute function public.set_updated_at();
create trigger claim_tokens_set_updated_at before update on public.claim_tokens for each row execute function public.set_updated_at();
create trigger claim_evidence_set_updated_at before update on public.claim_evidence for each row execute function public.set_updated_at();
create trigger claim_status_events_set_updated_at before update on public.claim_status_events for each row execute function public.set_updated_at();
create trigger school_members_set_updated_at before update on public.school_members for each row execute function public.set_updated_at();

-- Eventos são imutáveis (append-only).
create function public.claim_status_events_block_mutation() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'claim_status_events é imutável' using errcode = '23514';
end;
$$;
create trigger claim_status_events_immutable before update or delete on public.claim_status_events
  for each row execute function public.claim_status_events_block_mutation();

-- Identidade da reivindicação nunca muda.
create function public.claims_guard() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.school_id <> old.school_id or new.claimant_id <> old.claimant_id or new.method <> old.method
     or new.privacy_ack_at <> old.privacy_ack_at or new.privacy_text_version <> old.privacy_text_version then
    raise exception 'escola, reivindicante, método e aceite da reivindicação são imutáveis' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger claims_guard before update on public.claims for each row execute function public.claims_guard();

-- Auditoria (imutável): nome, cargo, e-mail, nota, token_hash e nome de arquivo ficam de fora.
create trigger claims_audit after insert or update or delete on public.claims
  for each row execute function public.audit_row_change('claimant_name', 'claimant_role_title', 'contact_email', 'evidence_note');
create trigger claim_evidence_audit after insert or update or delete on public.claim_evidence
  for each row execute function public.audit_row_change('original_name');
create trigger claim_tokens_audit after insert or update or delete on public.claim_tokens
  for each row execute function public.audit_row_change('token_hash');
create trigger school_members_audit after insert or update or delete on public.school_members
  for each row execute function public.audit_row_change();
alter table public.claims enable always trigger claims_audit;
alter table public.claim_evidence enable always trigger claim_evidence_audit;
alter table public.claim_tokens enable always trigger claim_tokens_audit;
alter table public.school_members enable always trigger school_members_audit;

-- Gatilho de schools: pôr ou tirar uma escola de claimed/verified só pelo dono das funções/migrations.
-- SECURITY INVOKER: current_user é o papel do chamador (dentro de uma função SECURITY DEFINER, o dono).
create function public.schools_guard_verification() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.verification_status in ('claimed', 'verified') then
      raise exception 'verification_status % só muda pelas funções de reivindicação', new.verification_status using errcode = '42501';
    end if;
  elsif new.verification_status is distinct from old.verification_status
        and (new.verification_status in ('claimed', 'verified') or old.verification_status in ('claimed', 'verified')) then
    raise exception 'verification_status % -> % só muda pelas funções de reivindicação', old.verification_status, new.verification_status
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger schools_guard_verification before insert or update on public.schools
  for each row execute function public.schools_guard_verification();

revoke execute on function public.claim_status_events_block_mutation() from public, anon, authenticated, service_role;
revoke execute on function public.claims_guard() from public, anon, authenticated, service_role;
revoke execute on function public.schools_guard_verification() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Grants (mínimos). Ninguém escreve pelo PostgREST; service_role só lê (escreve pelas funções).
-- ---------------------------------------------------------------------------
revoke all on public.claims, public.claim_tokens, public.claim_evidence, public.claim_status_events, public.school_members
  from anon, authenticated, service_role;
-- Sem decided_by (identidade de quem decidiu).
grant select (
  id, school_id, claimant_id, method, status, claimant_name, claimant_role_title, contact_email, evidence_note,
  privacy_ack_at, privacy_text_version, channel_confirmed_at, submitted_at, decided_at, decision_reason,
  decision_code, is_demo, created_at, updated_at
) on public.claims to authenticated;
-- Sem actor_id.
grant select (id, claim_id, from_status, to_status, actor_kind, reason, created_at, updated_at)
  on public.claim_status_events to authenticated;
grant select on public.claim_evidence, public.school_members to authenticated;
-- claim_tokens: nenhum grant a anon/authenticated.
grant select on public.claims, public.claim_tokens, public.claim_evidence, public.claim_status_events, public.school_members
  to service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.claims enable row level security;
alter table public.claim_tokens enable row level security;
alter table public.claim_evidence enable row level security;
alter table public.claim_status_events enable row level security;
alter table public.school_members enable row level security;

-- claims: o reivindicante lê as próprias.
create policy claims_select_own on public.claims
  for select to authenticated using (claimant_id = (select auth.uid()));
-- claims: admin e system leem todas.
create policy claims_select_admin on public.claims
  for select to authenticated using ((select public.auth_role()) in ('admin', 'system'));

-- claim_status_events: o reivindicante lê os eventos das próprias reivindicações.
create policy claim_status_events_select_own on public.claim_status_events
  for select to authenticated
  using (exists (select 1 from public.claims c where c.id = claim_id and c.claimant_id = (select auth.uid())));
-- claim_status_events: admin e system leem todos.
create policy claim_status_events_select_admin on public.claim_status_events
  for select to authenticated using ((select public.auth_role()) in ('admin', 'system'));

-- claim_evidence: o reivindicante lê os metadados das próprias evidências.
create policy claim_evidence_select_own on public.claim_evidence
  for select to authenticated
  using (exists (select 1 from public.claims c where c.id = claim_id and c.claimant_id = (select auth.uid())));
-- claim_evidence: admin e system leem todas.
create policy claim_evidence_select_admin on public.claim_evidence
  for select to authenticated using ((select public.auth_role()) in ('admin', 'system'));

-- claim_tokens: sem política (nenhum papel de sessão lê); só service_role.

-- school_members: cada membro lê o próprio vínculo (quem administra não é público).
create policy school_members_select_own on public.school_members
  for select to authenticated using (profile_id = (select auth.uid()));
-- school_members: admin e system leem todos.
create policy school_members_select_admin on public.school_members
  for select to authenticated using ((select public.auth_role()) in ('admin', 'system'));

-- ---------------------------------------------------------------------------
-- Storage: bucket privado. Sem política em storage.objects para anon/authenticated.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('claim-evidence', 'claim-evidence', false, 4000000, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Matriz de transições por ator (espelha features/claims/state.ts; um teste compara as 108 triplas)
-- ---------------------------------------------------------------------------
create function public.claim_transition_allowed(p_from public.claim_status, p_to public.claim_status, p_actor public.claim_actor)
returns boolean
language sql immutable set search_path = ''
as $$
  select exists (
    select 1 from (values
      ('claimant', 'submitted', 'awaiting_verification'),
      ('claimant', 'token_expired', 'awaiting_verification'),
      ('claimant', 'insufficient_evidence', 'awaiting_verification'),
      ('admin', 'awaiting_verification', 'approved'),
      ('admin', 'awaiting_verification', 'insufficient_evidence'),
      ('admin', 'submitted', 'rejected'),
      ('admin', 'awaiting_verification', 'rejected'),
      ('admin', 'insufficient_evidence', 'rejected'),
      ('admin', 'token_expired', 'rejected'),
      ('system', 'awaiting_verification', 'token_expired'),
      ('system', 'submitted', 'rejected'),
      ('system', 'awaiting_verification', 'rejected'),
      ('system', 'insufficient_evidence', 'rejected'),
      ('system', 'token_expired', 'rejected')
    ) as t (a, f, t)
    where t.a = p_actor::text and t.f = p_from::text and t.t = p_to::text
  );
$$;

-- ---------------------------------------------------------------------------
-- Funções internas (sem EXECUTE para ninguém; chamadas só por funções SECURITY DEFINER)
-- ---------------------------------------------------------------------------

-- Celular BR normalizado (55 + DDD + 9 + 8 dígitos) ou nulo. Aceita 55 na frente; fixo não passa.
create function public.claim_school_mobile(p_phone text) returns text
language sql immutable set search_path = ''
as $$
  select case
    when regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') ~ '^(55)?[1-9][0-9]9[0-9]{8}$'
      then '55' || right(regexp_replace(p_phone, '[^0-9]', '', 'g'), 11)
  end;
$$;

-- Trava escola e depois a reivindicação (sempre nessa ordem) e devolve a linha atual.
create function public.claim_lock(p_claim_id uuid) returns public.claims
language plpgsql security definer set search_path = ''
as $$
declare
  v_school uuid;
  v_row public.claims;
begin
  select c.school_id into v_school from public.claims c where c.id = p_claim_id;
  if not found then
    raise exception 'reivindicação não encontrada' using errcode = 'P0002';
  end if;
  perform 1 from public.schools s where s.id = v_school for no key update;
  select * into v_row from public.claims c where c.id = p_claim_id for no key update;
  return v_row;
end;
$$;

-- Sincroniza registered <-> claimed pela existência de reivindicação em análise (escola já travada).
create function public.claim_sync_school(p_school_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_status public.verification_status;
  v_target public.verification_status;
begin
  select s.verification_status into v_status from public.schools s where s.id = p_school_id;
  if v_status not in ('registered', 'claimed') then
    return;
  end if;
  v_target := case when exists (
    select 1 from public.claims c
     where c.school_id = p_school_id and c.status in ('awaiting_verification', 'insufficient_evidence', 'token_expired')
  ) then 'claimed' else 'registered' end;
  if v_target <> v_status then
    update public.schools set verification_status = v_target where id = p_school_id;
  end if;
end;
$$;

-- Aplica uma transição (reivindicação já travada): confere a matriz, atualiza a linha e grava o evento.
create function public.claim_apply(
  p_claim_id uuid, p_to public.claim_status, p_actor public.claim_actor, p_actor_id uuid,
  p_reason text default null, p_code text default null
) returns public.claim_status
language plpgsql security definer set search_path = ''
as $$
declare
  v_from public.claim_status;
  v_decision boolean := p_to in ('approved', 'rejected', 'insufficient_evidence');
begin
  select c.status into v_from from public.claims c where c.id = p_claim_id;
  if not public.claim_transition_allowed(v_from, p_to, p_actor) then
    raise exception 'transição de reivindicação inválida: % -> % (%)', v_from, p_to, p_actor using errcode = '23514';
  end if;
  update public.claims c
     set status = p_to,
         submitted_at = case when p_to = 'awaiting_verification' then coalesce(c.submitted_at, clock_timestamp()) else c.submitted_at end,
         decided_at = case when v_decision then clock_timestamp() else c.decided_at end,
         decided_by = case when v_decision then case when p_actor = 'admin' then p_actor_id end else c.decided_by end,
         decision_reason = case when p_to in ('rejected', 'insufficient_evidence') then p_reason else c.decision_reason end,
         decision_code = case when p_to in ('rejected', 'insufficient_evidence') then p_code else c.decision_code end
   where c.id = p_claim_id;
  insert into public.claim_status_events (claim_id, from_status, to_status, actor_kind, actor_id, reason)
  values (p_claim_id, v_from, p_to, p_actor, p_actor_id, p_reason);
  return v_from;
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_create
-- ---------------------------------------------------------------------------
create function public.claim_create(
  p_school_id uuid, p_claimant_id uuid, p_method public.claim_method, p_claimant_name text,
  p_claimant_role_title text, p_contact_email text, p_evidence_note text, p_privacy_text_version text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_role public.user_role;
  v_school public.schools%rowtype;
  v_enabled boolean;
  v_id uuid;
  v_note text := nullif(btrim(coalesce(p_evidence_note, '')), '');
begin
  select p.role into v_role from public.profiles p where p.id = p_claimant_id;
  if v_role is null or v_role not in ('parent', 'school_member') then
    raise exception 'papel não pode reivindicar escola' using errcode = '42501';
  end if;
  -- serializa o limite de abertas do mesmo usuário (a escola é travada depois; approve não usa este lock).
  perform pg_advisory_xact_lock(hashtextextended('claim_create:' || p_claimant_id::text, 0));
  select * into v_school from public.schools s where s.id = p_school_id for no key update;
  if not found then
    raise exception 'escola não encontrada' using errcode = 'P0002';
  end if;
  select m.is_enabled into v_enabled from public.municipalities m where m.id = v_school.municipality_id;
  if not coalesce(v_enabled, false) then
    raise exception 'município não habilitado' using errcode = '23514';
  end if;
  if v_school.verification_status = 'verified' then
    raise exception 'escola verificada não aceita reivindicação' using errcode = '23514';
  end if;
  if v_school.verification_status = 'suspended' then
    raise exception 'escola suspensa não aceita reivindicação' using errcode = '23514';
  end if;
  if p_method = 'institutional_email' and nullif(btrim(coalesce(v_school.email, '')), '') is null then
    raise exception 'método indisponível: escola sem e-mail registrado' using errcode = '23514';
  end if;
  if p_method = 'institutional_whatsapp' and public.claim_school_mobile(v_school.phone) is null then
    raise exception 'método indisponível: escola sem celular registrado' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.claims c
     where c.school_id = p_school_id and c.claimant_id = p_claimant_id and c.status not in ('approved', 'rejected')
  ) then
    raise exception 'já existe reivindicação aberta para esta escola' using errcode = '23514';
  end if;
  if (select count(*) from public.claims c where c.claimant_id = p_claimant_id and c.status not in ('approved', 'rejected')) >= 3 then
    raise exception 'limite de 3 reivindicações abertas' using errcode = '23514';
  end if;

  insert into public.claims (
    school_id, claimant_id, method, claimant_name, claimant_role_title, contact_email, evidence_note,
    privacy_ack_at, privacy_text_version, is_demo
  ) values (
    p_school_id, p_claimant_id, p_method, p_claimant_name, p_claimant_role_title, p_contact_email, v_note,
    now(), p_privacy_text_version, v_school.is_demo
  ) returning id into v_id;
  insert into public.claim_status_events (claim_id, from_status, to_status, actor_kind, actor_id)
  values (v_id, null, 'submitted', 'claimant', p_claimant_id);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Evidências (só o reivindicante; submitted no método documentos ou insufficient_evidence em qualquer método)
-- ---------------------------------------------------------------------------
create function public.claim_add_evidence(
  p_claim_id uuid, p_actor_id uuid, p_storage_path text, p_mime_type text, p_size_bytes integer,
  p_sha256 text, p_original_name text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_claim public.claims;
  v_id uuid;
begin
  v_claim := public.claim_lock(p_claim_id);
  if v_claim.claimant_id is distinct from p_actor_id then
    raise exception 'só o reivindicante envia evidências' using errcode = '42501';
  end if;
  if not ((v_claim.status = 'submitted' and v_claim.method = 'documents') or v_claim.status = 'insufficient_evidence') then
    raise exception 'reivindicação não aceita evidências neste estado' using errcode = '23514';
  end if;
  if p_storage_path is null or p_storage_path like '%..%' or p_storage_path not like p_claim_id::text || '/%' then
    raise exception 'caminho de evidência inválido' using errcode = '22023';
  end if;
  if (select count(*) from public.claim_evidence e where e.claim_id = p_claim_id) >= 5 then
    raise exception 'limite de 5 evidências' using errcode = '23514';
  end if;
  insert into public.claim_evidence (claim_id, storage_path, mime_type, size_bytes, sha256, original_name, uploaded_by)
  values (p_claim_id, p_storage_path, p_mime_type, p_size_bytes, p_sha256, p_original_name, p_actor_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- Remove a linha e devolve o storage_path para o servidor apagar o objeto.
create function public.claim_remove_evidence(p_evidence_id uuid, p_actor_id uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_claim_id uuid;
  v_claim public.claims;
  v_path text;
begin
  select e.claim_id into v_claim_id from public.claim_evidence e where e.id = p_evidence_id;
  if not found then
    raise exception 'evidência não encontrada' using errcode = 'P0002';
  end if;
  v_claim := public.claim_lock(v_claim_id);
  if v_claim.claimant_id is distinct from p_actor_id then
    raise exception 'só o reivindicante remove evidências' using errcode = '42501';
  end if;
  if not ((v_claim.status = 'submitted' and v_claim.method = 'documents') or v_claim.status = 'insufficient_evidence') then
    raise exception 'reivindicação não aceita remoção de evidências neste estado' using errcode = '23514';
  end if;
  delete from public.claim_evidence e where e.id = p_evidence_id returning e.storage_path into v_path;
  if v_path is null then
    raise exception 'evidência não encontrada' using errcode = 'P0002';
  end if;
  return v_path;
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_submit_for_review: submitted|insufficient_evidence -> awaiting_verification (só o reivindicante).
-- p_evidence_note (opcional) atualiza a nota escrita no reenvio e conta como novidade.
-- ---------------------------------------------------------------------------
create function public.claim_submit_for_review(p_claim_id uuid, p_actor_id uuid, p_evidence_note text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_claim public.claims;
  v_note text := nullif(btrim(coalesce(p_evidence_note, '')), '');
  v_new_note boolean;
begin
  v_claim := public.claim_lock(p_claim_id);
  if v_claim.claimant_id is distinct from p_actor_id then
    raise exception 'só o reivindicante envia para análise' using errcode = '42501';
  end if;
  if not public.claim_transition_allowed(v_claim.status, 'awaiting_verification', 'claimant') then
    raise exception 'transição de reivindicação inválida: % -> awaiting_verification (claimant)', v_claim.status using errcode = '23514';
  end if;
  if v_claim.status = 'token_expired' then
    raise exception 'token vencido: emita um novo token' using errcode = '23514';
  end if;
  if v_claim.status = 'submitted' then
    if v_claim.method <> 'documents' then
      raise exception 'método por token: use claim_issue_token' using errcode = '23514';
    end if;
    if not exists (select 1 from public.claim_evidence e where e.claim_id = p_claim_id) then
      raise exception 'envie ao menos uma evidência' using errcode = '23514';
    end if;
  else -- insufficient_evidence: exige novidade depois da decisão
    v_new_note := v_note is not null and v_note is distinct from v_claim.evidence_note;
    if not v_new_note and not exists (
      select 1 from public.claim_evidence e where e.claim_id = p_claim_id and e.created_at > v_claim.decided_at
    ) then
      raise exception 'reenvio exige evidência nova ou nota alterada' using errcode = '23514';
    end if;
    if v_claim.method = 'documents' and not exists (select 1 from public.claim_evidence e where e.claim_id = p_claim_id) then
      raise exception 'envie ao menos uma evidência' using errcode = '23514';
    end if;
    if v_new_note then
      update public.claims set evidence_note = v_note where id = p_claim_id;
    end if;
  end if;
  perform public.claim_apply(p_claim_id, 'awaiting_verification', 'claimant', p_actor_id);
  perform public.claim_sync_school(v_claim.school_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Tokens
-- ---------------------------------------------------------------------------
create function public.claim_issue_token(p_claim_id uuid, p_actor_id uuid, p_token_hash text)
returns table (token_id uuid, expires_at timestamptz, channel public.claim_token_channel, destination text)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_claim public.claims;
  v_school public.schools%rowtype;
  v_channel public.claim_token_channel;
  v_dest text;
  v_expires timestamptz;
  v_id uuid;
begin
  v_claim := public.claim_lock(p_claim_id);
  if v_claim.claimant_id is distinct from p_actor_id then
    raise exception 'só o reivindicante pede token' using errcode = '42501';
  end if;
  if v_claim.method = 'documents' then
    raise exception 'método documentos não usa token' using errcode = '23514';
  end if;
  if v_claim.status not in ('submitted', 'awaiting_verification', 'token_expired') then
    raise exception 'reivindicação não aceita token neste estado' using errcode = '23514';
  end if;
  if v_claim.channel_confirmed_at is not null then
    raise exception 'canal já confirmado' using errcode = '23514';
  end if;
  select * into v_school from public.schools s where s.id = v_claim.school_id;
  if v_claim.method = 'institutional_email' then
    v_channel := 'email';
    v_dest := nullif(btrim(coalesce(v_school.email, '')), '');
    v_expires := now() + interval '24 hours';
  else
    v_channel := 'whatsapp';
    v_dest := public.claim_school_mobile(v_school.phone);
    v_expires := now() + interval '15 minutes';
  end if;
  if v_dest is null then
    raise exception 'método indisponível: escola sem contato registrado' using errcode = '23514';
  end if;
  if exists (select 1 from public.claim_tokens t where t.claim_id = p_claim_id and t.created_at > now() - interval '60 seconds') then
    raise exception 'aguarde 60 segundos para pedir outro token' using errcode = '23514';
  end if;
  if (select count(*) from public.claim_tokens t where t.claim_id = p_claim_id and t.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'limite de 5 tokens em 24 horas' using errcode = '23514';
  end if;

  update public.claim_tokens t set revoked_at = now()
   where t.claim_id = p_claim_id and t.consumed_at is null and t.revoked_at is null;
  insert into public.claim_tokens (claim_id, channel, token_hash, expires_at)
  values (p_claim_id, v_channel, p_token_hash, v_expires)
  returning id into v_id;

  if v_claim.status in ('submitted', 'token_expired') then
    perform public.claim_apply(p_claim_id, 'awaiting_verification', 'claimant', p_actor_id);
  end if;
  perform public.claim_sync_school(v_claim.school_id);
  return query select v_id, v_expires, v_channel, v_dest;
end;
$$;

-- Resultado estável: confirmed | expired | invalid | locked | already_confirmed. Nunca levanta erro por token
-- errado (a tentativa errada precisa persistir). Ator diferente do reivindicante = invalid (não revela existência).
create function public.claim_confirm_token(p_token_hash text, p_actor_id uuid, p_claim_id uuid default null)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_claim_id uuid := p_claim_id;
  v_claim public.claims;
  v_tok public.claim_tokens;
begin
  if p_actor_id is null or p_token_hash is null then
    raise exception 'ator e token obrigatórios' using errcode = '22023';
  end if;
  if v_claim_id is null then
    select t.claim_id into v_claim_id from public.claim_tokens t where t.token_hash = p_token_hash and t.channel = 'email';
    if v_claim_id is null then return 'invalid'; end if;
  end if;
  if not exists (select 1 from public.claims c where c.id = v_claim_id) then return 'invalid'; end if;
  v_claim := public.claim_lock(v_claim_id);
  if v_claim.claimant_id <> p_actor_id or v_claim.method = 'documents' then return 'invalid'; end if;

  if v_claim.method = 'institutional_email' then
    select * into v_tok from public.claim_tokens t
     where t.claim_id = v_claim_id and t.channel = 'email' and t.token_hash = p_token_hash for update;
  else
    if p_claim_id is null then
      raise exception 'WhatsApp exige p_claim_id' using errcode = '22023';
    end if;
    select * into v_tok from public.claim_tokens t
     where t.claim_id = v_claim_id and t.channel = 'whatsapp' order by t.created_at desc, t.id limit 1 for update;
  end if;
  if v_tok.id is null then return 'invalid'; end if;
  if v_tok.consumed_at is not null then return 'already_confirmed'; end if;
  if v_claim.status not in ('awaiting_verification', 'insufficient_evidence', 'token_expired') then return 'invalid'; end if;
  if v_tok.revoked_at is not null then
    return case when v_tok.attempts >= 5 then 'locked' else 'invalid' end;
  end if;
  if v_tok.expires_at <= now() then
    if v_claim.status = 'awaiting_verification' and v_claim.channel_confirmed_at is null then
      perform public.claim_apply(v_claim_id, 'token_expired', 'system', null);
      perform public.claim_sync_school(v_claim.school_id);
    end if;
    return 'expired';
  end if;
  if v_claim.status = 'token_expired' then return 'expired'; end if;
  if v_claim.method = 'institutional_whatsapp' and v_tok.token_hash <> p_token_hash then
    update public.claim_tokens t
       set attempts = t.attempts + 1,
           revoked_at = case when t.attempts + 1 >= 5 then now() end
     where t.id = v_tok.id;
    return case when v_tok.attempts + 1 >= 5 then 'locked' else 'invalid' end;
  end if;
  update public.claim_tokens t set consumed_at = now() where t.id = v_tok.id;
  update public.claims c set channel_confirmed_at = coalesce(c.channel_confirmed_at, now()) where c.id = v_claim_id;
  return 'confirmed';
end;
$$;

-- Expiração preguiçosa e idempotente: awaiting_verification por token, sem canal confirmado e com o último token
-- vencido -> token_expired (system). Devolve quantas mudou.
create function public.claim_expire_tokens(p_claim_id uuid default null) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_claim public.claims;
  v_n integer := 0;
begin
  for v_id in
    select c.id from public.claims c
     where (p_claim_id is null or c.id = p_claim_id)
       and c.status = 'awaiting_verification' and c.method in ('institutional_email', 'institutional_whatsapp')
       and c.channel_confirmed_at is null
     order by c.id
  loop
    v_claim := public.claim_lock(v_id);
    if v_claim.status = 'awaiting_verification' and v_claim.channel_confirmed_at is null
       and (select t.expires_at from public.claim_tokens t where t.claim_id = v_id order by t.created_at desc, t.id limit 1) <= now() then
      perform public.claim_apply(v_id, 'token_expired', 'system', null);
      perform public.claim_sync_school(v_claim.school_id);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_decide: decisão humana (admin). Aprovar cria o vínculo, verifica a escola e recusa as demais abertas.
-- ---------------------------------------------------------------------------
create function public.claim_decide(p_claim_id uuid, p_to public.claim_status, p_actor_id uuid, p_reason text)
returns public.claim_status
language plpgsql security definer set search_path = ''
as $$
declare
  v_claim public.claims;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_school_status public.verification_status;
  v_role public.user_role;
  v_other uuid;
begin
  if p_to not in ('approved', 'insufficient_evidence', 'rejected') then
    raise exception 'decisão inválida: %', p_to using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_actor_id and p.role = 'admin') then
    raise exception 'só admin decide reivindicações' using errcode = '42501';
  end if;
  if p_to <> 'approved' and (v_reason is null or length(v_reason) < 3 or length(v_reason) > 500) then
    raise exception 'motivo de 3 a 500 caracteres é obrigatório' using errcode = '22023';
  end if;

  v_claim := public.claim_lock(p_claim_id);
  if not public.claim_transition_allowed(v_claim.status, p_to, 'admin') then
    raise exception 'transição de reivindicação inválida: % -> % (admin)', v_claim.status, p_to using errcode = '23514';
  end if;

  if p_to <> 'approved' then
    perform public.claim_apply(p_claim_id, p_to, 'admin', p_actor_id, v_reason);
    perform public.claim_sync_school(v_claim.school_id);
    return p_to;
  end if;

  if v_claim.method <> 'documents' and v_claim.channel_confirmed_at is null then
    raise exception 'aprovar exige canal confirmado' using errcode = '23514';
  end if;
  if v_claim.method = 'documents' and not exists (select 1 from public.claim_evidence e where e.claim_id = p_claim_id) then
    raise exception 'aprovar exige ao menos uma evidência' using errcode = '23514';
  end if;
  select s.verification_status into v_school_status from public.schools s where s.id = v_claim.school_id;
  if v_school_status in ('verified', 'suspended') then
    raise exception 'escola % não aceita aprovação', v_school_status using errcode = '23514';
  end if;
  select p.role into v_role from public.profiles p where p.id = v_claim.claimant_id for update;
  if v_role not in ('parent', 'school_member') then
    raise exception 'papel do reivindicante não pode ser promovido' using errcode = '23514';
  end if;

  perform public.claim_apply(p_claim_id, 'approved', 'admin', p_actor_id, v_reason);
  update public.schools set verification_status = 'verified' where id = v_claim.school_id;
  insert into public.school_members (school_id, profile_id, member_role, claim_id)
  values (v_claim.school_id, v_claim.claimant_id, 'owner', p_claim_id);
  if v_role = 'parent' then
    update public.profiles set role = 'school_member' where id = v_claim.claimant_id;
  end if;

  for v_other in
    select c.id from public.claims c
     where c.school_id = v_claim.school_id and c.id <> p_claim_id and c.status not in ('approved', 'rejected')
     order by c.id for no key update
  loop
    perform public.claim_apply(v_other, 'rejected', 'system', null,
      'Outra reivindicação desta escola foi aprovada', 'school_verified_by_other_claim');
    update public.claim_tokens t set revoked_at = now()
     where t.claim_id = v_other and t.consumed_at is null and t.revoked_at is null;
  end loop;
  return p_to;
end;
$$;

-- ---------------------------------------------------------------------------
-- EXECUTE: internas e de gatilho para ninguém; funções públicas da fatia só para service_role.
-- ---------------------------------------------------------------------------
revoke execute on function public.claim_school_mobile(text) from public, anon, authenticated, service_role;
revoke execute on function public.claim_lock(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.claim_sync_school(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.claim_apply(uuid, public.claim_status, public.claim_actor, uuid, text, text) from public, anon, authenticated, service_role;

revoke execute on function public.claim_transition_allowed(public.claim_status, public.claim_status, public.claim_actor) from public, anon, authenticated, service_role;
revoke execute on function public.claim_create(uuid, uuid, public.claim_method, text, text, text, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.claim_add_evidence(uuid, uuid, text, text, integer, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.claim_remove_evidence(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.claim_submit_for_review(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.claim_issue_token(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.claim_confirm_token(text, uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.claim_expire_tokens(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.claim_decide(uuid, public.claim_status, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.claim_transition_allowed(public.claim_status, public.claim_status, public.claim_actor) to service_role;
grant execute on function public.claim_create(uuid, uuid, public.claim_method, text, text, text, text, text) to service_role;
grant execute on function public.claim_add_evidence(uuid, uuid, text, text, integer, text, text) to service_role;
grant execute on function public.claim_remove_evidence(uuid, uuid) to service_role;
grant execute on function public.claim_submit_for_review(uuid, uuid, text) to service_role;
grant execute on function public.claim_issue_token(uuid, uuid, text) to service_role;
grant execute on function public.claim_confirm_token(text, uuid, uuid) to service_role;
grant execute on function public.claim_expire_tokens(uuid) to service_role;
grant execute on function public.claim_decide(uuid, public.claim_status, uuid, text) to service_role;
