-- Seed local. O município piloto (Cuiabá) vive na migration 0001.
-- Usuários de desenvolvimento (só `supabase db reset` local; nunca staging/produção). Sem senha:
-- entre pelo link mágico (Mailpit em http://127.0.0.1:54324).
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'admin@listacerta.test', now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated', 'parent@listacerta.test', now(),
   '{"provider":"email","providers":["email"]}', '{}')
on conflict (id) do nothing;

-- O trigger criou os profiles como parent; promove o admin (owner passa pelo guard de role).
update public.profiles set role = 'admin', display_name = 'Admin Local'
where id = '00000000-0000-4000-8000-0000000000a1';
