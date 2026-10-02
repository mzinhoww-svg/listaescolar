-- Seed LOCAL da medição da S28 (Task 30): membro de escola aprovado, para medir /escola/* logado.
-- Só para banco local de teste (@listacerta.test). Roda depois de `pnpm import:inep tests/fixtures/inep-demo.csv --demo`.
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000028a1', 'authenticated', 'authenticated',
  's28escola@listacerta.test', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', '', now(), now())
on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, 'email', u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false), now(), now(), now()
  from auth.users u where u.email = 's28escola@listacerta.test'
   and not exists (select 1 from auth.identities i where i.user_id = u.id);
update public.profiles set role = 'school_member', display_name = 'Escola S28' where id = '00000000-0000-4000-8000-0000000028a1';
update public.schools set verification_status = 'verified' where inep = '99001001';
insert into public.school_members (school_id, profile_id, member_role)
select s.id, '00000000-0000-4000-8000-0000000028a1', 'co_admin' from public.schools s where s.inep = '99001001'
on conflict do nothing;

-- Parceiro B2B ativo (dono = parent@listacerta.test) para medir /b2b/* logado.
insert into public.b2b_partners (id, trade_name, legal_name, cnpj, contact_name, partner_type, status, plan, is_demo)
values ('00000000-0000-4000-8000-0000000028b1', 'Parceiro Demo S28', 'Parceiro Demo S28 Ltda', '11222333000181', 'Contato Demo', 'retailer', 'active', 'regional', true)
on conflict (id) do nothing;
insert into public.b2b_partner_members (partner_id, profile_id, member_role)
values ('00000000-0000-4000-8000-0000000028b1', '00000000-0000-4000-8000-0000000000a2', 'owner') on conflict do nothing;
