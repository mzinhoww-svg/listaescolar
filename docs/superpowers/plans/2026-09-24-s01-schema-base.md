# S01 · Schema base, perfis e auditoria · Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Migration `0001` com enums do spec (seção 4), tabelas `municipalities`, `profiles`, `audit_log`, função `auth_role()` SECURITY DEFINER, trigger genérico de auditoria, RLS em tudo, seed de Cuiabá habilitado e testes Vitest das políticas para os 5 perfis (mais anônimo) contra o Supabase local.

**Architecture:** Uma migration SQL em `supabase/migrations/0001_base_schema.sql`. Testes de integração em `tests/db/` usando `pg` direto no Postgres local (porta 54322), simulando cada perfil com `set local role` + `request.jwt.claims` dentro de transação com rollback. RLS é a fronteira de segurança; nenhuma política depende do cliente.

**Tech Stack:** PostgreSQL 17 (Supabase local), Supabase CLI, Vitest, `pg` (devDependency), GitHub Actions.

**Spec:** `docs/SPEC.md` seções 3, 4, 5 (Localização, Transversais/audit_log) e 8; `docs/PLAN.md` S01.

## Global Constraints
- Migrations em `supabase/migrations`, uma por fatia; nome `NNNN_nome.sql` (S01 = `0001`; trilhas: Dados 01xx, Pipeline 02xx, Comércio 03xx, Cobrança 04xx, B2B 05xx; pós-trilhas 06xx).
- Toda tabela: `id uuid primary key default gen_random_uuid()` (exceção `profiles.id`, que é `references auth.users(id)`), `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` (trigger `set_updated_at`), **RLS habilitada**.
- Perfis: `parent`, `school_member`, `admin`, `stationery_member`, `system` (service role, só servidor). `auth_role()` é SECURITY DEFINER com `set search_path = ''`.
- Chaves Supabase novas; nunca usar os nomes anon/service_role em código TS (no SQL, os roles do Postgres `anon`, `authenticated` e `service_role` são nomes internos e podem aparecer).
- `audit_log` é append-only: nenhum perfil, nem admin, faz UPDATE/DELETE. IP só em hash. Sem dados pessoais além de ids.
- Enums exatamente como o spec seção 4: `verification_status` (registered, claimed, verified, suspended), `claim_status` (submitted, awaiting_verification, token_expired, insufficient_evidence, rejected, approved), `claim_method` (institutional_email, institutional_whatsapp, documents), `list_status` (draft, submitted, processing, processing_async, review_needed, human_review, approved, published, archived, rejected), `stationery_status` (signup, accreditation, under_review, approved, active, paused, suspended, rejected), `lead_status` (received, viewed, in_progress, quote_sent, awaiting_customer, converted, declined, expired, cancelled), `job_status` (queued, running, succeeded, failed, retrying, dead), mais `user_role` e `registry_source` (inep_import, admin_manual, school_claim).
- Seed: Cuiabá/MT, código IBGE 5103403, `is_enabled = true`. Nenhum outro município habilitado. Nenhum dado de escola.
- Componentes/TS: n/a nesta fatia além dos testes (strict, sem `any`).

## Review Focus
- Escalada de privilégio: um `parent` não pode mudar o próprio `role` (UPDATE em `profiles`), nem inserir profile com role diferente, nem ler profiles alheios.
- Usuário sem profile (JWT válido, sem linha em `profiles`): `auth_role()` retorna NULL e nenhuma política o trata como admin.
- Anônimo: só lê municípios habilitados; não lê `profiles` nem `audit_log`.
- `audit_log` não pode ser alterado nem apagado nem por admin nem por `system`; o trigger registra INSERT/UPDATE/DELETE com before/after e ator; falha do trigger não pode ser contornada por role comum.
- `db:reset` do zero repetido duas vezes dá o mesmo resultado (seed idempotente).

---

