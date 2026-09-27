-- 0603_family_area: estudantes e listas salvas da família (S15, fora de trilha; roda depois da S11).
-- FKs reais para schools/grades/profiles/school_lists são permitidas aqui (pós-integração das trilhas, ADR-004).
-- Mínimo de dado de menor (CLAUDE.md/SPEC §5): só apelido (sem sobrenome, sem dígito) e série; nenhuma política
-- de leitura para admin/system (diferente de carts) — ninguém além do próprio responsável enxerga estudantes.

-- ---------------------------------------------------------------------------
-- Validador do apelido (usado no CHECK, mesmo padrão de review_items_valid/0204): sem espaço (sinal prático de
-- "nome e sobrenome"), sem dígito, sem caractere de controle, 2-30 caracteres, já aparado.
-- ---------------------------------------------------------------------------
create function public.student_nickname_valid(p text) returns boolean
language sql immutable set search_path = ''
as $$
  select p is not null
     and p = btrim(p)
     and length(p) between 2 and 30
     and p !~ '\s'
     and p !~ '[0-9]'
     and p !~ '[[:cntrl:]]';
$$;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.students (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  nickname text not null check (public.student_nickname_valid(nickname)),
  school_id uuid not null references public.schools (id) on delete restrict,
  grade_id uuid not null references public.grades (id) on delete restrict,
  school_year integer not null check (school_year between 2020 and 2100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index students_owner_id_idx on public.students (owner_id);

create table public.saved_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  list_id uuid not null references public.school_lists (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_lists_student_list_key unique (student_id, list_id)
);
create index saved_lists_owner_id_idx on public.saved_lists (owner_id);
create index saved_lists_list_id_idx on public.saved_lists (list_id);

-- ---------------------------------------------------------------------------
-- Gatilhos de manutenção
-- ---------------------------------------------------------------------------
create trigger students_set_updated_at before update on public.students
  for each row execute function public.set_updated_at();
create trigger saved_lists_set_updated_at before update on public.saved_lists
  for each row execute function public.set_updated_at();

-- Identidade do aluno é imutável (id e dono nunca trocam); nickname/escola/série podem ser editados pelo dono.
create function public.students_guard() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id then
    raise exception 'identidade do aluno é imutável' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger students_guard_update before update on public.students
  for each row execute function public.students_guard();

-- Teto de alunos por família (evita abuso; 10 cobre famílias grandes com folga).
create function public.students_check_limit() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.students s where s.owner_id = new.owner_id) >= 10 then
    raise exception 'limite de alunos por família' using errcode = '23514', hint = 'limit';
  end if;
  return new;
end;
$$;
create trigger students_check_limit_insert before insert on public.students
  for each row execute function public.students_check_limit();

-- Teto de listas salvas por família.
create function public.saved_lists_check_limit() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.saved_lists l where l.owner_id = new.owner_id) >= 50 then
    raise exception 'limite de listas salvas por família' using errcode = '23514', hint = 'limit';
  end if;
  return new;
end;
$$;
create trigger saved_lists_check_limit_insert before insert on public.saved_lists
  for each row execute function public.saved_lists_check_limit();

-- Só lista PUBLICADA pode ser salva, e só para aluno do MESMO dono da linha (a RLS já exige owner_id = auth.uid();
-- este gatilho impede um dono "emprestar" o id de um aluno que não é seu, mesmo que a RLS de students o esconda).
create function public.saved_lists_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.students s where s.id = new.student_id and s.owner_id = new.owner_id) then
    raise exception 'aluno não pertence a este responsável' using errcode = '42501';
  end if;
  if not exists (select 1 from public.school_lists l where l.id = new.list_id and l.status = 'published') then
    raise exception 'só é possível salvar lista publicada' using errcode = '23514', hint = 'list_not_published';
  end if;
  return new;
end;
$$;
create trigger saved_lists_guard_insert before insert on public.saved_lists
  for each row execute function public.saved_lists_guard();

-- ---------------------------------------------------------------------------
-- Grants (mínimos; RLS decide o resto)
-- ---------------------------------------------------------------------------
revoke all on public.students, public.saved_lists from anon, authenticated, service_role;
grant select, insert, update, delete on public.students to authenticated;
-- saved_lists não tem UPDATE: trocar é apagar e salvar de novo (evita reescrever aluno/lista da linha).
grant select, insert, delete on public.saved_lists to authenticated;
grant select, insert, update, delete on public.students, public.saved_lists to service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.students enable row level security;
alter table public.saved_lists enable row level security;

-- students: só o próprio responsável vê/edita/apaga; NINGUÉM MAIS (nem admin/system) — mínimo de dado de menor.
create policy students_select_own on public.students
  for select to authenticated using (owner_id = (select auth.uid()));
create policy students_insert_own on public.students
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy students_update_own on public.students
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy students_delete_own on public.students
  for delete to authenticated using (owner_id = (select auth.uid()));

-- saved_lists: mesmo padrão; sem policy de update (sem grant de update de qualquer forma).
create policy saved_lists_select_own on public.saved_lists
  for select to authenticated using (owner_id = (select auth.uid()));
create policy saved_lists_insert_own on public.saved_lists
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy saved_lists_delete_own on public.saved_lists
  for delete to authenticated using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Privilégios de EXECUTE: student_nickname_valid roda dentro do CHECK durante o INSERT/UPDATE do próprio dono
-- (precisa de EXECUTE para authenticated, como review_items_valid/0204); os gatilhos nunca são chamados direto.
-- ---------------------------------------------------------------------------
revoke execute on function public.student_nickname_valid(text) from public, anon;
grant execute on function public.student_nickname_valid(text) to authenticated, service_role;

revoke execute on function
  public.students_guard(), public.students_check_limit(), public.saved_lists_check_limit(), public.saved_lists_guard()
  from public, anon, authenticated, service_role;
