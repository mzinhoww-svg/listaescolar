-- Seed LOCAL do E2E da S11 (trilha 3). Só para banco local de teste; domínio reservado @listacerta.test; nada de dado real.
-- Escola sintética verificada em Cuiabá com a escola-membro vinculada, uma papelaria ativa com catálogo dos itens do script falso.
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000011a1', 'authenticated', 'authenticated', 's11escola@listacerta.test', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', '', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000011a2', 'authenticated', 'authenticated', 's11papelaria@listacerta.test', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', '', now(), now())
on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, 'email', u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false), now(), now(), now()
  from auth.users u where u.email in ('s11escola@listacerta.test', 's11papelaria@listacerta.test')
   and not exists (select 1 from auth.identities i where i.user_id = u.id);
update public.profiles set role = 'school_member', display_name = 'Escola S11' where id = '00000000-0000-4000-8000-0000000011a1';
update public.profiles set role = 'stationery_member', display_name = 'Papelaria S11' where id = '00000000-0000-4000-8000-0000000011a2';

insert into public.schools (id, inep, name, normalized_name, network, municipality_id, is_demo)
select 'aaaaaaaa-0000-4000-8000-000000001101', '51991101', 'Escola Sintética S11', 'escola sintetica s11', 'municipal', m.id, true
  from public.municipalities m where m.ibge_code = '5103403'
on conflict (id) do nothing;
update public.schools set verification_status = 'verified' where id = 'aaaaaaaa-0000-4000-8000-000000001101';
insert into public.school_members (school_id, profile_id, member_role)
values ('aaaaaaaa-0000-4000-8000-000000001101', '00000000-0000-4000-8000-0000000011a1', 'co_admin') on conflict do nothing;

insert into public.stationeries (id, slug, trade_name, legal_name, cnpj, status, municipality_id, neighborhood, whatsapp, offers_pickup, offers_delivery, payment_methods, is_demo)
select '00000000-0000-4000-8000-0000000011b2', 's11-papelaria', 'Papelaria S11', 'Papelaria S11 Ltda', '11222333000181', 'active', m.id, 'Centro', '+5565999991234', true, false, array['pix'], true
  from public.municipalities m where m.ibge_code = '5103403'
on conflict (id) do nothing;
insert into public.stationery_members (stationery_id, profile_id, member_role)
values ('00000000-0000-4000-8000-0000000011b2', '00000000-0000-4000-8000-0000000011a2', 'owner') on conflict do nothing;
insert into public.catalog_items (stationery_id, name, item_key, price_cents, stock_status) values
  ('00000000-0000-4000-8000-0000000011b2', 'Caderno brochura (exemplo)', 'caderno brochura (exemplo)', 1290, 'in_stock'),
  ('00000000-0000-4000-8000-0000000011b2', 'Lápis preto (exemplo)', 'lapis preto (exemplo)', 150, 'in_stock'),
  ('00000000-0000-4000-8000-0000000011b2', 'Borracha branca (exemplo)', 'borracha branca (exemplo)', 200, 'in_stock')
on conflict do nothing;

-- Pipeline de IA FALSO por dado (nunca o OpenRouter). O interruptor de publicação automática NÃO é ligado aqui: o E2E liga e desliga.
update public.ai_settings set routes = jsonb_build_object('cheap', jsonb_build_object('provider', 'fake', 'timeout_ms', 20000),
  'strong', jsonb_build_object('provider', 'fake', 'timeout_ms', 20000), 'vision', jsonb_build_object('provider', 'fake', 'timeout_ms', 20000));
