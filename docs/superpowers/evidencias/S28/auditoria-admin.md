# Auditoria impeccable · Admin

Método: `impeccable` (audit + critique), build local na porta 3002 com Supabase local; agent-browser em 390x844 e 1280x800; sonda de DOM; leitura do código. Nenhum código alterado nesta fase. Severidade P0 a P3; "Resolve" aponta a task do plano `2026-09-28-s28-excelencia.md` ou item de `docs/MELHORIAS.md`. Conta `admin@listacerta.test`. Referência: Admin01 a Admin16 (desktop 1280). Rotas sondadas: as 15 do menu mais `/admin/parceiros/[id]` e `/admin/papelarias/[id]`; não sondados por falta de dado: `/admin/revisao/[id]`, `/admin/listas/[id]`, `/admin/denuncias/[id]`, `/admin/reivindicacoes/[id]`, `/admin/importacoes/[batchId]`.

## Saúde

| Dimensão | Nota | Achado principal |
|---|---|---|
| Acessibilidade | 3 | Cabeçalhos e botões em 11 a 13 px; menu com 43 px de altura; tabela larga sem legenda de rolagem |
| Desempenho | 3 | Não medido (baseline não cobre admin) |
| Responsivo | 1 | Em 390 px todas as 17 rotas têm rolagem horizontal; barra lateral fixa de 248 px deixa cerca de 140 px ao conteúdo |
| Tema | 3 | Tokens em uso; hex avulsos de erro (`#8a1c14`, `#fde2e0`) em 8 arquivos |
| Anti-padrões | 3 | Sem tiques; cartões de mesma forma no painel |
| **Total** | **13/20** | Aceitável; trabalho relevante (mas é área interna, desktop) |

## Achados

| ID | Sev. | Rota / arquivo | Achado | Resolve |
|---|---|---|---|---|
| A-01 | P1 | `components/admin/AdminShell.tsx` (todas as rotas `/admin/*`) | No celular a barra lateral de 248 px não recolhe: conteúdo com cerca de 140 px, títulos quebram letra a letra ("Eventos (auditoria)"), formulários e tabelas ilegíveis; rolagem horizontal em 17 de 17 rotas. Uso previsto é desktop, mas admin costuma ser aberto no celular para tarefas curtas (aprovar, revisar). | Novo M34 (menu recolhível abaixo de 768 px); Task 18 |
| A-02 | P2 | `AdminShell.tsx` | Menu plano com 15 itens sem grupos; a barra não é fixa, então some ao rolar páginas longas; no 1280x800 o último item fica fora da primeira tela. | M34 e Task 18 |
| A-03 | P2 | `/admin` (Admin01) | Painel só conta registros ("Nenhum registro ainda"); não destaca o que exige ação (reivindicações pendentes, listas na fila, contestações abertas). | Novo M35 (fila de atenção no painel) |
| A-04 | P2 | `/admin/eventos` | Tabela de 2422 px com JSON cru em 11 px monoespaçado; colunas "Antes/Depois" ilegíveis; sem indício visível de rolagem. | Task 20 e M35 |
| A-05 | P2 | `/admin/planos` (`TierFields.tsx`) | Rótulos de coluna em 11 px caixa alta ("DE (ITENS)", "ATÉ (ITENS, VAZIO = ABERTA)") e campos "De" sem placeholder; ajuda em jargão. | Task 14 e Task 20 |
| A-06 | P2 | `app/admin/denuncias/page.tsx`, `components/payouts/*` | Filtros e botões com `py-1.5`/`h-9` (menos de 44 px). Menu com 43 px (1 px abaixo). | Task 20 |
| A-07 | P2 | 8 arquivos (`PendingCampaignRow.tsx`, `app/admin/listas/[id]/page.tsx`, `app/admin/parceiros/[id]/page.tsx`) | Hex avulsos de erro em vez dos tokens `erro-fundo`/`erro-texto`. | Task 18 (M15) |
| A-08 | P2 | `components/claims/ActionForm.tsx` | Confirmação por `window.confirm` nativo em ação destrutiva; `AdminRevokeButton` usa `<dialog>` (padrão bom). Dois padrões. | Task 18 |
| A-09 | P3 | `app/admin/importacoes/(lista)/loading.tsx`, `app/b2b/loading.tsx` | Spinner de tela cheia em `importacoes`; demais rotas admin sem `loading.tsx`. | Task 17 (M07) |
| A-10 | P3 | `/admin/*` | Rótulos de menu técnicos ("Auditoria de conversão", "Eventos (auditoria)") sem agrupamento por tarefa. | M34 |

## Comparação com `docs/design`

Admin01, 02 e 08 (desktop) batem em estrutura e tokens; a barra lateral, o cabeçalho e as tabelas seguem o desenho. Divergência: as telas só foram desenhadas em 1280; não há regra para 390.

## Contagem

P0 0, P1 1, P2 7, P3 2. Total 10.
