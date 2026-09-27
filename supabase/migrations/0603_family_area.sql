-- 0603_family_area: estudantes e listas salvas da família (S15, fora de trilha; roda depois da S11).
-- FKs reais para grades/profiles/school_lists são permitidas aqui (pós-integração das trilhas, ADR-004).
-- Mínimo de dado de menor (CLAUDE.md/SPEC §5): SÓ apelido e série — nenhum outro dado do aluno, nem escola nem ano
-- letivo (isso pertence à lista salva, não ao aluno: um aluno pode ter listas salvas de escolas/anos diferentes).
-- Nenhuma política de leitura para admin/system (diferente de carts) — ninguém além do próprio responsável
-- enxerga estudantes.
--
-- Correções da revisão de segurança (rodada única, ver ledger.md "S15 · correções da revisão de segurança"):
-- 1) students perde school_id/school_year (regra SPEC §5: só apelido e série).
-- 2) student_nickname_valid fica mais estrito: só letras Unicode (um apóstrofo interno no máximo), rejeitando
--    hífen, ponto, sublinhado, arroba, dígito e caractere invisível/formatação (ex.: U+200B).
-- 2b) reverificação (Opus) em abf5f4e: `[[:alpha:]]` (POSIX, dependente de locale) e o `\p{L}` do Zod aceitam
--    "letra" Unicode que é invisível — os preenchedores de Hangul (U+115F, U+1160, U+3164, U+FFA0) e a
--    U+02BC (apóstrofo-letra) são categoria Lo/Lm, então passavam por "letra" sem ser uma. Restrito a script
--    Latino explícito (faixas A-Z/a-z, Latin-1 Supplement e Latin Extended-A acentuadas), que exclui as duas
--    faixas de Hangul e a U+02BC por construção — sem precisar listar caractere invisível um por um.
-- 3) students_check_limit/saved_lists_check_limit/saved_lists_guard passam de SECURITY DEFINER para SECURITY
--    INVOKER: rodando com o privilégio de quem chama, a RLS já escopa as consultas internas ao próprio dono, o
--    que fecha o oráculo (antes, um `owner_id` forjado no INSERT podia fazer o gatilho revelar, pela mensagem de
--    erro, se o aluno/dono alheio existe ou se o teto de outra família já foi atingido, ANTES de a RLS barrar a
--    escrita no fim da transação). service_role continua enxergando tudo (contorna RLS por natureza).
-- 4) GRANT de UPDATE em students só nas colunas editáveis (nickname, grade_id) — não em created_at/updated_at.
-- 5) Os dois tetos (10 alunos, 50 listas salvas) tomam um advisory lock por dono antes de contar, fechando a
--    corrida de duas inserções concorrentes passando do teto ao mesmo tempo (mesmo padrão de
--    hashtextextended('namespace:' || id, 0) já usado em claim_create/lead_create/stationery_register etc.).

