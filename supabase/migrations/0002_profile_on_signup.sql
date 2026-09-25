-- 0002_profile_on_signup: cria public.profiles no cadastro em auth.users (S02).
-- Papel sempre 'parent': raw_user_meta_data é editável pelo usuário e nunca define papel.
-- on conflict do nothing: idempotente, não duplica nem rebaixa papel; nunca bloqueia o cadastro.
create function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    'parent',
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated, service_role;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
