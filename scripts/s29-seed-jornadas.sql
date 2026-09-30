-- Seed LOCAL das jornadas da S29 (revisão total de UX): uma conta por público, todas demonstrativas.
-- Só para banco local de teste (domínio reservado @listacerta.test). Idempotente. Sem senha: link mágico (Mailpit).
-- Compõe os padrões de s28-seed-medicao.sql (escola e parceiro), e2e-s14-seed.sql (papelaria/catálogo) e do seed
-- padrão (admin@listacerta.test, já criado por supabase/seed.sql). Todo display_name começa com "S29 ".
-- Contas: familia@ (parent), escola@ (school_member aprovado), papelaria@ (stationery_member, dono),
--         admin@ (admin, do seed padrão), parceiro@ (parent + membro owner de parceiro B2B ativo, varejista),
--         marca@ (parent + membro owner de parceiro B2B ativo do tipo marca, o único que cria campanha).
-- Estados extras (Task 10): escola sem administrador com contato do INEP (99029002), escola de nome de 90 caracteres (99029003),
--   pedidos de administração em cada estado (99029011 a 99029015), papelarias em análise/aprovada/pausada, leads da papelaria demo
--   em cada estado (LC-S29D1 a LC-S29D9), contestação aberta, denúncia aberta, lote de importação, fatura aberta, aluno da família,
--   parceiros B2B pendente/recusado/suspenso e campanhas em cada estado. Ids fixos `...0000029xxxx`; o checker (scripts/s29-checks.mjs) os usa.
-- Ainda sem seed (pós-piloto): chave B2B de produção, entrega de webhook, extrato de faturamento, contestação aceita, lista publicada
--   não demonstrativa para o widget do parceiro.
-- Ambiente local sem chaves: o `.env.local` da trilha precisa de valores INERTES (nunca chaves reais), senão `getServerEnv()` falha e o
--   portal B2B responde "Emissão de chaves indisponível". Valores de teste usados na trilha 3 (gitignored, sem rede):
--     OPENROUTER_KEY=local-inert-openrouter-key   AI_MODEL_CHEAP=local/inert-cheap   AI_MODEL_STRONG=local/inert-strong
--     B2B_API_KEY_PEPPER=<32+ caracteres qualquer>   B2B_WEBHOOK_ENCRYPTION_KEY=<64 caracteres hex qualquer>
--     B2B_CAMPAIGN_TRACKING_SECRET=<32+ caracteres qualquer>   PESQUISA_RESULTS_PASSWORD=<16+>   IP_HASH_SALT=<16+>
-- GUARDA: aborta a menos que a sessão declare que o banco é local E o seed padrão local exista (admin@listacerta.test
-- só é criado por supabase/seed.sql em `db reset`). Como rodar: na MESMA sessão, antes deste arquivo,
--   set app.local_seed = 'on';   (mesma sessão que roda o arquivo)
-- Alternativa: PGOPTIONS="-c app.local_seed=on" psql -v ON_ERROR_STOP=1 "$URL_LOCAL" -f scripts/s29-seed-jornadas.sql. Nunca em staging/produção.
begin;

do $$
begin
  if coalesce(current_setting('app.local_seed', true), '') <> 'on' then
    raise exception 's29-seed: recusado. Seed só para banco LOCAL; defina app.local_seed=on na sessão (ver cabeçalho).';
  end if;
  if not exists (select 1 from auth.users where email = 'admin@listacerta.test') then
    raise exception 's29-seed: recusado. admin@listacerta.test ausente: não parece um banco local com supabase/seed.sql.';
  end if;
end $$;

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated', v.email, now(),
  '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', '', now(), now()
from (values
  ('00000000-0000-4000-8000-0000000029a1'::uuid, 'familia@listacerta.test'),
  ('00000000-0000-4000-8000-0000000029a2'::uuid, 'escola@listacerta.test'),
  ('00000000-0000-4000-8000-0000000029a3'::uuid, 'papelaria@listacerta.test'),
  ('00000000-0000-4000-8000-0000000029a4'::uuid, 'parceiro@listacerta.test')
) as v(id, email)
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, 'email', u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false), now(), now(), now()
from auth.users u
where u.email in ('familia@listacerta.test', 'escola@listacerta.test', 'papelaria@listacerta.test', 'parceiro@listacerta.test')
  and not exists (select 1 from auth.identities i where i.user_id = u.id);

