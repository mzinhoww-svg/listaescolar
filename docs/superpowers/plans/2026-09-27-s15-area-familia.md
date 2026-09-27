# S15 · Área da família · Plano de implementação (fora de trilha, worktree T3, índice 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** `/conta` mostra, para a família: estudantes (só apelido e série), listas salvas, carrinhos e cotações
com status. Prompt do PLAN (§S15): "`/conta`: estudantes (só apelido e série), listas salvas, carrinhos e cotações
com status."

## Passo 0 (pré-condição, feito antes deste plano)
- Branch `slice/S15-area-familia` já criada de `main` em `d30849f` (S11 e S21–S24 dentro).
- Leitura de `CLAUDE.md`, `PROGRESS.md`, `PLAN.md` §S15, `SPEC.md` (§§1–6, família/menores/LGPD), `SCREENS.md`
  (App12-MinhaConta, App13-NovoAluno, App16-HubPais, App19-Historico → `/conta/*`), `DEBT.md` (D-029, D-082 com
  dono S15) e do que já existe em `/conta` (S02 `AreaPage`, S11 `notificacoes`, S22 `compras`), em `/cotacao`
  (S14/S22, já mostra as cotações da família COM status — `listMyLeads`/`StatusBadge`), em `carts` (S12,
  `features/cart/repository.ts`, sem função "listar carrinhos do dono") e em `school_lists`/`grades` (S05, post-S11
  com FK real permitida, `features/grades/catalog.ts`).

## Rulings de escopo (registrados aqui e no ledger antes de codar)
1. **`/cotacao` já cobre "cotações com status"** (S14/S22: `listMyLeads`, `StatusBadge`, valor só quando informado).
   Não duplicar: o hub de `/conta` só linka para lá. Only-new-code fica em estudantes, listas salvas e uma listagem
   de carrinhos (que não existia) — custo se errado: baixo, é só reexpor uma tela já correta.
2. **Migration na faixa "pós-trilhas" (`06xx`)**, próximo prefixo livre após `0602` (S11): `0603_family_area.sql`.
   S15 não é de trilha (PLAN: "S11 e S15 a S20 rodam depois do merge das três") e o Ruling do ledger já reserva
   `06xx` para isso — custo se errado: renomear o arquivo antes de aplicar em staging.
3. **`students`/`saved_lists` como CRUD direto por RLS (grants por tabela + `with check`), não por função RPC.**
   Mesmo padrão de `carts`/`cart_items` (S12): mutações via `createClient()` (sessão do usuário, RLS decide), sem
   `SECURITY DEFINER` de escrita. Motivo: a única regra cross-tabela é "lista salva precisa ser `published`" e
   "aluno da lista salva pertence ao mesmo dono", que cabem num gatilho `BEFORE INSERT` (`SECURITY DEFINER`,
   `search_path=''`, `EXECUTE` revogado de todos) — mais simples que uma função pública e mais barato de manter que
   `list_watch_add`-style (que existe porque resolve slug→id e devolve texto amigável; aqui o Zod resolve o slug no
   servidor antes do INSERT). Custo se errado: trocar por função é mecânico, sem migração de dado.
4. **Nenhuma política de leitura para admin/system em `students`/`saved_lists`.** Mínimo de dado de menor (CLAUDE.md):
   o painel do admin (S16) não pede visão de estudante por família; diferente de `carts`, que tem
   `carts_select_admin` para suporte. Se uma fatia futura precisar (ex.: suporte ao usuário), adiciona-se então,
   com Ruling próprio — custo se errado: uma migration aditiva com a policy que faltar.
5. **Apelido: valida em duas camadas.** Zod no Server Action (mensagem específica "Use só um apelido, sem
   sobrenome." quando há espaço) E `CHECK` no banco via `student_nickname_valid()` (defesa em profundidade, mesmo
   padrão de `review_items_valid`). Nenhum sobrenome, nenhum dígito, 2–30 caracteres, sem espaço (o espaço é o
   sinal prático de "nome e sobrenome"). Escola e série são obrigatórios no cadastro (tela App13 já mostra os dois
   preenchidos) — permite calcular a lista do aluno e ligar a `saved_lists`; sem os dois a família não consegue
   comparar a lista de qualquer forma.
