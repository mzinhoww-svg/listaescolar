# ADR-003 · Projeto ListaEscolar é o staging; regra de autonomia

Data: 24/09/2026 · Status: aceita (decisão do humano) · Substitui `0001-sem-staging.md` (removido).

## Decisão
- O projeto Supabase `ListaEscolar` (ref `hojbnqkwzsicahzgshne`, região ca-central-1) é o **staging**. Migrations são aplicadas nele pelas trilhas.
- O projeto de **produção** será criado pelo humano. Migration ou remoção de dados em produção só com confirmação humana (S20).
- Dev local via Supabase CLI + Docker (Colima); `pnpm db:reset` é o gate de migrations do zero.
- Previews da Vercel usam o Supabase de staging. Dados de teste E2E usam e-mail `+e2e@`, escola fictícia (`is_demo = true`) e limpeza ao fim da suíte.

## Regra de autonomia
Todas as decisões técnicas e de produto são do Claude, registradas como Ruling no ledger. Exceções: produção, credenciais que só o humano tem, gasto de dinheiro. Ver seção "Autonomia" do CLAUDE.md.

## Consequências
- SPEC e CLAUDE.md, que falam em `staging` e `production`, passam a ser consistentes com o ambiente real.