-- O trigger criou os profiles como parent; promove cada um (admin vem do seed padrão).
update public.profiles set display_name = 'S29 Família' where id = '00000000-0000-4000-8000-0000000029a1';
update public.profiles set role = 'school_member', display_name = 'S29 Escola' where id = '00000000-0000-4000-8000-0000000029a2';
update public.profiles set role = 'stationery_member', display_name = 'S29 Papelaria' where id = '00000000-0000-4000-8000-0000000029a3';
update public.profiles set display_name = 'S29 Parceiro' where id = '00000000-0000-4000-8000-0000000029a4';
update public.profiles set display_name = 'S29 Admin' where id = '00000000-0000-4000-8000-0000000000a1' and role = 'admin';

-- Escola demonstrativa verificada, com a conta escola@ como membro aprovado.
insert into public.schools (id, inep, name, normalized_name, network, municipality_id, verification_status, is_demo)
select '00000000-0000-4000-8000-0000000029b1', '99029001', 'Escola Demo S29', 'escola demo s29', 'municipal', m.id, 'verified', true
from public.municipalities m where m.ibge_code = '5103403'
on conflict (id) do nothing;
insert into public.school_members (school_id, profile_id, member_role)
values ('00000000-0000-4000-8000-0000000029b1', '00000000-0000-4000-8000-0000000029a2', 'co_admin')
on conflict do nothing;

-- Papelaria demonstrativa ativa em Cuiabá: dona papelaria@, área de atendimento, catálogo parcial e 1 lead.
insert into public.stationeries (id, slug, trade_name, legal_name, cnpj, status, municipality_id, neighborhood, whatsapp,
  offers_pickup, offers_delivery, payment_methods, is_demo)
select '00000000-0000-4000-8000-0000000029c1', 's29-papelaria-demo', 'Papelaria Demo S29', 'Papelaria Demo S29 Ltda', '29029029000129',
  'active', m.id, 'Centro', '+5565999990029', true, true, array['pix','credit_card'], true
from public.municipalities m where m.ibge_code = '5103403'
on conflict (id) do nothing;
insert into public.stationery_members (stationery_id, profile_id, member_role)
values ('00000000-0000-4000-8000-0000000029c1', '00000000-0000-4000-8000-0000000029a3', 'owner')
on conflict do nothing;
insert into public.stationery_areas (stationery_id, municipality_id, neighborhood, display_name)
select '00000000-0000-4000-8000-0000000029c1', m.id, 'centro', 'Centro' from public.municipalities m where m.ibge_code = '5103403'
on conflict do nothing;
insert into public.catalog_items (stationery_id, name, item_key, price_cents, stock_status) values
  ('00000000-0000-4000-8000-0000000029c1', 'Caderno 96 folhas', 'caderno 96 folhas', 1290, 'in_stock'),
  ('00000000-0000-4000-8000-0000000029c1', 'Lápis preto HB', 'lapis preto hb', 150, 'in_stock'),
  ('00000000-0000-4000-8000-0000000029c1', 'Cola branca 90g', 'cola branca 90g', 690, 'out_of_stock')
on conflict do nothing;

