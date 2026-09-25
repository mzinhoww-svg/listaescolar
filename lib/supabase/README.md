# Supabase local (dev)

O CLI sobe um Postgres/Auth/Storage local em Docker (Colima). Nada aqui toca o projeto remoto.
Proibido nesta fatia: `supabase link`, `supabase db push`. Staging só a partir da S01 (ADR-003).

## Comandos

- `pnpm db:start` sobe a stack local (`supabase start`).
- `pnpm db:reset` recria o banco do zero e reaplica `supabase/migrations` e `supabase/seed.sql`.
- `pnpm db:stop` derruba a stack.
- `pnpm test:db` roda `tests/db/**` (schema, RLS, auditoria) contra o Postgres local (`127.0.0.1:54322`; `SUPABASE_DB_URL` sobrescreve). Exige a stack no ar e migrations aplicadas (`pnpm db:reset`). `pnpm test` não roda esses testes.

## Migrations

Uma migration por fatia, em `supabase/migrations/NNNN_descricao_curta.sql` (sequência de 4 dígitos, minúsculas e `_`; ex.: `0001_base_schema.sql`). Não edite migration já aplicada em staging: crie a próxima. Toda tabela nova: `id uuid default gen_random_uuid()`, `created_at`, `updated_at`, RLS habilitada e políticas por comando e por papel; funções SECURITY DEFINER com `set search_path = ''` e nomes qualificados.

## Popular `.env.local` para dev local

O CLI local (2.x) gera chaves no formato novo. Rode `supabase status -o env` (ou `supabase status`) e copie, à mão, para `.env.local` (que é ignorado pelo git):

| `.env.local`                           | Saída do `supabase status`                       |
| -------------------------------------- | ------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`             | `API_URL` (http://127.0.0.1:54321)               |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `PUBLISHABLE_KEY` (começa com `sb_publishable_`) |
| `SUPABASE_SECRET_KEY`                  | `SECRET_KEY` (começa com `sb_secret_`)           |

Não cole valores neste repositório nem em docs. As chaves legadas (`ANON_KEY`, `SERVICE_ROLE_KEY`) não são usadas.

## Validação

`lib/env.public.ts` (`getPublicEnv`) e `lib/env.ts` (`getServerEnv`, só servidor) validam com Zod quando chamadas. Build e testes não exigem nenhuma variável.

## Trilhas paralelas
Cada worktree paralelo roda o seu próprio Supabase local. Na raiz do worktree: `node scripts/track-ports.mjs <índice 1-9>` (Dados=1, Pipeline=2, Comércio=3, Cobrança=4, B2B=5). O script troca `project_id` e as portas em `supabase/config.toml` e marca o arquivo com `skip-worktree` (nunca é commitado). O helper `tests/db/helpers.ts` lê a porta do Postgres desse arquivo, então `pnpm test:db` funciona sem variáveis. Use `pnpm exec supabase status` para ver as URLs (API, e-mail) da trilha. Índice 0 restaura o padrão. Depois de mudar o config, `pnpm db:stop && pnpm db:start`.
