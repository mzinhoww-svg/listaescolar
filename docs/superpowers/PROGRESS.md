# PROGRESS

**Fatia atual:** S00 concluída no código (PR #2). Falta: CI verde no GitHub, preview da Vercel, E2E com screenshot e merge. Próxima: S01.

## Concluídas
(S00 assim que o PR #2 for mesclado)

## Trilhas em andamento
(nenhuma)

## Bloqueios / pendências do humano
- Produção: projeto Supabase de produção ainda não existe (só o humano cria). Necessário apenas na S20.
- Preview da Vercel protegido: o agente não consegue abrir o preview no agent-browser. Ação do humano: liberar acesso (Trusted Sources/bypass) ou desativar a proteção só de Previews. Até lá o E2E roda no build local (Ruling no ledger).
- Credenciais: Pix, afiliados (MELI/Amazon), VAPID de produção, chave de produção do OpenRouter.

## Notas operacionais
- Ferramentas: Colima + Docker, Supabase CLI e agent-browser instalados. Worktrees em `../listaescolar-wt/SNN`.
- Next 16 reescreve um bloco em CLAUDE.md: rode `git checkout CLAUDE.md` antes de commitar.
- Local Supabase: `pnpm db:start`, `pnpm db:reset` (ver `lib/supabase/README.md`).

## Próximo passo
Fechar a S00 (CI, preview, E2E, merge). Depois S01 e S02 em sequência.