-- O gatilho de cobrança do lead exige um plano ativo, e `db reset` não cria nenhum (planos são decisão do admin).
-- Só se faltar, publica um plano LOCAL de demonstração, não comercial (igual ao DEFAULT_TEST_PLAN dos testes de banco).
do $$
declare v_plan uuid;
begin
  if not exists (select 1 from public.plans where status = 'active') then
    -- Valores de demonstração, sem valor comercial: 100 pedidos grátis por 90 dias, pacotes de crédito e passe de temporada.
    insert into public.plans (version, status, free_leads, free_leads_validity_days, pass_price_cents, pass_included_leads,
      pass_max_installments, season_start_month, season_end_month, published_by)
    values ((select coalesce(max(version), 0) + 1 from public.plans), 'active', 100, 90, 12000, 150, 3, 11, 3, null)
    returning id into v_plan;
    insert into public.plan_price_tiers (plan_id, position, min_items, max_items, price_cents) values
      (v_plan, 1, 1, 20, 100), (v_plan, 2, 21, null, 200);
    insert into public.plan_credit_packages (plan_id, position, amount_cents) values (v_plan, 1, 1000), (v_plan, 2, 5000);
  end if;
end $$;

-- Um lead demonstrativo (recebido) da família para a papelaria.
insert into public.leads (id, code, requester_id, list_id, stationery_id, status, school_name, grade_label, school_year,
  municipality_id, neighborhood, item_count, consent_text_version, consented_at, idempotency_key, is_demo, expires_at)
select '00000000-0000-4000-8000-0000000029d1', 'LC-S29D1', '00000000-0000-4000-8000-0000000029a1',
  '00000000-0000-4000-8000-0000000029e1', '00000000-0000-4000-8000-0000000029c1', 'received', 'Escola Demo S29', '5º ano', 2027,
  m.id, 'centro', 1, 'v1', now(), '00000000-0000-4000-8000-0000000029f1', true, now() + interval '7 days'
from public.municipalities m where m.ibge_code = '5103403'
on conflict (id) do nothing;
insert into public.lead_items (lead_id, position, name, item_key, quantity)
select '00000000-0000-4000-8000-0000000029d1', 1, 'Caderno 96 folhas', 'caderno 96 folhas', 2
where not exists (select 1 from public.lead_items where lead_id = '00000000-0000-4000-8000-0000000029d1');
insert into public.lead_events (lead_id, event_type, to_status, actor_role, item_count)
select '00000000-0000-4000-8000-0000000029d1', 'created', 'received', 'parent', 1
where not exists (select 1 from public.lead_events where lead_id = '00000000-0000-4000-8000-0000000029d1');

-- Parceiro B2B ativo (dono = parceiro@).
insert into public.b2b_partners (id, trade_name, legal_name, cnpj, contact_name, partner_type, status, plan, is_demo)
values ('00000000-0000-4000-8000-0000000029b2', 'Parceiro Demo S29', 'Parceiro Demo S29 Ltda', '29029029000230', 'Contato Demo',
  'retailer', 'active', 'regional', true)
on conflict (id) do nothing;
insert into public.b2b_partner_members (partner_id, profile_id, member_role)
values ('00000000-0000-4000-8000-0000000029b2', '00000000-0000-4000-8000-0000000029a4', 'owner')
on conflict do nothing;

-- Lista oficial DEMONSTRATIVA publicada (Escola Demo S29, 5º ano, 2027), pelas mesmas funções de domínio dos testes
-- (list_create_candidate_version, list_transition, list_approve_version, list_publish_version); nunca por INSERT em status.
do $$
declare
  v_admin uuid := '00000000-0000-4000-8000-0000000000a1';
  v_school uuid := '00000000-0000-4000-8000-0000000029b1';
  v_grade uuid;
  v_list uuid;
  v_version uuid;
begin
  select id into v_grade from public.grades where slug = 'ef-5';
  select id into v_list from public.school_lists where school_id = v_school and grade_id = v_grade and school_year = 2027;
  if v_list is null then
    insert into public.school_lists (school_id, grade_id, school_year, is_demo) values (v_school, v_grade, 2027, true) returning id into v_list;
    select version_id into v_version from public.list_create_candidate_version(v_list, 'admin', null, null);
    insert into public.list_items (version_id, position, original_name, normalized_name, category, quantity, unit, confidence, alerts) values
      (v_version, 1, 'Caderno 96 folhas', 'caderno 96 folhas', 'papelaria', 2, 'un', 0.95, '[]'::jsonb),
      (v_version, 2, 'Lápis preto HB', 'lapis preto hb', 'papelaria', 6, 'un', 0.95, '[]'::jsonb),
      (v_version, 3, 'Cola branca 90g', 'cola branca 90g', 'papelaria', 1, 'un', 0.95, '[]'::jsonb),
      (v_version, 4, 'Tesoura sem ponta', 'tesoura sem ponta', 'papelaria', 1, 'un', 0.95, '[]'::jsonb);
    perform public.list_transition(v_list, 'submitted'::public.list_status, v_admin, null);
    perform public.list_transition(v_list, 'processing'::public.list_status, v_admin, null);
    perform public.list_transition(v_list, 'approved'::public.list_status, v_admin, null);
    perform public.list_approve_version(v_list, v_version, v_admin);
    perform public.list_publish_version(v_list, v_version, v_admin);
  end if;
