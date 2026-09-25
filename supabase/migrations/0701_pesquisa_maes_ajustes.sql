-- Pesquisa com mães: ajustes aditivos para passar nos testes de guarda do
-- repositório (tests/db/rls-profiles.test.ts e tests/db/schema.test.ts), que
-- rodam no job "db" do CI (Docker real) e pegaram dois desvios da 0700 (já
-- aplicada no staging; por isso o ajuste vem em migration nova, nunca
-- editando a 0700):
-- 1) toda função SECURITY DEFINER em public precisa de search_path vazio
--    (a 0700 usava `set search_path = public`, que este repositório recusa);
-- 2) toda tabela em public precisa ter created_at E updated_at (a spec só
--    pedia started_at/updated_at em survey_responses e só created_at em
--    survey_leads; o guard-rail deste repositório exige as duas colunas em
--    toda tabela).
-- Puramente aditivo: nenhuma coluna nem função existente é removida.

alter table public.survey_responses add column created_at timestamptz not null default now();
alter table public.survey_leads add column updated_at timestamptz not null default now();

create or replace function public.survey_upsert_answer(
  p_session_id uuid, p_step smallint, p_answers jsonb,
  p_source_group text, p_ref uuid, p_ip_hash text, p_user_agent text
) returns void language sql security definer set search_path = '' as $$
  insert into public.survey_responses as sr (session_id, answers, last_step, source_group, ref_session_id, ip_hash, user_agent)
  values (p_session_id, p_answers, p_step, p_source_group, p_ref, p_ip_hash, p_user_agent)
  on conflict (session_id) do update
    set answers = sr.answers || excluded.answers,
        last_step = greatest(sr.last_step, excluded.last_step),
        updated_at = now();
$$;
revoke all on function public.survey_upsert_answer from public, anon, authenticated;
