# Auditoria impeccable · Site público

Método: `impeccable` (audit + critique), build local na porta 3002 com Supabase local; agent-browser em 390x844 e 1280x800; sonda de DOM; leitura do código. Nenhum código alterado nesta fase. Severidade P0 a P3; "Resolve" aponta a task do plano `2026-09-28-s28-excelencia.md` ou item de `docs/MELHORIAS.md`. Rotas: `/`, `/como-funciona`, `/sobre`, `/termos`, `/privacidade`, `/parceiros`, `/403`, página 404, `/pesquisa`. `/l/[code]` não sondada (não há link curto semeado; lida no código). Referência: Landing, ComoFunciona, Sis01 a Sis07. Baseline: desempenho 93 a 99 e acessibilidade 100.

## Saúde

| Dimensão | Nota | Achado principal |
|---|---|---|
| Acessibilidade | 3 | `pesquisa` sem `main`; texto de 11 px em selos e canais |
| Desempenho | 4 | 93 a 99 no baseline |
| Responsivo | 3 | Campo de busca do hero espremido no celular |
| Tema | 4 | Tokens; `themeColor` em hex é adequado |
| Anti-padrões | 3 | Eyebrow "VOLTA ÀS AULAS" e cartões de passos repetidos; prova social ausente (correto) |
| **Total** | **17/20** | Bom |

## Achados

| ID | Sev. | Rota / arquivo | Achado | Resolve |
|---|---|---|---|---|
| S-01 | P1 | `/`, `Hero.tsx` | Ver F-02 (campo de busca no celular) e F-03 (sem escopo Cuiabá). | Task 8 e Task 13 |
| S-02 | P2 | `HeroListCard.tsx`, `ChannelsStrip.tsx` | Cartão promete "Mais barato" e mostra nomes de varejistas (Amazon, Kalunga) em 11 px: sugere parceria não existente; risco com a regra "nunca inventar parceria". | Task 8 e Task 11 |
| S-03 | P2 | `/pesquisa` | Sem landmark `main`; título da aba sem marca ("Pesquisa: a lista de material escolar"). | Task 20 |
| S-04 | P2 | `/(site)/*` | Topo com menu horizontal cortado no celular ("Pe…") sem indício de rolagem; `Perguntas` some. | Task 8 |
| S-05 | P3 | `components/site/*` | Sem movimento algum além de `Faq`; oportunidade de entrada suave e cartão do hero animado, com `motion-reduce`. | Task 8 (M10) |
| S-06 | P3 | `/entrar`, `/cadastrar-papelaria` | Links "Termos" e "Política de Privacidade" com 15 px de altura. | Task 20 |
| S-07 | P3 | 404/403 | Bons (CTA e texto claro); título "Esta página não está na lista" é jogo de palavras aceitável. | nenhum |

## Comparação com `docs/design`

Landing e ComoFunciona 1440/1600 são reproduzidas com fidelidade em 1280; 404 e 403 batem com Sis05/06.

## Contagem

P0 0, P1 1, P2 3, P3 3. Total 7.