end $$;

-- Carrinho da família a partir dessa lista publicada (mesmas linhas que features/cart/repository.createCart grava).
-- `list_id` do carrinho é o id da VERSÃO publicada (é o que `/carrinho/novo?lista=` recebe), não o da lista.
insert into public.carts (id, owner_id, list_id, strategy, is_demo, list_kind)
select '00000000-0000-4000-8000-0000000029d2', '00000000-0000-4000-8000-0000000029a1', l.current_version_id, 'cheapest', true, 'official'
from public.school_lists l
where l.school_id = '00000000-0000-4000-8000-0000000029b1' and l.school_year = 2027 and l.status = 'published'
on conflict (id) do update set list_id = excluded.list_id;
insert into public.cart_items (cart_id, list_item_id, name, quantity)
select '00000000-0000-4000-8000-0000000029d2', i.id, i.original_name, greatest(1, round(i.quantity)::int)
from public.carts c
  join public.list_items i on i.version_id = c.list_id
where c.id = '00000000-0000-4000-8000-0000000029d2'
  and not exists (select 1 from public.cart_items ci where ci.cart_id = c.id);

-- Envio de lista da família parado na revisão humana (com a cópia privada dos itens, que alimenta /revisar).
insert into public.consents (id, profile_id, purpose, text_version)
values ('00000000-0000-4000-8000-0000000029e2', '00000000-0000-4000-8000-0000000029a1', 'list_upload', 'v1')
on conflict (id) do nothing;
insert into public.list_submissions (id, submitted_by, source, school_id, grade, school_year, storage_path, file_name, mime_type,
  size_bytes, consent_id, status, is_demo)
values ('00000000-0000-4000-8000-0000000029e3', '00000000-0000-4000-8000-0000000029a1', 'parent', '00000000-0000-4000-8000-0000000029b1',
  '5º ano', 2027, '00000000-0000-4000-8000-0000000029a1/00000000-0000-4000-8000-0000000029e3/lista.pdf', 'lista.pdf',
  'application/pdf', 120000, '00000000-0000-4000-8000-0000000029e2', 'submitted', true)
on conflict (id) do nothing;
-- O gatilho de INSERT exige `submitted`; o estado da revisão vem por UPDATE (o guard só protege a identidade do envio).
update public.list_submissions set status = 'human_review' where id = '00000000-0000-4000-8000-0000000029e3' and status = 'submitted';
insert into public.parent_list_copies (submission_id, owner_id, items)
values ('00000000-0000-4000-8000-0000000029e3', '00000000-0000-4000-8000-0000000029a1',
  '[{"name":"Caderno 96 folhas","quantity":2,"unit":"un","category":"papelaria","confidence":0.9,"alerts":[],"origin":"extracted"},
    {"name":"Régua 30 cm","quantity":1,"unit":"un","category":"papelaria","confidence":0.6,"alerts":["low_confidence_item"],"origin":"extracted"}]'::jsonb)
on conflict (submission_id) do nothing;

-- ===========================================================================
-- Estados extras das jornadas (Task 10 da S29). Ids fixos `00000029xxxx` (o par `0000000029xx` acima é dos itens-base).
-- ===========================================================================

