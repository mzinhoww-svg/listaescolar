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
Cada worktree paralelo roda o seu próprio Supabase local, sem editar `supabase/config.toml`. Crie o arquivo `.track` (gitignored) na raiz do worktree com o índice da trilha (Dados=1, Pipeline=2, Comércio=3, Cobrança=4, B2B=5) ou exporte `TRACK=<n>`. Os scripts `pnpm db:start|stop|reset|status` passam por `scripts/supa.mjs`, que gera a cada execução `.track-workdir/supabase/config.toml` (project_id `listacerta-t<n>` e portas +100·n; app em `3000+n`) e roda o CLI com `--workdir`. Nada do config versionado é alterado, então editar `config.toml` (buckets, funções, templates) e fazer rebase continuam normais.
- `pnpm test:db` lê a porta do Postgres do config da trilha.
- `pnpm db:env` imprime as variáveis para o `.env.local` da trilha (URL, chaves e `NEXT_PUBLIC_SITE_URL`); rode o app com `PORT=$((3000+TRACK)) pnpm dev` (ou `next start -p`).
- Derrubar uma trilha: `TRACK=<n> pnpm db:stop -- --no-backup`.
- Após mudar `supabase/config.toml`, `pnpm db:stop && pnpm db:start`.
- Ambiente da máquina (não versionado): Colima com 10 GB (`colima stop && colima start --cpu 4 --memory 10 --disk 40`); três stacks leves cabem.
