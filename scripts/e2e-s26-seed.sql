-- Seed LOCAL do E2E da S26 (campanhas de marca, insights e faturamento B2B, trilha 2). Só para `pnpm db:reset`
-- local. Reaproveita os usuários reais do seed padrão (parent@listacerta.test = dono do parceiro; admin@listacerta
-- .test = quem aprova/gera o extrato). Cria um parceiro MARCA já ativo (o cadastro/aprovação de parceiro é
-- testado pela S24), 6 listas reais publicadas em Cuiabá (MT) com item de categoria "papelaria" (para o
-- insight ficar VISÍVEL, k mínimo padrão = 5) e 2 listas reais com categoria "uniforme" (para ficar SUPRIMIDO,
-- abaixo de 5). Também cria uma campanha JÁ aprovada com eventos reais e gera um extrato do período de hoje, para
-- a tela de Faturamento (B2B09) ter o que mostrar sem depender de um ciclo de cobrança completo no roteiro.

do $$
declare
  v_parent uuid := '00000000-0000-4000-8000-0000000000a2';
  v_admin uuid := '00000000-0000-4000-8000-0000000000a1';
  v_muni uuid;
  v_grade uuid;
  v_school uuid;
  v_list uuid;
  v_version uuid;
  v_partner uuid;
  v_seeded_campaign uuid;
  v_key uuid;
  i int;
begin
  select id into v_muni from public.municipalities where ibge_code = '5103403'; -- Cuiabá, habilitado
  select id into v_grade from public.grades where slug = 'ef-1';

  insert into public.b2b_partners (trade_name, legal_name, cnpj, contact_name, partner_type, status, plan, coverage_ufs, test_rate_per_minute, test_rate_per_day, live_rate_per_minute, live_rate_per_day, terms_text_version)
  select 'Marca E2E S26', 'Marca E2E S26 Comércio LTDA', '11444777000161', 'Contato E2E', 'brand', 'active', 'brand_campaigns', array['MT'], 60, 1000, 120, 5000, 'b2b-api-terms-e2e'
  where not exists (select 1 from public.b2b_partner_members m where m.profile_id = v_parent)
  returning id into v_partner;

  if v_partner is null then
    select m.partner_id into v_partner from public.b2b_partner_members m where m.profile_id = v_parent;
  else
    insert into public.b2b_partner_members (partner_id, profile_id, member_role) values (v_partner, v_parent, 'owner');
  end if;

  -- 6 listas reais publicadas com categoria "papelaria" (>= min_k padrão de 5: fica VISÍVEL no insight).
  for i in 1..6 loop
    insert into public.schools (inep, name, normalized_name, network, municipality_id)
    values ('519004' || lpad(i::text, 2, '0'), 'Escola Insight Papelaria E2E S26 ' || i, 'escola insight papelaria e2e s26 ' || i, 'municipal', v_muni)
    on conflict (inep) do update set name = excluded.name
    returning id into v_school;

    insert into public.school_lists (school_id, grade_id, school_year, is_demo)
    select v_school, v_grade, 2029, false
    where not exists (select 1 from public.school_lists where school_id = v_school and grade_id = v_grade and school_year = 2029)
    returning id into v_list;

    if v_list is not null then
      select version_id into v_version from public.list_create_candidate_version(v_list, 'admin', null, null);
      insert into public.list_items (version_id, position, original_name, normalized_name, category, quantity, unit, confidence, alerts)
      values (v_version, 1, 'Caderno universitario', 'caderno universitario', 'papelaria', 4, 'un', 0.95, '[]'::jsonb);
      perform public.list_transition(v_list, 'submitted'::public.list_status, v_admin, null);
      perform public.list_transition(v_list, 'processing'::public.list_status, v_admin, null);
      perform public.list_transition(v_list, 'approved'::public.list_status, v_admin, null);
      perform public.list_approve_version(v_list, v_version, v_admin);
      perform public.list_publish_version(v_list, v_version, v_admin);
    end if;
  end loop;

  -- 2 listas reais publicadas com categoria "uniforme" (< 5: fica SUPRIMIDO no insight).
  for i in 1..2 loop
    insert into public.schools (inep, name, normalized_name, network, municipality_id)
    values ('519005' || lpad(i::text, 2, '0'), 'Escola Insight Uniforme E2E S26 ' || i, 'escola insight uniforme e2e s26 ' || i, 'municipal', v_muni)
    on conflict (inep) do update set name = excluded.name
    returning id into v_school;

    insert into public.school_lists (school_id, grade_id, school_year, is_demo)
    select v_school, v_grade, 2029, false
    where not exists (select 1 from public.school_lists where school_id = v_school and grade_id = v_grade and school_year = 2029)
    returning id into v_list;

    if v_list is not null then
      select version_id into v_version from public.list_create_candidate_version(v_list, 'admin', null, null);
      insert into public.list_items (version_id, position, original_name, normalized_name, category, quantity, unit, confidence, alerts)
      values (v_version, 1, 'Camiseta uniforme', 'camiseta uniforme', 'uniforme', 2, 'un', 0.95, '[]'::jsonb);
      perform public.list_transition(v_list, 'submitted'::public.list_status, v_admin, null);
      perform public.list_transition(v_list, 'processing'::public.list_status, v_admin, null);
      perform public.list_transition(v_list, 'approved'::public.list_status, v_admin, null);
      perform public.list_approve_version(v_list, v_version, v_admin);
      perform public.list_publish_version(v_list, v_version, v_admin);
    end if;
  end loop;

  -- Campanha JÁ aprovada com eventos reais (para a tela de Faturamento ter o que mostrar).
  if not exists (select 1 from public.b2b_campaigns where partner_id = v_partner and name = 'Campanha Seed E2E S26') then
    v_seeded_campaign := public.b2b_campaign_create(v_parent, v_partner, jsonb_build_object(
      'name', 'Campanha Seed E2E S26', 'product_label', 'Caderno universitario 96 folhas', 'pricing_model', 'cpc',
      'bid_cents', 300, 'total_budget_cents', 1000000, 'target_category', 'papelaria'
    ));
    perform public.b2b_campaign_transition(v_parent, v_seeded_campaign, 'pending_review', null);
    perform public.b2b_campaign_transition(v_admin, v_seeded_campaign, 'approved', null);
    perform public.b2b_campaign_record_event(v_seeded_campaign, null, 'impression', encode(sha256('seed-imp-1'::bytea), 'hex'));
    perform public.b2b_campaign_record_event(v_seeded_campaign, null, 'click', encode(sha256('seed-imp-1'::bytea), 'hex'));

    select k.id into v_key from public.b2b_api_keys k where k.partner_id = v_partner limit 1;
    if v_key is null then
      insert into public.b2b_api_keys (partner_id, environment, public_id, key_hash, hash_version, last4, scopes, status, created_by)
      values (v_partner, 'live', 'E2ES26SEEDXX', encode(sha256('seed-key'::bytea), 'hex'), 1, 'seed', array['schools:read'], 'active', v_admin)
      returning id into v_key;
    end if;
    insert into public.b2b_usage_daily (key_id, partner_id, day, endpoint, status_class, request_count)
    values (v_key, v_partner, current_date, '/v1/schools', '2xx', 42);

    perform public.b2b_statement_generate(v_admin, v_partner, current_date, current_date, 'PIX manual — ver chave da conta no cadastro do parceiro');
  end if;
end $$;
