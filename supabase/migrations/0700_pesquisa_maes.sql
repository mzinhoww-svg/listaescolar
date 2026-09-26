-- Pesquisa com mães (ADR-005, fora do PLAN S00-S27).
-- Escopo isolado: sem FK para o restante do schema, sem policy de RLS para
-- anon/authenticated (só service_role acessa, via lib/supabase/admin.ts).
-- Migration só aditiva. survey_responses e survey_leads guardam respostas
-- reais e nunca podem ser truncadas/recriadas por reset de staging ou por
-- outra fatia (ADR-005); a única limpeza permitida é DELETE filtrado por
-- source_group = 'e2e-teste'.
-- Colunas seguem a spec (docs/superpowers/specs/2026-09-25-pesquisa-maes-design.md
-- secao 5.1) literalmente: survey_responses usa started_at/updated_at (sem
-- created_at) e survey_leads usa created_at (sem updated_at) -- a spec e
-- vinculante e explicita nessas colunas.

create table public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique,
  survey_version text not null default 'maes-2026-09',
  answers jsonb not null default '{}'::jsonb,
  last_step smallint not null default 0 check (last_step between 0 and 12),
  source_group text check (char_length(source_group) <= 60),
  ref_session_id uuid,
  ip_hash text,
  user_agent text check (char_length(user_agent) <= 300),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index survey_responses_source_idx on public.survey_responses (source_group);
create index survey_responses_ip_recent_idx on public.survey_responses (ip_hash, started_at);

create table public.survey_leads (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.survey_responses(session_id) on delete cascade,
  name text check (char_length(name) <= 80),
  whatsapp_e164 text not null check (whatsapp_e164 ~ '^\+55[1-9][0-9]9?[0-9]{8}$'),
  consent_text text not null,
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.survey_responses enable row level security;
alter table public.survey_leads enable row level security;
-- sem policies: apenas service_role acessa (RLS habilitada fecha o acesso
-- por padrão para anon/authenticated; service_role ignora RLS).

create or replace function public.survey_upsert_answer(
  p_session_id uuid, p_step smallint, p_answers jsonb,
  p_source_group text, p_ref uuid, p_ip_hash text, p_user_agent text
) returns void language sql security definer set search_path = public as $$
  insert into survey_responses (session_id, answers, last_step, source_group, ref_session_id, ip_hash, user_agent)
  values (p_session_id, p_answers, p_step, p_source_group, p_ref, p_ip_hash, p_user_agent)
  on conflict (session_id) do update
    set answers = survey_responses.answers || excluded.answers,
        last_step = greatest(survey_responses.last_step, excluded.last_step),
        updated_at = now();
$$;
revoke all on function public.survey_upsert_answer from public, anon, authenticated;
