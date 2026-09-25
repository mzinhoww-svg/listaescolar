# PROGRESS

**Fatia atual:** S02 (PR #4 em revisão). Próxima: trilhas paralelas (Dados, Pipeline, Comércio).

## Concluídas
| Fatia | PR | SHA do merge | Gate |
|---|---|---|---|
| Docs (autonomia, ADR-003) | #1 | a952c0b | revisão + docs |
| S00 Fundação | #2 | a400899 | CI verde; E2E no build local (preview protegido) |
| S01 Schema base | #3 | e14ba7f | CI verde (verify + db), 88 testes de banco, migration aplicada no staging |
| S02 Auth | #4 | (preencher no próximo PR) | CI verde, 144 unitários + 95 de banco, E2E a–l no build local, migration 0002 aplicada no staging |

## Trilhas em andamento
(nenhuma)

## Bloqueios / pendências do humano
- Produção: projeto Supabase de produção ainda não existe (só o humano cria). Necessário apenas na S20.
- Preview da Vercel protegido: o agente não abre o preview no agent-browser. Ação do humano: liberar acesso (Trusted Sources/bypass) ou desativar a proteção só de Previews. Até lá o E2E roda no build local (Ruling no ledger).
- Credenciais: Pix, afiliados (MELI/Amazon), VAPID de produção, chave de produção do OpenRouter.
- Pepper do IP de auditoria (`app.audit_ip_pepper`): definir no staging/produção antes da S20 (preferir Vault).

## Ações do humano no Supabase hospedado (staging) para o login funcionar
- Authentication → URL Configuration: Site URL do ambiente e Redirect URLs com `/auth/confirm**`, `/auth/callback**` e o glob dos previews da Vercel.
- Authentication → Email Templates: `magic_link` e `confirmation` usando `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email` (modelo em `supabase/templates/`), ou desligar "Confirm email". Sem isso o link só funciona no mesmo navegador (fallback por `code`).
- Google OAuth: criar credenciais no console Google e ativar o provider no Supabase.
- Vercel: `NEXT_PUBLIC_SITE_URL` nos ambientes sem `VERCEL_PROJECT_PRODUCTION_URL` (domínio próprio).

## Notas operacionais
- Ferramentas: Colima + Docker, Supabase CLI e agent-browser instalados. Worktrees em `../listaescolar-wt/SNN`.
- Next 16 reescreve um bloco em CLAUDE.md: rode `git checkout CLAUDE.md` antes de commitar.
- Após mudar `supabase/config.toml` (auth), rode `pnpm db:stop && pnpm db:start`; `db:reset` sozinho não recarrega o auth.
- Banco local: `pnpm db:start`, `pnpm db:reset`, `pnpm test:db` (só banco local; o helper recusa host remoto).
- Staging (ref hojbnqkwzsicahzgshne): migrations 0001 (`base_schema`) e 0002 (`profile_on_signup`) aplicadas via MCP; tabelas com dono postgres, RLS ativa. Advisor: `auth_role()` executável por anon (aceito) e `rls_auto_enable()` (função da plataforma, não nossa).
- Trilhas paralelas: cada worktree precisa de project_id/portas próprios do Supabase local (README em lib/supabase).
- Subagentes: nunca despachar dois na mesma rodada no mesmo worktree (aconteceu na S01).

## Próximo passo
S02: Auth (Google e link mágico), profile `parent` por trigger em `auth.users`, middleware de rotas, páginas de login, 403 e 404. Depois trilhas paralelas Dados, Pipeline e Comércio.