-- Sexta conta: dono de um parceiro B2B do tipo marca (o de demonstração é varejista e não cria campanha).
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000029a5', 'authenticated', 'authenticated', 'marca@listacerta.test', now(),
  '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', '', now(), now())
on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, 'email', u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false), now(), now(), now()
from auth.users u
where u.email = 'marca@listacerta.test' and not exists (select 1 from auth.identities i where i.user_id = u.id);
update public.profiles set display_name = 'S29 Marca' where id = '00000000-0000-4000-8000-0000000029a5';

-- Escolas extras (todas demonstrativas, em Cuiabá): sem administrador e com contato do INEP (fluxo de pedido de
-- administração), nome de 90 caracteres (RF-J1: sem rolagem horizontal a 390 px) e uma por estado de pedido.
insert into public.schools (id, inep, name, normalized_name, network, municipality_id, verification_status, email, phone, is_demo)
select v.id, v.inep, v.name, lower(v.name), 'municipal', m.id, 'registered', v.email, v.phone, true
from public.municipalities m,
  (values
    ('00000000-0000-4000-8000-000000290101'::uuid, '99029002', 'Escola Sem Administrador S29', 'contato.s29@escola-demo.listacerta.test', '+5565999990030'),
    ('00000000-0000-4000-8000-000000290102'::uuid, '99029003', 'Escola Municipal de Educação Infantil e Ensino Fundamental Profa. Maria das Dores Rios S29', null, null),
    ('00000000-0000-4000-8000-000000290111'::uuid, '99029011', 'Escola Pedido Enviado S29', 'pedido1.s29@escola-demo.listacerta.test', null),
    ('00000000-0000-4000-8000-000000290112'::uuid, '99029012', 'Escola Pedido Em Verificação S29', 'pedido2.s29@escola-demo.listacerta.test', null),
    ('00000000-0000-4000-8000-000000290113'::uuid, '99029013', 'Escola Pedido Link Vencido S29', 'pedido3.s29@escola-demo.listacerta.test', null),
    ('00000000-0000-4000-8000-000000290114'::uuid, '99029014', 'Escola Pedido Sem Evidência S29', null, null),
    ('00000000-0000-4000-8000-000000290115'::uuid, '99029015', 'Escola Pedido Recusado S29', null, null)
  ) as v(id, inep, name, email, phone)
where m.ibge_code = '5103403'
on conflict (id) do nothing;

-- Pedidos de administração em cada estado, feitos pela família (uma escola por estado; a escola sem administrador
-- fica livre para o formulário).
insert into public.claims (id, school_id, claimant_id, method, status, claimant_name, claimant_role_title, contact_email, evidence_note,
  privacy_ack_at, privacy_text_version, channel_confirmed_at, submitted_at, decided_at, decided_by, decision_reason, decision_code, is_demo)
select v.id, v.school_id, '00000000-0000-4000-8000-0000000029a1', v.method::public.claim_method, v.status::public.claim_status,
  'S29 Família', 'Diretora', 'familia@listacerta.test', v.note, now(), 'v1', null, now() - interval '2 days',
  v.decided_at, case when v.decision_reason is null then null else '00000000-0000-4000-8000-0000000000a1'::uuid end, v.decision_reason, v.code, true
from (values
  ('00000000-0000-4000-8000-000000290201'::uuid, '00000000-0000-4000-8000-000000290111'::uuid, 'institutional_email', 'submitted', null::text, null::timestamptz, null::text, null::text),
  ('00000000-0000-4000-8000-000000290202'::uuid, '00000000-0000-4000-8000-000000290112'::uuid, 'institutional_email', 'awaiting_verification', null, null, null, null),
  ('00000000-0000-4000-8000-000000290203'::uuid, '00000000-0000-4000-8000-000000290113'::uuid, 'institutional_email', 'token_expired', null, null, null, null),
  ('00000000-0000-4000-8000-000000290204'::uuid, '00000000-0000-4000-8000-000000290114'::uuid, 'documents', 'insufficient_evidence', 'Ofício da secretaria (demonstração).', now() - interval '1 day', 'O documento enviado não mostra o nome da escola.', 'evidence_unclear'),
  ('00000000-0000-4000-8000-000000290205'::uuid, '00000000-0000-4000-8000-000000290115'::uuid, 'documents', 'rejected', 'Sem vínculo comprovado (demonstração).', now() - interval '1 day', 'Não foi possível confirmar o vínculo com a escola.', 'no_link')
) as v(id, school_id, method, status, note, decided_at, decision_reason, code)
on conflict (id) do nothing;

