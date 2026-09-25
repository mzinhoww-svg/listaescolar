# PROGRESS

**Fatia atual:** S01 (PR #3, migration aplicada no staging). Próxima: S02.

## Concluídas
| Fatia | PR | SHA do merge | Gate |
|---|---|---|---|
| Docs (autonomia, ADR-003) | #1 | a952c0b | revisão + docs |
| S00 Fundação | #2 | a400899 | CI verde; E2E no build local (preview protegido) |
| S01 Schema base | #3 | (preencher no próximo PR) | CI verde (verify + db), 88 testes de banco, migration aplicada no staging |

## Trilhas em andamento
(nenhuma)

## Bloqueios / pendências do humano
- Produção: projeto Supabase de produção ainda não existe (só o humano cria). Necessário apenas na S20.
- Preview da Vercel protegido: o agente não abre o preview no agent-browser. Ação do humano: liberar acesso (Trusted Sources/bypass) ou desativar a proteção só de Previews. Até lá o E2E roda no build local (Ruling no ledger).
- Credenciais: Pix, afiliados (MELI/Amazon), VAPID de produção, chave de produção do OpenRouter.
- Pepper do IP de auditoria (`app.audit_ip_pepper`): definir no staging/produção antes da S20 (preferir Vault).

## Notas operacionais
- Ferramentas: Colima + Docker, Supabase CLI e agent-browser instalados. Worktrees em `../listaescolar-wt/SNN`.
- Next 16 reescreve um bloco em CLAUDE.md: rode `git checkout CLAUDE.md` antes de commitar.
- Banco local: `pnpm db:start`, `pnpm db:reset`, `pnpm test:db` (só banco local; o helper recusa host remoto).
- Staging (ref hojbnqkwzsicahzgshne): migration 0001 aplicada via MCP como `base_schema`; tabelas com dono postgres, RLS ativa. Advisor: `auth_role()` executável por anon (aceito) e `rls_auto_enable()` (função da plataforma, não nossa).
- Trilhas paralelas: cada worktree precisa de project_id/portas próprios do Supabase local (README em lib/supabase).
- Subagentes: nunca despachar dois na mesma rodada no mesmo worktree (aconteceu na S01).

## Próximo passo
S02: Auth (Google e link mágico), profile `parent` por trigger em `auth.users`, middleware de rotas, páginas de login, 403 e 404. Depois trilhas paralelas Dados, Pipeline e Comércio.