-- ---------------------------------------------------------------------------
-- Validador do apelido (usado no CHECK, mesmo padrão de review_items_valid/0204): só letra LATINA (A-Z/a-z,
-- Latin-1 Supplement e Latin Extended-A acentuadas — cobre "João", "Ângela", "Çelo" e afins), com no máximo um
-- apóstrofo interno (ex.: "D'Alva"), 2-30 caracteres, já aparado. Qualquer outro caractere — espaço, hífen,
-- ponto, sublinhado, arroba, dígito, invisível/formatação (zero-width space etc.), OUTRO SCRIPT (cirílico etc.)
-- ou "letra" Unicode que não é letra de verdade (preenchedor de Hangul U+115F/U+1160/U+3164/U+FFA0, ou a
-- U+02BC apóstrofo-letra) — é recusado, porque nenhum deles cai nas faixas abaixo. Faixas usadas:
-- A-Za-z (ASCII), À-ÖØ-öø-ÿ (Latin-1 Supplement, pula × U+00D7 e ÷ U+00F7) e Ā-ſ (Latin Extended-A). Verificado
-- direto contra o Postgres local (locale en_US.UTF-8): as faixas casam por valor de código, não por ordenação de
-- locale. O app (Zod) usa `\p{Script=Latin}` (mesma exclusão) e normaliza NFC; troca o apóstrofo curvo (’) pelo
-- reto (') antes de gravar, então aqui só o reto precisa ser aceito.
-- ---------------------------------------------------------------------------
create function public.student_nickname_valid(p text) returns boolean
language sql immutable set search_path = ''
as $$
  select p is not null
     and p = btrim(p)
     and length(p) between 2 and 30
     and (p ~ '^[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]+$' or p ~ '^[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]+''[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]+$');
$$;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.students (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  nickname text not null check (public.student_nickname_valid(nickname)),
  grade_id uuid not null references public.grades (id) on delete restrict,
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

-- Identidade do aluno é imutável (id e dono nunca trocam); nickname/série podem ser editados pelo dono.
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

-- Teto de alunos por família (evita abuso; 10 cobre famílias grandes com folga). SECURITY INVOKER: a contagem já
-- roda com a RLS de quem chama (o dono só vê os próprios alunos; service_role vê todos, contorna RLS por
-- natureza) — nenhum owner_id forjado revela quantos alunos outra família tem. Lock por dono antes de contar:
-- duas inserções concorrentes do mesmo dono se serializam, então nenhuma passa do teto por corrida.
create function public.students_check_limit() returns trigger
language plpgsql set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('student_create:' || new.owner_id::text, 0));
  if (select count(*) from public.students s where s.owner_id = new.owner_id) >= 10 then
    raise exception 'limite de alunos por família' using errcode = '23514', hint = 'limit';
  end if;
  return new;
end;
$$;
create trigger students_check_limit_insert before insert on public.students
  for each row execute function public.students_check_limit();

-- Teto de listas salvas por família (mesmo raciocínio de SECURITY INVOKER + lock do teto acima).
create function public.saved_lists_check_limit() returns trigger
language plpgsql set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('saved_list_create:' || new.owner_id::text, 0));
  if (select count(*) from public.saved_lists l where l.owner_id = new.owner_id) >= 50 then
    raise exception 'limite de listas salvas por família' using errcode = '23514', hint = 'limit';
  end if;
  return new;
end;
$$;
create trigger saved_lists_check_limit_insert before insert on public.saved_lists
  for each row execute function public.saved_lists_check_limit();

-- Só lista PUBLICADA pode ser salva, e só para aluno do MESMO dono da linha. SECURITY INVOKER (não mais DEFINER):
-- a leitura de `students` já roda com a RLS de quem chama (o dono só enxerga o próprio aluno; um student_id
-- alheio nunca aparece na consulta, seja ele real ou inventado, então a mensagem de erro não distingue os dois
-- casos — fecha o oráculo que a versão anterior tinha, de revelar via SECURITY DEFINER se um id alheio existe).
-- `school_lists` é público para lista publicada (RLS já existente), então ler o status aqui não muda nada.
create function public.saved_lists_guard() returns trigger
language plpgsql set search_path = ''
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
grant select, insert, delete on public.students to authenticated;
-- UPDATE só nas colunas editáveis: nunca id/owner_id (o gatilho já bloqueia, isto é defesa em profundidade no
-- próprio grant) nem created_at/updated_at (updated_at é só do gatilho set_updated_at).
grant update (nickname, grade_id) on public.students to authenticated;
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
-- (precisa de EXECUTE para authenticated, como review_items_valid/0204); os gatilhos nunca são chamados direto
-- (SECURITY INVOKER ou não, disparo de gatilho não exige EXECUTE — só reforça contra chamada direta via RPC).
-- ---------------------------------------------------------------------------
revoke execute on function public.student_nickname_valid(text) from public, anon;
grant execute on function public.student_nickname_valid(text) to authenticated, service_role;

revoke execute on function
  public.students_guard(), public.students_check_limit(), public.saved_lists_check_limit(), public.saved_lists_guard()
  from public, anon, authenticated, service_role;
