-- ATENÇÃO: seed SÓ para `supabase db reset` LOCAL. Nunca rodar em staging/produção
-- (cria usuários de desenvolvimento, inclusive um admin). Domínio reservado: @listacerta.test.
-- Sem senha: entre pelo link mágico (Mailpit em http://127.0.0.1:54324).
-- O município piloto (Cuiabá) vive na migration 0001.
insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated',
   'admin@listacerta.test', now(), '{"provider":"email","providers":["email"]}', '{}',
   '', '', '', '', '', '', '', '', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated',
   'parent@listacerta.test', now(), '{"provider":"email","providers":["email"]}', '{}',
   '', '', '', '', '', '', '', '', now(), now())
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, 'email', u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
       now(), now(), now()
from auth.users u
where u.email in ('admin@listacerta.test', 'parent@listacerta.test')
on conflict do nothing;

-- O trigger criou os profiles como parent; promove o admin (owner passa pelo guard de role).
update public.profiles set role = 'admin', display_name = 'Admin Local'
where id = '00000000-0000-4000-8000-0000000000a1';
