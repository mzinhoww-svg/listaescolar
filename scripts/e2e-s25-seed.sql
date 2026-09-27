-- Seed LOCAL do E2E da S25 (widget e webhooks, trilha 2). Só para `pnpm db:reset` local.
-- Reaproveita os usuários reais do seed padrão (parent@listacerta.test = dono do parceiro B2B; admin@listacerta.test
-- = quem publica/decide). Cria um parceiro varejista JÁ ATIVO (o cadastro/aprovação é testado pela S24; aqui o
-- ponto é widget/webhooks, que exigem parceiro active/sandbox) e publica uma lista REAL em Cuiabá (MT, dentro da
-- cobertura do parceiro) pelas funções de domínio reais (nunca INSERT direto em `school_lists.status`), mais uma
-- escola com reivindicação pronta para aprovar durante o roteiro (dispara `school.approved` de verdade).

do $$
declare
  v_parent uuid := '00000000-0000-4000-8000-0000000000a2'; -- parent@listacerta.test (supabase/seed.sql)
  v_admin uuid := '00000000-0000-4000-8000-0000000000a1'; -- admin@listacerta.test
  v_muni uuid;
  v_grade uuid;
  v_school uuid;
  v_list uuid;
  v_version uuid;
  v_partner uuid;
  v_claim_school uuid;
  v_claim uuid;
begin
  select id into v_muni from public.municipalities where ibge_code = '5103403'; -- Cuiabá, habilitado
  select id into v_grade from public.grades where slug = 'ef-1';

  -- Parceiro varejista ativo, dono = parent@listacerta.test, cobertura MT.
  insert into public.b2b_partners (trade_name, legal_name, cnpj, contact_name, partner_type, status, plan, coverage_ufs, test_rate_per_minute, test_rate_per_day, live_rate_per_minute, live_rate_per_day, terms_text_version)
  select 'Loja E2E S25', 'Loja E2E S25 Comércio LTDA', '11444777000161', 'Contato E2E', 'retailer', 'active', 'regional', array['MT'], 60, 1000, 120, 5000, 'b2b-api-terms-e2e'
  where not exists (select 1 from public.b2b_partner_members m where m.profile_id = v_parent)
  returning id into v_partner;

  if v_partner is null then
    select m.partner_id into v_partner from public.b2b_partner_members m where m.profile_id = v_parent;
  else
    insert into public.b2b_partner_members (partner_id, profile_id, member_role) values (v_partner, v_parent, 'owner');
  end if;

  -- Escola e lista REAL, publicada (visível ao widget: ambiente `live`, cobertura MT).
  insert into public.schools (inep, name, normalized_name, network, municipality_id)
  values ('51900201', 'Escola Real E2E S25', 'escola real e2e s25', 'municipal', v_muni)
  on conflict (inep) do update set name = excluded.name
  returning id into v_school;

  insert into public.school_lists (school_id, grade_id, school_year, is_demo)
  select v_school, v_grade, 2027, false
  where not exists (select 1 from public.school_lists where school_id = v_school and grade_id = v_grade and school_year = 2027)
  returning id into v_list;

  if v_list is null then
    select id into v_list from public.school_lists where school_id = v_school and grade_id = v_grade and school_year = 2027;
  else
    select version_id into v_version from public.list_create_candidate_version(v_list, 'admin', null, null);
    insert into public.list_items (version_id, position, original_name, normalized_name, category, quantity, unit, confidence, alerts) values
      (v_version, 1, 'Caderno universitario', 'caderno universitario', 'papelaria', 4, 'un', 0.95, '[]'::jsonb),
      (v_version, 2, 'Lapis preto', 'lapis preto', 'papelaria', 12, 'un', 0.95, '[]'::jsonb),
      (v_version, 3, 'Cola bastao', 'cola bastao', 'papelaria', 2, 'un', 0.95, '[]'::jsonb);
    perform public.list_transition(v_list, 'submitted'::public.list_status, v_admin, null);
    perform public.list_transition(v_list, 'processing'::public.list_status, v_admin, null);
    perform public.list_transition(v_list, 'approved'::public.list_status, v_admin, null);
    perform public.list_approve_version(v_list, v_version, v_admin);
    perform public.list_publish_version(v_list, v_version, v_admin);
  end if;

  -- Escola com reivindicação pronta para aprovar no roteiro (dispara `school.approved` de verdade).
  insert into public.schools (inep, name, normalized_name, network, municipality_id, email, phone)
  values ('51900202', 'Escola Reivindicar E2E S25', 'escola reivindicar e2e s25', 'municipal', v_muni, 'diretoria-e2e-s25@escola.invalid', '65999990099')
  on conflict (inep) do nothing
  returning id into v_claim_school;
  if v_claim_school is null then
    select id into v_claim_school from public.schools where inep = '51900202';
  end if;

  if not exists (select 1 from public.claims where school_id = v_claim_school and status in ('submitted', 'awaiting_verification')) then
    select public.claim_create(v_claim_school, v_parent, 'documents'::public.claim_method, 'Responsável E2E S25', 'Diretor(a)', 'nota e2e', 'v1') into v_claim;
    perform public.claim_add_evidence(v_claim, v_parent, v_claim::text || '/' || gen_random_uuid()::text || '.pdf', 'application/pdf', 1234, encode(sha256('doc'::bytea), 'hex'), 'documento.pdf');
    perform public.claim_submit_for_review(v_claim, v_parent, null); -- já entra em awaiting_verification
  end if;
end $$;
