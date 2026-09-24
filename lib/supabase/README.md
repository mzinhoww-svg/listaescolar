# Supabase local (dev)

O CLI sobe um Postgres/Auth/Storage local em Docker (Colima). Nada aqui toca o projeto remoto.
Proibido nesta fatia: `supabase link`, `supabase db push`. Staging só a partir da S01 (ADR-003).

## Comandos

- `pnpm db:start` sobe a stack local (`supabase start`).
- `pnpm db:reset` recria o banco do zero e reaplica `supabase/migrations` e `supabase/seed.sql`.
- `pnpm db:stop` derruba a stack.

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