6. **Exclusão do aluno é DELETE real** (LGPD, cascade em `saved_lists`); carrinhos não referenciam `students` (não
   existe FK carrinho→aluno nesta fatia — um carrinho pode servir a mais de um filho na mesma série; nenhuma tela
   pede essa amarração). Custo se errado: uma FK nullable futura, sem quebrar o que existe.
7. **"Salvar lista" fica em `/escolas/[inep]/[serie]`** (onde a família já vê a lista publicada), com um formulário
   pequeno "para qual aluno?" (`SaveListButton`), visível só a quem está logado E já tem pelo menos um aluno
   cadastrado; sem aluno, o botão vira link para `/conta/alunos/novo`.
8. **D-029 e D-082 (dono S15) são pequenos e cabem nesta fatia**: D-082 (sino de notificações só em `/conta`) —
   estender `PanelShell` (papelaria), `AdminShell` e `SchoolShell` com o mesmo contador; D-029 ("e mais N" quando
   `listCandidateStationeries` corta) — mensagem no fim da lista de papelarias candidatas. Ambos em Task 3 (baixo
   risco, sem migration).

## Global Constraints
- TypeScript strict, sem `any`; Zod em toda fronteira (Server Actions e schemas).
- Componente React ≤ 250 linhas; Server Components por padrão; `"use client"` só com interação.
- Migration `0603_family_area.sql`: uuid/`created_at`/`updated_at`, RLS em toda tabela (dono só vê/edita a própria),
  `SECURITY DEFINER` com `search_path=''` e `EXECUTE` revogado de `public/anon/authenticated` (e de `service_role`
  quando a função só é gatilho) em toda função nova, com teste de `has_function_privilege`. Nenhum dado de menor
  além de apelido/série; escola é permitida (endereço da lista, não do menor). Dado do estudante nunca aparece em
  lead, papelaria, webhook, notificação externa nem `audit_log` com valor legível além do necessário (o gatilho de
  auditoria genérico já mascara; conferir que `students`/`saved_lists` não entram em nenhuma dessas rotas de saída).
- Selo "Demonstração" onde `is_demo` (escola/lista/lead já carregam a flag; a tela de carrinhos reaproveita
  `cart.is_demo`).

## Review Focus
- Nickname: espaço, dígito, controle e limites de tamanho recusados nas DUAS camadas (Zod e `CHECK`).
- `saved_lists`: só lista `published`; aluno da linha pertence ao mesmo `owner_id` da linha (gatilho, não só RLS).
- `students`/`saved_lists`: `has_function_privilege('authenticated', ..., 'EXECUTE')` falso para os gatilhos;
  verdadeiro só para `student_nickname_valid` (chamada dentro do `CHECK` durante o INSERT/UPDATE do próprio dono).
- DELETE de aluno remove `saved_lists` dele (cascade) e não deixa vestígio de apelido em `audit_log` com valor
  legível fora do necessário.
- `/conta` continua funcionando para os quatro papéis (`parent`, `school_member`, `admin`, `stationery_member`);
  seções de família só aparecem para quem tem 1+ aluno OU oferecem "Adicionar aluno" a qualquer papel logado.

## Task 1: Migration 0603 e testes de banco (TDD)

- [ ] Step 1: Testes vermelhos em `tests/db/family-area.test.ts` (novo): tabelas com `id/created_at/updated_at` e
  RLS habilitada; `student_nickname_valid` (aceita "Maria", "Ana-Clara"; recusa espaço, dígito, vazio, >30, string
  de controle); CHECK do nickname na tabela; dono cria/edita/apaga só o próprio aluno (RLS: `parent` não vê aluno
  de `spare`); update não muda `owner_id`/`id` (gatilho); DELETE cascade remove `saved_lists` do aluno;
  `saved_lists`: insere só lista `status='published'` (recusa `draft`/`archived`/inexistente) e só aluno do MESMO
  dono da linha (gatilho recusa aluno de outro perfil mesmo que o dono minta o `student_id` — teste via
  `withClaims`); sem UPDATE grantado (só INSERT/DELETE/SELECT); unique (`student_id`,`list_id`) evita duplicata;
  limite de 10 alunos e 50 listas salvas por dono (gatilho); `has_function_privilege` falso para
  `anon`/`authenticated`/`service_role` nos gatilhos, verdadeiro para `authenticated`/`service_role` em
  `student_nickname_valid`; FKs reais para `schools`/`grades`/`profiles`/`school_lists` (permitido pós-S11).