### Task 1: Migration 0001 e testes de RLS (TDD)
**Files:** Create `supabase/migrations/0001_base_schema.sql`, `supabase/seed.sql` (modify: seed de Cuiabá vive na migration para existir em qualquer ambiente; seed.sql fica só com comentário), `tests/db/helpers.ts`, `tests/db/schema.test.ts`, `tests/db/rls-profiles.test.ts`, `tests/db/rls-municipalities.test.ts`, `tests/db/audit.test.ts`; Modify `package.json` (+`pg`, `@types/pg`, script `test:db`), `vitest.config.ts` (testes `tests/db/**` com `testTimeout` 30s e `fileParallelism` desligado para esse grupo, ou projeto Vitest separado), `lib/supabase/README.md`.
**Interfaces:** Produces `withClaims(identity, fn)` em `tests/db/helpers.ts`: abre transação, `set local role` (`anon` | `authenticated` | `service_role`), define `request.jwt.claims` com `sub` e `role`, executa `fn(client)` e faz `rollback` sempre. Identidades: `anon`, `parent`, `school_member`, `admin`, `stationery_member`, `system`, `orphan` (autenticado sem profile). `seedUsers()` cria via conexão superuser (`postgres`) um `auth.users` + `profiles` por perfil com ids fixos, dentro de `beforeAll`, e limpa em `afterAll`. `DATABASE_URL` padrão `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (env `SUPABASE_DB_URL` sobrescreve).
- [ ] Step 1: Escrever primeiro `schema.test.ts` (falha): existem os enums com os valores exatos acima; existem as tabelas `municipalities`, `profiles`, `audit_log`; **toda** tabela do schema `public` tem `relrowsecurity = true` (consulta a `pg_class`); toda tabela tem `created_at` e `updated_at`; `municipalities` contém Cuiabá (5103403, MT) habilitado e nenhum outro habilitado. Rodar e ver falhar.
- [ ] Step 2: Escrever `rls-profiles.test.ts` e `rls-municipalities.test.ts` (falham) cobrindo a matriz abaixo por identidade; escrever `audit.test.ts`.
  - `municipalities`: anon/parent/school/stationery leem só `is_enabled = true`; admin e system leem todas; INSERT/UPDATE/DELETE só admin e system (os demais recebem erro de RLS ou 0 linhas).
  - `profiles`: cada usuário lê só a própria linha; admin e system leem todas; `parent` tenta `update profiles set role='admin'` na própria linha e falha (erro ou 0 linhas e role inalterado); `parent` atualiza `display_name` próprio com sucesso; INSERT só por `system`/admin; DELETE só `system`; `orphan` não lê nada; `anon` não lê nada.
  - `auth_role()`: retorna o papel de cada identidade; `orphan` e `anon` retornam NULL; `system` retorna `system`.
  - `audit_log`: só admin e system leem; ninguém (incluindo admin e system) executa UPDATE/DELETE (tentativa falha ou afeta 0 linhas e a linha permanece); update em `municipalities` gera linha em `audit_log` com `action`, `entity_table`, `entity_id`, `before`, `after`, `actor_id` (o `sub` do JWT) e `actor_role`; `ip_hash` nunca contém o IP em claro.
- [ ] Step 3: Implementar `0001_base_schema.sql`: enums, `set_updated_at()`, `municipalities`, `profiles`, `audit_log`, `auth_role()` (SECURITY DEFINER, `search_path = ''`, `stable`, retorna `public.user_role`; `system` quando o role do JWT é `service_role`; senão o role do profile ou NULL), `audit_row_change()` (trigger genérico SECURITY DEFINER que grava no `audit_log`; ator via `auth.uid()`; IP em hash sha256 de `x-forwarded-for` lido de `request.headers` quando existir, senão NULL), triggers de `updated_at` e de auditoria em `municipalities` e `profiles`, trigger que impede mudança de `profiles.role` por quem não é admin/system, `alter table ... enable row level security` + `force` onde aplicável, políticas conforme a matriz, `revoke all` em `audit_log` de `anon`/`authenticated` exceto `select` via política, seed de Cuiabá com `on conflict do nothing`. Comentar cada política em uma linha.
- [ ] Step 4: `pnpm db:reset` duas vezes seguidas (idempotência), depois `pnpm test:db` até passar. Rodar `pnpm typecheck && pnpm lint && pnpm test`.
- [ ] Step 5: Atualizar `lib/supabase/README.md` (como rodar `test:db`, convenção de nomes de migration). Commit `feat(db): schema base, perfis, auditoria e RLS (S01)`.

### Task 2: CI do banco e staging
**Files:** Modify `.github/workflows/ci.yml`; Create `docs/superpowers/e2e/S01.md`.
- [ ] Step 1: Novo job `db` no CI: `supabase/setup-cli@v1`, `supabase start` (sem serviços de que não precisamos: `-x imgproxy,pooler,studio,mailpit,edge-runtime,logflare,vector` conforme aceitos pela versão), `supabase db reset`, `pnpm install --frozen-lockfile`, `pnpm test:db`; `pnpm test` (unit) segue no job `verify` sem banco. O job `verify` não pode depender do banco.
- [ ] Step 2: `docs/superpowers/e2e/S01.md`: S01 não tem UI; o roteiro é `pnpm db:reset && pnpm test:db` e a verificação do staging (tabelas e RLS via SQL de leitura).
- [ ] Step 3: Push, PR, CI verde nos dois jobs.

(A aplicação da migration no staging é feita pelo controlador após a revisão final, via Supabase MCP no projeto ListaEscolar, com verificação de RLS pelos advisors.)
