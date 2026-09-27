-- Seed LOCAL do E2E da S24 (portal B2B, trilha 2). Só para `pnpm db:reset` local.
-- Reaproveita os usuários reais do seed padrão (admin@listacerta.test = dono e revisor; parent@listacerta.test =
-- dono do parceiro B2B) e publica uma escola/lista REAL e uma DEMONSTRATIVA em Cuiabá (município habilitado),
-- pelas mesmas funções de domínio que os testes de banco usam (list_create_candidate_version/list_transition/
-- list_approve_version/list_publish_version) — nunca por INSERT direto em `school_lists.status`.

do $$
declare
  v_admin uuid := '00000000-0000-4000-8000-0000000000a1'; -- admin@listacerta.test (supabase/seed.sql)
  v_muni uuid;
  v_school_real uuid;
  v_school_demo uuid;
  v_grade uuid;
  v_list_real uuid;
  v_list_demo uuid;
  v_version_real uuid;
  v_version_demo uuid;
begin
  select id into v_muni from public.municipalities where ibge_code = '5103403'; -- Cuiabá, habilitado (migration 0001)
  select id into v_grade from public.grades where slug = 'ef-1';

  -- Escola e lista REAIS (is_demo = false): visíveis só pela chave `live`.
  insert into public.schools (inep, name, normalized_name, network, municipality_id)
  values ('51900101', 'Escola Real E2E S24', 'escola real e2e s24', 'municipal', v_muni)
  on conflict (inep) do update set name = excluded.name
  returning id into v_school_real;

  insert into public.school_lists (school_id, grade_id, school_year, is_demo)
  select v_school_real, v_grade, 2027, false
  where not exists (select 1 from public.school_lists where school_id = v_school_real and grade_id = v_grade and school_year = 2027)
  returning id into v_list_real;

  if v_list_real is null then
    select id into v_list_real from public.school_lists where school_id = v_school_real and grade_id = v_grade and school_year = 2027;
  else
    select version_id into v_version_real from public.list_create_candidate_version(v_list_real, 'admin', null, null);
    insert into public.list_items (version_id, position, original_name, normalized_name, category, quantity, unit, confidence, alerts) values
      (v_version_real, 1, 'Caderno universitario', 'caderno universitario', 'papelaria', 4, 'un', 0.95, '[]'::jsonb),
      (v_version_real, 2, 'Lapis preto', 'lapis preto', 'papelaria', 12, 'un', 0.95, '[]'::jsonb),
      (v_version_real, 3, 'Cola bastao', 'cola bastao', 'papelaria', 2, 'un', 0.95, '[]'::jsonb),
      (v_version_real, 4, 'Tesoura sem ponta', 'tesoura sem ponta', 'papelaria', 1, 'un', 0.95, '[]'::jsonb);
    perform public.list_transition(v_list_real, 'submitted'::public.list_status, v_admin, null);
    perform public.list_transition(v_list_real, 'processing'::public.list_status, v_admin, null);
    perform public.list_transition(v_list_real, 'approved'::public.list_status, v_admin, null);
    perform public.list_approve_version(v_list_real, v_version_real, v_admin);
    perform public.list_publish_version(v_list_real, v_version_real, v_admin);
  end if;

  -- Escola e lista DEMONSTRATIVAS (is_demo = true): visíveis só pela chave `test` (sandbox).
  insert into public.schools (inep, name, normalized_name, network, municipality_id, is_demo)
  values ('51900102', 'Escola Demo E2E S24', 'escola demo e2e s24', 'municipal', v_muni, true)
  on conflict (inep) do update set name = excluded.name
  returning id into v_school_demo;

  insert into public.school_lists (school_id, grade_id, school_year, is_demo)
  select v_school_demo, v_grade, 2027, true
  where not exists (select 1 from public.school_lists where school_id = v_school_demo and grade_id = v_grade and school_year = 2027)
  returning id into v_list_demo;

  if v_list_demo is null then
    select id into v_list_demo from public.school_lists where school_id = v_school_demo and grade_id = v_grade and school_year = 2027;
  else
    select version_id into v_version_demo from public.list_create_candidate_version(v_list_demo, 'admin', null, null);
    insert into public.list_items (version_id, position, original_name, normalized_name, category, quantity, unit, confidence, alerts) values
      (v_version_demo, 1, 'Caderno universitario', 'caderno universitario', 'papelaria', 3, 'un', 0.95, '[]'::jsonb),
      (v_version_demo, 2, 'Lapis preto', 'lapis preto', 'papelaria', 6, 'un', 0.95, '[]'::jsonb);
    perform public.list_transition(v_list_demo, 'submitted'::public.list_status, v_admin, null);
    perform public.list_transition(v_list_demo, 'processing'::public.list_status, v_admin, null);
    perform public.list_transition(v_list_demo, 'approved'::public.list_status, v_admin, null);
    perform public.list_approve_version(v_list_demo, v_version_demo, v_admin);
    perform public.list_publish_version(v_list_demo, v_version_demo, v_admin);
  end if;
end $$;