- [ ] Step 2: Implementar `supabase/migrations/0603_family_area.sql` até o Step 1 passar. `pnpm db:reset` (duas
  vezes) + `pnpm test:db` completo verde (sem quebrar nenhuma suíte existente). Commit
  `feat(db): estudantes e listas salvas da área da família (S15)`. Push.

## Task 2: Domínio e telas (TDD)

- [ ] Step 1: Testes vermelhos: `features/students/schemas.test.ts` (nickname: obrigatório, sem sobrenome, sem
  dígito, tamanho; grade slug válido; ano dentro de `academicYears`); `features/students/repository.test.ts` (roda
  em `pnpm test:db`, contra o banco real, com o cliente de sessão) cobrindo criar/listar/editar/apagar; idem para
  `features/saved-lists/*`; `features/cart/repository.test.ts` (nova função `listCartsForOwner`, ordenação por
  `created_at desc`, só do dono).
- [ ] Step 2: Implementar `features/students/{schemas,repository,queries}.ts`, `features/saved-lists/{schemas,repository,queries}.ts`,
  `features/cart/repository.ts` (`listCartsForOwner`). Telas: reescrever `/conta` (hub: alunos com "Adicionar",
  listas salvas, carrinhos recentes com link para `/carrinho/[id]`, atalho para `/cotacao`, mantendo o que já
  existe — perfil, papel — para os quatro perfis); `/conta/alunos/novo` (App13: `SchoolSearchPicker` obrigatório +
  seletor de série por `GRADES`/slug + ano via `academicYears`/`defaultAcademicYear` + consentimento); `/conta/alunos/[id]/editar`
  (editar e excluir, com confirmação); `/conta/carrinhos` (lista completa); `SaveListButton` em
  `/escolas/[inep]/[serie]` (Ruling 7). `pnpm typecheck && pnpm lint && pnpm test && pnpm test:db`. Commit
  `feat(students): estudantes, listas salvas e hub da área da família (S15)`. Push.

## Task 3: D-029/D-082, E2E e fechamento

- [ ] Step 1: D-082 (sino em `PanelShell`/`AdminShell`/`SchoolShell`) e D-029 ("e mais N" candidatas) — pequenas,
  com teste unitário cada. `pnpm typecheck && pnpm lint && pnpm test && pnpm test:db && pnpm build`.
- [ ] Step 2: E2E com agent-browser no build de produção local (`scripts/e2e-s15.sh`): família cria aluno (apelido
  com espaço é recusado com a mensagem certa), busca escola, salva a série; busca uma lista publicada e salva para
  o aluno; hub mostra aluno, lista salva e carrinho recente; edita e depois apaga o aluno (lista salva some
  também); `/cotacao` segue acessível pelo hub. Screenshots em `docs/superpowers/e2e/screenshots/S15-*.png`;
  roteiro em `docs/superpowers/e2e/S15.md`. Commit `feat(students): D-029/D-082 e E2E da área da família (S15)`.
  Push.
- [ ] Step 3: `docs/superpowers/ledger.md` (S15 não é de trilha) com os Rulings acima; `DEBT.md` com dívida nova
  (IDs a partir do maior existente) e fechamento de D-029/D-082; `.superpowers/sdd/2026-09-27-s15-area-familia/final-report.md`;
  `PROGRESS.md`. Merge com `origin/main` (união nos docs, renumerar IDs colididos) e push. Sem PR (instrução da
  tarefa).
