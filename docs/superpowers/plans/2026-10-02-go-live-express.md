# Plano · Go-Live Express

Escopo: `docs/GO-LIVE-EXPRESS.md`. Cada trilha em worktree próprio, commit e push por tarefa, PR com squash.

## T1 · Integração
- T1.1 Rebasear `slice/S28-excelencia-produto` na main (PR #56 está DIRTY), resolver conflitos, rodar `pnpm typecheck && pnpm lint && pnpm test`. Pronto: PR #56 verde e mergeável.
- T1.2 `gh pr merge 56 --auto --squash`; se barrado, item na fila "Aguardando humano".
- T1.3 Mesma checagem para `slice/S20-producao` (`scripts/prod-migrate.mjs`, `docs/GO-LIVE.md`) e `slice/S20-dividas-altas`: abrir PR e trazer para a main (requisito de T4).

## T2 · Login D-163
- T2.1 `features/auth/**`: schema Zod do código, action `verifyOtp` (type email), mesma tela do link. Teste Vitest.
- T2.2 Detector de navegador embutido (WhatsApp, Instagram, Facebook) + botão "abrir no navegador". Teste Vitest com user agents reais.
- T2.3 `supabase/templates/magic_link.html` (e `confirmation.html`) com `{{ .Token }}`. Documentar a aplicação no Auth hospedado.
- T2.4 `scripts/e2e-login-codigo.sh`: E2E com user agent do WhatsApp. Pronto: roteiro verde.
- T2.5 Revisão de segurança Opus (rate limit, enumeração de e-mail, expiração).

## T3 · Flags e conteúdo
- T3.1 Flags `BILLING_ENABLED`, `AFFILIATE_TAGS_ENABLED`, `AI_AUTOPUBLISH_ENABLED`, `B2B_CAMPAIGNS_ENABLED`; PostHog só com chave. Padrão desligado em produção. Testes.
- T3.2 Isolar seeds de demonstração: nada de `is_demo = true` em produção; guarda no seed e verificação no smoke.
- T3.3 Termos e privacidade com dados do controlador em placeholder sinalizado ("PREENCHER: ...").

## T4 · Produção (bloqueada pela criação do projeto pelo humano)
- T4.1 Pré-checagem: backup ou banco vazio; `prod-migrate --dry-run`.
- T4.2 `prod-migrate --apply`; importação INEP (MT) com o procedimento do staging.
- T4.3 pg_cron e Vault com segredos gerados no banco; publicar `ocr-worker` em produção.
- T4.4 Variáveis de Production na Vercel; Ignored Build Step para commits só de docs.
- T4.5 `docs/GO-LIVE.md` com rollback. Revisão de segurança Opus.
- Executável sem o projeto: T4.4 (ignored build step) e T4.5.

## T5 · Verificação (após T2, T3, T4)
- Smoke E2E na URL de produção (família no celular, papelaria, escola, admin, login por código).
- Lighthouse e axe nas páginas principais; robots/indexação só com `SITE_INDEXING=1`.
- Revisão final única antes de abrir.
