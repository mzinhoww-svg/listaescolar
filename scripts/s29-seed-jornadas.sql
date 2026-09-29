-- Seed LOCAL das jornadas da S29 (revisão total de UX): uma conta por público, todas demonstrativas.
-- Só para banco local de teste (domínio reservado @listacerta.test). Idempotente. Sem senha: link mágico (Mailpit).
-- Compõe os padrões de s28-seed-medicao.sql (escola e parceiro), e2e-s14-seed.sql (papelaria/catálogo) e do seed
-- padrão (admin@listacerta.test, já criado por supabase/seed.sql). Todo display_name começa com "S29 ".
-- Contas: familia@ (parent), escola@ (school_member aprovado), papelaria@ (stationery_member, dono),
--         admin@ (admin, do seed padrão), parceiro@ (parent + membro owner de parceiro B2B ativo).
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
    insert into public.plans (version, status, free_leads, free_leads_validity_days, pass_price_cents, pass_included_leads,
      pass_max_installments, season_start_month, season_end_month, published_by)
    values ((select coalesce(max(version), 0) + 1 from public.plans), 'active', 10000, null, null, null, null, 11, 3, null)
    returning id into v_plan;
    insert into public.plan_price_tiers (plan_id, position, min_items, max_items, price_cents) values (v_plan, 1, 1, null, 100);
    insert into public.plan_credit_packages (plan_id, position, amount_cents) values (v_plan, 1, 1000);
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

commit;
