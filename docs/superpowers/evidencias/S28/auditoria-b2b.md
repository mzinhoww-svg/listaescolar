# Auditoria impeccable · B2B (parceiros)

Método: `impeccable` (audit + critique), build local na porta 3002 com Supabase local; agent-browser em 390x844 e 1280x800; sonda de DOM; leitura do código. Nenhum código alterado nesta fase. Severidade P0 a P3; "Resolve" aponta a task do plano `2026-09-28-s28-excelencia.md` ou item de `docs/MELHORIAS.md`. Semente `scripts/e2e-s24-seed.sql` e `e2e-s26-seed.sql` aplicadas ao banco local; conta `parent@listacerta.test` (dona do parceiro). Referência: B2B00 a B2B09. Rotas: `/parceiros`, `/parceiros/docs`, `/b2b`, `/b2b/{conta,api,docs,widget,webhooks,campanhas,campanhas/nova,insights,faturamento}`.

## Saúde

| Dimensão | Nota | Achado principal |
|---|---|---|
| Acessibilidade | 2 | Campo de cor do widget sem rótulo; alvos de 36 px; texto de 11 px em escopos e cabeçalhos |
| Desempenho | 3 | Não medido |
| Responsivo | 2 | Rolagem horizontal do documento em `/b2b/widget`, `/b2b/docs` e `/parceiros/docs` no celular |
| Tema | 3 | Tokens em uso; `#0B6B4A` e `#8a1c14` avulsos |
| Anti-padrões | 2 | Modelo "número grande + rótulo" na visão geral |
| **Total** | **12/20** | Aceitável; trabalho relevante |

## Achados

| ID | Sev. | Rota / arquivo | Achado | Resolve |
|---|---|---|---|---|
| B-01 | P1 | `/b2b/widget`, `app/b2b/widget/WidgetConfigForm.tsx` | No celular o formulário vaza para a direita (campo de domínio e texto de ajuda cortados, amostra de cor recortada). Campo de texto da cor sem rótulo associado (`nolabel: text`). Botão "Salvar" desabilitado em cinza sem explicar por quê. | Task 20 (M09) e Task 18 |
| B-02 | P1 | `/b2b/docs`, `/parceiros/docs`, `components/b2b/SchemaTable.tsx`, `EndpointDoc.tsx` | Tabelas de parâmetros sem `overflow-x-auto` no contêiner (`overflow: visible`): coluna "Descrição" cortada e rolagem horizontal da página no celular. Selos "escopo …" e cabeçalhos em 11 px. | Task 20 |
| B-03 | P2 | `/b2b` (B2B01) | Cartões "42 / 9 / indisponível / 5000" em fonte grande: modelo de métrica-herói; "indisponível" em corpo de título. Rótulos sem unidade nem período claros ("5000" de quê). | Task 14 (M14) |
| B-04 | P2 | `/b2b/api` | Sem exemplo copiável da primeira chamada com a chave sandbox e a resposta esperada. | M22 (pós-piloto), mantido |
| B-05 | P2 | `app/b2b/insights/InsightsExplorer.tsx`, `WidgetConfigForm.tsx` | Erros em texto solto com hex avulso; `divide-[#EFEBE2]` fora dos tokens. | Task 18 |
| B-06 | P2 | `app/b2b/campanhas/CampaignsTable.tsx`, `webhooks/ResendButton.tsx` | Botões `h-9` com fonte 12 px. | Task 20 |
| B-07 | P3 | `app/b2b/loading.tsx` | Spinner de tela cheia (`animate-spin` sem `motion-reduce`). | Task 17 |
| B-08 | P3 | `B2B_CAMPAIGN_TRACKING_SECRET` | Lida no código e ausente em `.env.example`/`lib/env.ts`. | Task 19 |

## Comparação com `docs/design`

B2B01 a B2B05 têm estrutura de casca escura e conteúdo em cartões; implementada. B2B03-Docs mostra tabelas dentro de cartão com rolagem; implementação não isola a rolagem (B-02).

## Contagem

P0 0, P1 2, P2 4, P3 2. Total 8.
