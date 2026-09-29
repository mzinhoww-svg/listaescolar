# ADR-008 · Revisão total de UX e UI antes do go-live (S29)

Data: 29/09/2026 · Status: **proposta** (pedida pelo humano, Aurimar Nogueira, em mensagem de sessão; o spec e o plano aguardam a revisão dele antes de qualquer código) · Não altera ADR-001 a ADR-007.

## Contexto
A S28 (ADR-006) auditou e corrigiu cada área em separado e implementou o top 15. Não houve revisão das jornadas que atravessam públicos (família → papelaria → família; escola → família), nem aplicação do sistema de botões, feedback e movimento às 81 rotas. O humano pediu uma revisão total de telas, fluxos, botões e movimentos com `/impeccable`, `/ui-ux-pro-max` e `/tripled-ui`.

## Decisão
1. Nova fatia **S29 · Revisão total de UX e UI**, fora da numeração original, depois do merge da S19 (#55) e da S28 (#56).
2. Spec: `docs/superpowers/specs/2026-09-29-s29-revisao-total-ux-design.md`. Plano: `docs/superpowers/plans/2026-09-29-s29-revisao-total-ux.md`.
3. Unidade de trabalho: 9 jornadas ponta a ponta. J1–J6, J9 e o núcleo de J7 bloqueiam o go-live (S20); J8 e o resto de J7 podem terminar em paralelo com a S20, com Ruling.
4. Marca fechada (ADR-006). O `DESIGN.md` segue fonte única e ganha os sistemas de botões, feedback e movimento.

## Consequências
- O go-live (S20) passa a exigir a S29 mesclada nas jornadas piloto.
- Custo: mais uma fatia antes do piloto. Ganho: costuras entre públicos revisadas e sistema aplicado por inteiro.