-- Papelarias em outros estados: cadastro em análise, aprovada (ainda não ativa) e pausada pela equipe.
insert into public.stationeries (id, slug, trade_name, legal_name, cnpj, status, status_reason, paused_by, municipality_id, neighborhood, whatsapp,
  offers_pickup, offers_delivery, payment_methods, is_demo)
select v.id, v.slug, v.trade, v.trade || ' Ltda', v.cnpj, v.status::public.stationery_status, v.reason, v.paused_by, m.id, 'Centro', '+5565999990031',
  true, false, array['pix'], true
from public.municipalities m,
  (values
    ('00000000-0000-4000-8000-000000290301'::uuid, 's29-papelaria-analise', 'Papelaria Em Análise S29', '29029029000307', 'under_review', null::text, null::text),
    ('00000000-0000-4000-8000-000000290302'::uuid, 's29-papelaria-aprovada', 'Papelaria Aprovada S29', '29029029000408', 'approved', null, null),
    ('00000000-0000-4000-8000-000000290303'::uuid, 's29-papelaria-pausada', 'Papelaria Pausada S29', '29029029000509', 'paused', 'Pausada pela equipe para revisão (demonstração).', 'admin')
  ) as v(id, slug, trade, cnpj, status, reason, paused_by)
where m.ibge_code = '5103403'
on conflict (id) do nothing;

-- Pedidos de cotação da papelaria demo em cada estado (o `received` LC-S29D1 está acima). Valores só nos estados que os têm.
insert into public.leads (id, code, requester_id, list_id, stationery_id, status, school_name, grade_label, school_year, municipality_id, neighborhood,
  item_count, consent_text_version, consented_at, idempotency_key, is_demo, expires_at, quoted_total_cents, quoted_at, declared_sale_cents, declared_at, close_reason)
select v.id, v.code, '00000000-0000-4000-8000-0000000029a1', v.id, '00000000-0000-4000-8000-0000000029c1',
  v.status::public.lead_status, 'Escola Demo S29', '5º ano', 2027, m.id, 'centro', 1, 'v1', now(), v.idem, true,
  case when v.status = 'expired' then now() - interval '1 day' else now() + interval '7 days' end,
  v.quoted, case when v.quoted is null then null else now() - interval '1 day' end,
  v.sold, case when v.sold is null then null else now() - interval '12 hours' end, v.reason
from public.municipalities m,
  (values
    ('00000000-0000-4000-8000-000000290401'::uuid, 'LC-S29D2', 'viewed', '00000000-0000-4000-8000-0000002904f1'::uuid, null::int, null::int, null::text),
    ('00000000-0000-4000-8000-000000290402'::uuid, 'LC-S29D3', 'in_progress', '00000000-0000-4000-8000-0000002904f2'::uuid, null, null, null),
    ('00000000-0000-4000-8000-000000290403'::uuid, 'LC-S29D4', 'quote_sent', '00000000-0000-4000-8000-0000002904f3'::uuid, 32090, null, null),
    ('00000000-0000-4000-8000-000000290404'::uuid, 'LC-S29D5', 'awaiting_customer', '00000000-0000-4000-8000-0000002904f4'::uuid, 32090, null, null),
    ('00000000-0000-4000-8000-000000290405'::uuid, 'LC-S29D6', 'converted', '00000000-0000-4000-8000-0000002904f5'::uuid, 32090, 31500, null),
    ('00000000-0000-4000-8000-000000290406'::uuid, 'LC-S29D7', 'declined', '00000000-0000-4000-8000-0000002904f6'::uuid, null, null, 'price'),
    ('00000000-0000-4000-8000-000000290407'::uuid, 'LC-S29D8', 'expired', '00000000-0000-4000-8000-0000002904f7'::uuid, null, null, null),
    ('00000000-0000-4000-8000-000000290408'::uuid, 'LC-S29D9', 'cancelled', '00000000-0000-4000-8000-0000002904f8'::uuid, null, null, null)
  ) as v(id, code, status, idem, quoted, sold, reason)
