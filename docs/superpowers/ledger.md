# Ledger de decisões (Rulings)

Formato: `Ruling: <decisão> — <motivo> — <custo se estiver errada>`

- Ruling: projeto Supabase ListaEscolar é o staging; produção será outro projeto criado pelo humano — decisão explícita do humano em 24/09/2026 (resolve conflito entre ADR 0001 e SPEC/CLAUDE.md) — baixo: basta apontar novas variáveis de ambiente (ADR-003).
- Ruling: regra "Autonomia" gravada no CLAUDE.md, com prioridade sobre "pare e aponte ao humano" — pedido explícito do humano para valer entre sessões — custo: baixo, basta editar o CLAUDE.md.
- Ruling: toda mudança, inclusive CLAUDE.md e docs, segue branch → PR → revisão → merge; nunca push em main — pedido explícito do humano — custo: baixo, basta editar o CLAUDE.md.
- Ruling: worktrees ficam em ../listaescolar-wt/SNN (fora do repo) — evita risco de commitar a árvore (o .gitignore também lista .worktrees por segurança) — custo baixo: mover pastas.
- Ruling: Next 16 reescreve bloco nextjs-agent-rules no CLAUDE.md a cada dev/build/typegen — reverter com git checkout CLAUDE.md antes de commitar e conferir git status — custo: um commit acidental de bloco extra no CLAUDE.md
- Ruling: cada trilha paralela usa project_id e bloco de portas próprios do Supabase local (config.toml) — evita db:reset de uma trilha apagar o banco da outra — custo: ajuste de portas.
- Ruling: CI dispara em push só na main e em PRs para main — evita execução dupla por PR — custo: branch sem PR não roda CI.
- Ruling: `<Logo variant="horizontal">` compõe símbolo (SVG) + wordmark em texto HTML com a Plus Jakarta Sans, em vez de usar logo-horizontal.svg — texto dentro de <img> não carrega a webfont e cai em Arial; a geometria segue o SVG oficial; o layout deixa de ter header global (cada rota tem o seu) — custo: se a marca mudar o SVG, atualizar o componente; os arquivos logo-horizontal*.svg em public/brand seguem com fallback de fonte para OG/e-mail/PDF (gerar PNG nesses casos).
- Ruling: SENTRY_DSN inválido não pode derrubar getServerEnv — tratar na S01 (primeiro chamador) com .optional().catch(undefined) — custo: baixo.
- Ruling: nota de portas por trilha vai no README do Supabase; cada worktree usa `supabase start` com project_id/portas locais não commitados (git update-index --skip-worktree supabase/config.toml) — custo: baixo.
