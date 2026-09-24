# Ledger de decisões (Rulings)

Formato: `Ruling: <decisão> — <motivo> — <custo se estiver errada>`

- Ruling: projeto Supabase ListaEscolar é o staging; produção será outro projeto criado pelo humano — decisão explícita do humano em 24/09/2026 (resolve conflito entre ADR 0001 e SPEC/CLAUDE.md) — baixo: basta apontar novas variáveis de ambiente (ADR-003).
- Ruling: regra "Autonomia" gravada no CLAUDE.md, com prioridade sobre "pare e aponte ao humano" — pedido explícito do humano para valer entre sessões — custo: baixo, basta editar o CLAUDE.md.
- Ruling: toda mudança, inclusive CLAUDE.md e docs, segue branch → PR → revisão → merge; nunca push em main — pedido explícito do humano — custo: baixo, basta editar o CLAUDE.md.
- Ruling: worktrees ficam em ../listaescolar-wt/SNN (fora do repo) — evita risco de commitar a árvore e dispensa .gitignore — custo baixo: mover pastas.