where m.ibge_code = '5103403'
on conflict (id) do nothing;
insert into public.lead_items (lead_id, position, name, item_key, quantity)
select l.id, 1, 'Caderno 96 folhas', 'caderno 96 folhas', 2 from public.leads l
where l.id::text like '00000000-0000-4000-8000-0000002904%' and l.id::text not like '%f_'
  and not exists (select 1 from public.lead_items i where i.lead_id = l.id);
insert into public.lead_events (lead_id, event_type, to_status, actor_role, item_count)
select l.id, 'created', 'received', 'parent', 1 from public.leads l
where l.id::text like '00000000-0000-4000-8000-0000002904%' and l.id::text not like '%f_'
  and not exists (select 1 from public.lead_events e where e.lead_id = l.id);

-- Lead vendido: a família confirmou a compra e a papelaria contestou a cobrança de outro lead (contestação aberta).
insert into public.lead_purchase_confirmations (lead_id, actor_id, answer)
select '00000000-0000-4000-8000-000000290405', '00000000-0000-4000-8000-0000000029a1', 'bought_here'
where not exists (select 1 from public.lead_purchase_confirmations where lead_id = '00000000-0000-4000-8000-000000290405');
insert into public.lead_disputes (id, lead_id, stationery_id, reason, detail, status, deadline_at, opened_by)
values ('00000000-0000-4000-8000-000000290501', '00000000-0000-4000-8000-000000290402', '00000000-0000-4000-8000-0000000029c1',
  'incomplete_list', 'A lista do pedido veio incompleta (demonstração).', 'open', now() + interval '3 days', '00000000-0000-4000-8000-0000000029a3')
on conflict (id) do nothing;

-- Denúncia aberta sobre a lista publicada (feita pela família).
insert into public.reports (id, target_type, target_id, reason, detail_code, reporter_id, status)
select '00000000-0000-4000-8000-000000290701', 'school_list', l.id, 'informacao_desatualizada', 'demo_s29', '00000000-0000-4000-8000-0000000029a1', 'open'
from public.school_lists l
where l.school_id = '00000000-0000-4000-8000-0000000029b1' and l.school_year = 2027
on conflict (id) do nothing;

-- Lote de importação concluído, com linhas em cada ação.
insert into public.import_batches (id, file_name, file_hash, source, total_rows, inserted_count, updated_count, duplicate_count, rejected_count,
  unchanged_count, status, imported_by, started_at, finished_at, is_demo)
values ('00000000-0000-4000-8000-000000290801', 'inep-demo-s29.csv', 's29-seed-lote-demo', 'inep', 4, 1, 1, 1, 1, 0, 'completed',
  '00000000-0000-4000-8000-0000000000a1', now() - interval '1 hour', now() - interval '59 minutes', true)
on conflict (id) do nothing;
insert into public.import_rows (batch_id, row_number, raw, normalized, errors, action)
select '00000000-0000-4000-8000-000000290801', v.n, v.raw::jsonb, v.norm::jsonb, v.err::jsonb, v.action::public.import_row_action
from (values
  (1, '{"inep":"99029101","nome":"Escola Importada S29"}', '{"inep":"99029101"}', '[]', 'inserted'),
  (2, '{"inep":"99029001","nome":"Escola Demo S29"}', '{"inep":"99029001"}', '[]', 'updated'),
  (3, '{"inep":"99029101","nome":"Escola Importada S29"}', '{"inep":"99029101"}', '[]', 'duplicate'),
  (4, '{"inep":"","nome":"Sem código"}', null, '["inep_invalido"]', 'rejected')
) as v(n, raw, norm, err, action)
where not exists (select 1 from public.import_rows where batch_id = '00000000-0000-4000-8000-000000290801');

