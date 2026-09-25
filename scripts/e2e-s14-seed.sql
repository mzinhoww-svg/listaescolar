-- Seed LOCAL do E2E da S14 (trilha 3). Só para `pnpm db:reset` local; domínio reservado @listacerta.test.
-- Duas papelarias `active` em Cuiabá, cada uma com um dono `stationery_member`, e catálogo parcial (demonstração).
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000014a1', 'authenticated', 'authenticated', 's14a@listacerta.test', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', '', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000014b1', 'authenticated', 'authenticated', 's14b@listacerta.test', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', '', now(), now())
on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, 'email', u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false), now(), now(), now()
from auth.users u where u.email in ('s14a@listacerta.test', 's14b@listacerta.test') on conflict do nothing;
update public.profiles set role = 'stationery_member' where id in ('00000000-0000-4000-8000-0000000014a1', '00000000-0000-4000-8000-0000000014b1');

insert into public.stationeries (id, slug, trade_name, legal_name, cnpj, status, municipality_id, neighborhood, whatsapp, offers_pickup, offers_delivery, payment_methods, is_demo)
select v.id, v.slug, v.name, v.name || ' Ltda', v.cnpj, 'active', m.id, v.hood, v.wa, true, v.delivery, v.pay, true
from (values
  ('00000000-0000-4000-8000-0000000014a2'::uuid, 's14-papelaria-a', 'Papelaria Demo A', '11222333000181', 'Centro', '+5565999991234', true, array['pix','credit_card']),
  ('00000000-0000-4000-8000-0000000014b2'::uuid, 's14-papelaria-b', 'Papelaria Demo B', '11444777000161', 'Goiabeiras', '+5565999995678', false, array['pix'])
) as v(id, slug, name, cnpj, hood, wa, delivery, pay)
join public.municipalities m on m.ibge_code = '5103403'
on conflict (id) do nothing;
insert into public.stationery_members (stationery_id, profile_id, member_role) values
  ('00000000-0000-4000-8000-0000000014a2', '00000000-0000-4000-8000-0000000014a1', 'owner'),
  ('00000000-0000-4000-8000-0000000014b2', '00000000-0000-4000-8000-0000000014b1', 'owner')
on conflict do nothing;
-- Catálogo da A: 3 dos 5 itens da lista demo (preço informado); "cola" em falta; sem tesoura. B: só 1 item.
insert into public.catalog_items (stationery_id, name, item_key, price_cents, stock_status) values
  ('00000000-0000-4000-8000-0000000014a2', 'Caderno 96 folhas', 'caderno 96 folhas', 1290, 'in_stock'),
  ('00000000-0000-4000-8000-0000000014a2', 'Lápis preto HB', 'lapis preto hb', 150, 'in_stock'),
  ('00000000-0000-4000-8000-0000000014a2', 'Borracha branca', 'borracha branca', 200, 'unknown'),
  ('00000000-0000-4000-8000-0000000014a2', 'Cola branca 90g', 'cola branca 90g', 690, 'out_of_stock'),
  ('00000000-0000-4000-8000-0000000014b2', 'Caderno 96 folhas', 'caderno 96 folhas', 1350, 'in_stock')
on conflict do nothing;
