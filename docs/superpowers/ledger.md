# Ledger de decisões (Rulings)

Formato: `Ruling: <decisão> — <motivo> — <custo se estiver errada>`

- Ruling: projeto Supabase ListaEscolar é o staging; produção será outro projeto criado pelo humano — decisão explícita do humano em 24/09/2026, resolve conflito entre ADR 0001 e SPEC/CLAUDE.md — baixo: basta apontar novas variáveis de ambiente (ADR-003).
- Ruling: regra "Autonomia" gravada no CLAUDE.md, com prioridade sobre "pare e aponte ao humano" — pedido explícito do humano para valer entre sessões — nenhum.
- Ruling: Docker via Colima, Supabase CLI e agent-browser instalados por brew/npm globais — necessários para `db:reset`, testes de RLS e E2E, não há alternativa local — baixo: desinstalação.