-- Fatura aberta de pacote de créditos da papelaria (Pix de demonstração, sem cobrança real).
insert into public.invoices (id, stationery_id, kind, package_id, amount_cents, due_date, status, provider, is_demo, idempotency_key)
select '00000000-0000-4000-8000-000000290901', '00000000-0000-4000-8000-0000000029c1', 'credit_package', p.id, p.amount_cents,
  current_date + 3, 'open', 'demo', true, 's29-seed-fatura-1'
from public.plan_credit_packages p
where p.plan_id = (select id from public.plans where status = 'active' order by version desc limit 1) and p.position = 1
on conflict (id) do nothing;

-- Aluno da família (só apelido e série).
insert into public.students (id, owner_id, nickname, grade_id)
select '00000000-0000-4000-8000-000000290a01', '00000000-0000-4000-8000-0000000029a1', 'Duda', g.id
from public.grades g where g.slug = 'ef-5'
on conflict (id) do nothing;

-- Parceiros B2B em cada estado; o de marca (ativo) é da conta marca@ e cria campanha.
insert into public.b2b_partners (id, trade_name, legal_name, cnpj, contact_name, partner_type, status, plan, status_reason, is_demo)
values
  ('00000000-0000-4000-8000-000000290b01', 'Marca Demo S29', 'Marca Demo S29 Ltda', '29029029000610', 'Contato Demo', 'brand', 'active', 'brand_campaigns', null, true),
  ('00000000-0000-4000-8000-000000290b02', 'Parceiro Pendente S29', 'Parceiro Pendente S29 Ltda', '29029029000711', 'Contato Demo', 'edtech', 'pending', null, null, true),
  ('00000000-0000-4000-8000-000000290b03', 'Parceiro Recusado S29', 'Parceiro Recusado S29 Ltda', '29029029000812', 'Contato Demo', 'retailer', 'rejected', null, 'Cadastro sem dados suficientes (demonstração).', true),
  ('00000000-0000-4000-8000-000000290b04', 'Parceiro Suspenso S29', 'Parceiro Suspenso S29 Ltda', '29029029000913', 'Contato Demo', 'retailer', 'suspended', 'regional', 'Suspenso pela equipe para revisão (demonstração).', true)
on conflict (id) do nothing;
insert into public.b2b_partner_members (partner_id, profile_id, member_role)
values ('00000000-0000-4000-8000-000000290b01', '00000000-0000-4000-8000-0000000029a5', 'owner')
on conflict do nothing;
insert into public.b2b_campaigns (id, partner_id, name, product_label, creative_text, pricing_model, bid_cents, daily_budget_cents, total_budget_cents,
  target_category, target_grade_stages, target_cities, status, status_reason, pause_origin, is_demo)
select v.id, '00000000-0000-4000-8000-000000290b01', v.name, 'Caderno universitário 10 matérias', 'Campanha de demonstração.', 'cpc', 50, 2000, 100000,
  'papelaria', array['ef']::public.grade_stage[], array['Cuiabá'], v.status::public.b2b_campaign_status, v.reason, v.pause, true
from (values
  ('00000000-0000-4000-8000-000000290c01'::uuid, 'Rascunho S29', 'draft', null::text, null::text),
  ('00000000-0000-4000-8000-000000290c02'::uuid, 'Em análise S29', 'pending_review', null, null),
  ('00000000-0000-4000-8000-000000290c03'::uuid, 'Aprovada S29', 'approved', null, null),
  ('00000000-0000-4000-8000-000000290c04'::uuid, 'Recusada S29', 'rejected', 'Texto do anúncio sem fonte para o preço (demonstração).', null),
  ('00000000-0000-4000-8000-000000290c05'::uuid, 'Pausada S29', 'paused', 'Pausada pelo parceiro.', 'owner'),
  ('00000000-0000-4000-8000-000000290c06'::uuid, 'Concluída S29', 'completed', null, null)
) as v(id, name, status, reason, pause)
on conflict (id) do nothing;

commit;
