# Auditoria impeccable · Papelaria

Método: `impeccable` (audit + critique), build local na porta 3002 com Supabase local; agent-browser em 390x844 e 1280x800; sonda de DOM; leitura do código. Nenhum código alterado nesta fase. Severidade P0 a P3; "Resolve" aponta a task do plano `2026-09-28-s28-excelencia.md` ou item de `docs/MELHORIAS.md`. Contas de teste `s14a@listacerta.test` (semente `scripts/e2e-s14-seed.sql`). Referência: Pap01 a Pap08 (`Pap02m-Leads` para mobile). Rotas: `/cadastrar-papelaria`, `/papelaria`, `/papelaria/{areas,catalogo,creditos,desempenho,leads}`, `/papelarias/[slug]`. Não sondados por falta de dado semeado: `/papelaria/leads/[code]` e `/papelaria/creditos/faturas/[id]` (lidos só no código).

## Saúde

| Dimensão | Nota | Achado principal |
|---|---|---|
| Acessibilidade | 3 | Botões com `h-9`/`py-1.5` (36 px) nas tabelas; abas do menu com 43 px; página pública sem `main` |
| Desempenho | 3 | Baseline de `/papelaria` 93+ ; catálogo com tabela de 720 px |
| Responsivo | 2 | Catálogo com rolagem horizontal da página no celular; cartões de métrica estouram ("indisponível") |
| Tema | 3 | Tokens em uso; erro em hex avulso |
| Anti-padrões | 2 | Modelo "número grande + rótulo" nos cartões de métrica; verde em "0 vendas" |
| **Total** | **13/20** | Aceitável; trabalho relevante |

## Veredito de anti-padrões

Sem gradiente ou vidro. Falha leve: grade de métricas "número grande, rótulo pequeno" repetida (leads, vendas, saldo) no lugar da lista de leads com ação, que é o que a referência Pap02m mostra.

## Achados

| ID | Sev. | Rota / arquivo | Achado | Resolve |
|---|---|---|---|---|
| P-01 | P1 | `/papelaria/leads` mobile, `components/leads/*` | Referência Pap02m: lista de leads com "Detalhes" e "WhatsApp" à vista. Implementado: cinco cartões de métrica antes da lista; ação principal fora da primeira tela. | Task 15 (M12) |
| P-02 | P1 | `/papelaria/leads` mobile | "indisponível" em fonte grande ultrapassa o cartão (corte na borda de 390 px); "0 vendas declaradas" em verde-certo contraria "verde só onde algo está resolvido". | Task 15 e Task 18 |
| P-03 | P1 | `/papelaria/catalogo` mobile | Rolagem horizontal da página (largura 416 px em viewport de 390); tabela de 720 px dentro de `overflow-auto` sem indício, mas algo mais vaza. Campo "Item" sem placeholder nem exemplo. | Task 15 e Task 20 |
| P-04 | P1 | `/papelaria`, `StatusPanel.tsx` | Painel de status sem "próximo passo": não mostra o que falta para receber o primeiro lead (dados, áreas, catálogo). Histórico "Sem eventos ainda". Etapas todas em verde, inclusive as não concluídas. | Task 15 (M12) |
| P-05 | P2 | Casca da papelaria (`PanelShell.tsx`) | Cabeçalho escuro com logo, selo, menu e usuário ocupa cerca de 260 px de 844 no celular (30% da tela) antes do conteúdo. | Task 18 (M15) |
| P-06 | P2 | `components/payouts/*`, `app/b2b/webhooks/ResendButton.tsx` (tabelas de papelaria/repasse) | Botões `h-9` com fonte 12 a 13 px (36 px de altura), abaixo de 44 px. | Task 20 (M09) |
| P-07 | P2 | `/papelaria/creditos` | Sem plano publicado no staging: estado `billing_unavailable` precisa dizer o que acontece e quem resolve; nunca mostrar valor fixo. | Task 14 (M14) |
| P-08 | P2 | `/papelarias/[slug]` | Sem landmark `main`. Botão de WhatsApp verde-certo com texto tinta OK (8,2:1). | Task 20 |
| P-09 | P2 | `/cadastrar-papelaria` | Exige login como pai antes do formulário; passos (`Stepper`) com borda `#cfc9b8` avulsa; termos "passe" e "crédito" só depois. | Task 10 e Task 14 |
| P-10 | P3 | 12 arquivos com `text-[11px]` (`components/leads/StatusBadge.tsx`, `ItemsTable`) | Selos e datas em 11 px. | Task 20 |
| P-11 | P3 | `components/stationeries/*` | Termos "lead" e "conversão" de mercado na cara do dono da papelaria. | Task 14 (M14) |
| P-12 | P2 | Loading | `/papelaria`, `/papelaria/areas`, `/papelaria/desempenho` sem `loading.tsx`; `catalogo` e `creditos` têm; `admin/importacoes` usa spinner. | Task 17 (M07) |

## Comparação com `docs/design`

Pap02m (leads mobile), Pap04 (catálogo) e Pap06 (créditos) mostram lista, tabela e pacotes; a implementação preserva identidade e tokens, mas inverte a hierarquia no mobile (métricas antes da ação, P-01).

## Contagem

P0 0, P1 4, P2 6, P3 2. Total 12.
