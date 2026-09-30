# Checagens automáticas · S29

Uma seção por jornada; regenerada por `node scripts/s29-checks.mjs --jornada <ID>`.

<!-- J1:start -->
## J1 · Família acha a lista

Gerado por `scripts/s29-checks.mjs` em 2026-09-30T00:57:33.719Z contra `http://127.0.0.1:3003`. Rotas com falha: **1** de 8.

| Rota | Conta | HTTP | Resultado | Achados |
|---|---|---|---|---|
| `/` | pub | 200 | ok | - |
| `/escolas` | pub | 200 | ok | - |
| `/escolas/99029001` | pub | 200 | ok | - |
| `/escolas/99029001/ef-5?ano=2027` | pub | 200 | ok | - |
| `/l/2YE4099M` | pub | 200 | ok | redirecionou para /escolas/99029001/ef-5 |
| `/l/2YE4099M/qr` | pub | 200 | ok | não é HTML (image/svg+xml; charset=utf-8): só status |
| `/escolas?q=Maria%20das%20Dores` | pub | 200 | falha | botão fora do sistema (1): button.text-texto-2.focus-visible:outline-verde-fundo.flex.size-11 "" |
| `/escolas/99029003` | pub | 200 | ok | - |
<!-- J1:end -->

<!-- J2:start -->
## J2 · Família compra

Gerado por `scripts/s29-checks.mjs` em 2026-09-30T00:57:33.719Z contra `http://127.0.0.1:3003`. Rotas com falha: **9** de 11.

| Rota | Conta | HTTP | Resultado | Achados |
|---|---|---|---|---|
| `/carrinho/novo` | familia | 200 | falha | beco sem saída: sem caminho de volta |
| `/carrinho/novo?lista=4b79ad6f-77a8-455e-9fe5-0cb044c6019e` | familia | 200 | falha | beco sem saída: sem caminho de volta |
| `/carrinho/00000000-0000-4000-8000-0000000029d2` | familia | 200 | ok | - |
| `/ir-para/00000000-0000-4000-8000-0000000029d2/mercadolivre` | familia | 200 | falha | alvo < 44 px (P1: 1): a.text-center.text-[15px] 342x23 |
| `/carrinho/00000000-0000-4000-8000-0000000029d2/checkout` | familia | 200 | falha | alvo < 44 px (P1: 4): a.text-verde-fundo.mt-1 41x16; a.text-verde-fundo.mt-1 41x16; a.text-verde-fundo.mt-1 41x16 |
| `/cotacao` | familia | 200 | ok | - |
| `/cotacao/nova` | familia | 200 | falha | beco sem saída: sem caminho de volta |
| `/cotacao/nova?carrinho=00000000-0000-4000-8000-0000000029d2` | familia | 200 | falha | h1=0 |
| `/cotacao/LC-S29D1` | familia | 200 | falha | ação irreversível sem confirmação (1): button.border-tinta.text-tinta.rounded-botao.flex "Cancelar pedido" |
| `/cotacao/LC-S29D4` | familia | 200 | falha | ação irreversível sem confirmação (1): button.border-tinta.text-tinta.rounded-botao.flex "Cancelar pedido" |
| `/conta/compras` | familia | 200 | falha | beco sem saída: sem caminho de volta |
<!-- J2:end -->

<!-- J3:start -->
## J3 · Família entra e cuida da conta

Gerado por `scripts/s29-checks.mjs` em 2026-09-30T00:57:33.719Z contra `http://127.0.0.1:3003`. Rotas com falha: **5** de 8.

| Rota | Conta | HTTP | Resultado | Achados |
|---|---|---|---|---|
| `/entrar` | pub | 200 | falha | beco sem saída: sem caminho de volta |
| `/conta` | familia | 200 | falha | beco sem saída: sem caminho de volta |
| `/conta/alunos/novo` | familia | 200 | ok | - |
| `/conta/alunos/00000000-0000-4000-8000-000000290a01/editar` | familia | 200 | ok | - |
| `/conta/listas-salvas` | familia | 200 | falha | beco sem saída: sem ação adiante |
| `/conta/carrinhos` | familia | 200 | ok | - |
| `/conta/notificacoes` | familia | 200 | falha | beco sem saída: sem ação adiante; sem caminho de volta |
| `/conta/privacidade` | familia | 200 | falha | beco sem saída: sem caminho de volta<br>ação irreversível sem confirmação (2): button.text-erro-texto.text-[12px].font-extrabold.underline "Revogar" | button.border-erro-texto.text-erro-texto.flex.h-14 "Excluir minha conta" |
<!-- J3:end -->

<!-- J4:start -->
## J4 · Família envia a lista da escola

Gerado por `scripts/s29-checks.mjs` em 2026-09-30T00:57:33.719Z contra `http://127.0.0.1:3003`. Rotas com falha: **2** de 3.

| Rota | Conta | HTTP | Resultado | Achados |
|---|---|---|---|---|
| `/enviar-lista` | familia | 200 | falha | mais de uma ação principal: form=3 |
| `/enviar-lista/00000000-0000-4000-8000-0000000029e3` | familia | 200 | ok | - |
| `/enviar-lista/00000000-0000-4000-8000-0000000029e3/revisar` | familia | 200 | falha | ação irreversível sem confirmação (2): button.bg-erro-fundo.text-erro-texto.rounded-botao.inline-flex "✕" | button.bg-erro-fundo.text-erro-texto.rounded-botao.inline-flex "✕" |
<!-- J4:end -->

<!-- J5:start -->
## J5 · Escola assume e publica

Gerado por `scripts/s29-checks.mjs` em 2026-09-30T00:57:33.719Z contra `http://127.0.0.1:3003`. Rotas com falha: **6** de 7.

| Rota | Conta | HTTP | Resultado | Achados |
|---|---|---|---|---|
| `/escolas/99029002/reivindicar` | familia | 200 | falha | rolagem horizontal 416/390 (div.flex.flex-col 416 pos=static; ol.flex.items-center 392 pos=static)<br>alvo < 44 px (P1: 1, P2: 1): a.text-[14px].font-extrabold 62x21; a.block.w-[142px] 142x32 |
| `/escolas/99029001/reivindicar` | familia | 200 | falha | rolagem horizontal 416/390 (div.flex.flex-col 416 pos=static; ol.flex.items-center 392 pos=static)<br>alvo < 44 px (P1: 1, P2: 1): a.text-[14px].font-extrabold 62x21; a.block.w-[142px] 142x32<br>beco sem saída: sem ação adiante |
| `/escolas/99029012/reivindicar` | familia | 200 | falha | rolagem horizontal 416/390 (div.flex.flex-col 416 pos=static; ol.flex.items-center 392 pos=static)<br>alvo < 44 px (P1: 1, P2: 1): a.text-[14px].font-extrabold 62x21; a.block.w-[142px] 142x32 |
| `/escolas/99029002/reivindicar/confirmar` | familia | 200 | falha | alvo < 44 px (P1: 2, P2: 1): a.text-[14px].font-extrabold 62x21; a.text-verde-fundo.text-[14px] 294x21; a.block.w-[142px] 142x32 |
| `/escolas/99029002/reivindicar/confirmar?token=S29S29S29S29S29S29S29S29S29S29S29S29S29S29S29` | familia | 200 | falha | alvo < 44 px (P1: 2, P2: 1): a.text-[14px].font-extrabold 62x21; a.text-verde-fundo.text-[14px] 294x21; a.block.w-[142px] 142x32 |
| `/escola` | escola | 200 | falha | beco sem saída: sem caminho de volta |
| `/escola/listas/nova` | escola | 200 | ok | - |
<!-- J5:end -->

<!-- J6:start -->
## J6 · Papelaria vende

Gerado por `scripts/s29-checks.mjs` em 2026-09-30T00:57:33.719Z contra `http://127.0.0.1:3003`. Rotas com falha: **6** de 11.

| Rota | Conta | HTTP | Resultado | Achados |
|---|---|---|---|---|
| `/cadastrar-papelaria` | familia | 200 | falha | beco sem saída: sem caminho de volta |
| `/papelaria` | papelaria | 200 | falha | beco sem saída: sem caminho de volta |
| `/papelaria/areas` | papelaria | 200 | ok | - |
| `/papelaria/catalogo` | papelaria | 200 | falha | ação escondida por tabela larga (3): a.text-verde-fundo.focus-visible:outline-verde-fundo "Editar" (fora da tela, x=676 de 370); a.text-verde-fundo.focus-visible:outline-verde-fundo "Editar" (fora da tela, x=676 de 370); a.text-verde-fundo.focus-visible:outline-verde-fundo "Editar" (fora da tela, x=676 de 370) |
| `/papelaria/creditos` | papelaria | 200 | falha | alvo < 44 px (P1: 1): a.text-verde-fundo.text-[13px] 22x20 |
| `/papelaria/creditos/faturas/00000000-0000-4000-8000-000000290901` | papelaria | 200 | ok | - |
| `/papelaria/leads` | papelaria | 200 | falha | mais de uma ação principal: main=10 |
| `/papelaria/leads/LC-S29D1` | papelaria | 200 | ok | - |
| `/papelaria/leads/LC-S29D4` | papelaria | 200 | ok | - |
| `/papelaria/desempenho` | papelaria | 200 | ok | - |
| `/papelarias/s29-papelaria-demo` | pub | 200 | falha | beco sem saída: sem caminho de volta |
<!-- J6:end -->

<!-- J7:start -->
## J7 · Equipe opera

Gerado por `scripts/s29-checks.mjs` em 2026-09-30T00:57:33.719Z contra `http://127.0.0.1:3003`. Rotas com falha: **14** de 22.

| Rota | Conta | HTTP | Resultado | Achados |
|---|---|---|---|---|
| `/admin` | admin | 200 | falha | beco sem saída: sem caminho de volta |
| `/admin/revisao` | admin | 200 | falha | alvo < 44 px (P2: 1): a.text-verde-fundo.inline-flex 34x44<br>ação escondida por tabela larga (1): a.text-verde-fundo.inline-flex "Abrir revisão de Escola " (fora da tela, x=838 de 374) |
| `/admin/reivindicacoes` | admin | 200 | falha | beco sem saída: sem ação adiante |
| `/admin/papelarias` | admin | 200 | falha | ação escondida por tabela larga (2): a.min-h-11.inline-flex "Recusar" (fora da tela, x=843 de 374); button.min-h-11.inline-flex "Aprovar" (fora da tela, x=937 de 374) |
| `/admin/denuncias` | admin | 200 | falha | alvo < 44 px (P1: 1): a.text-verde-fundo.font-extrabold 32x16<br>ação escondida por tabela larga (1): a.text-verde-fundo.font-extrabold "Abrir" (fora da tela, x=668 de 374) |
| `/admin/contestacoes` | admin | 200 | ok | - |
| `/admin/planos` | admin | 200 | ok | - |
| `/admin/ia` | admin | 200 | ok | - |
| `/admin/repasses` | admin | 200 | falha | rolagem horizontal 677/390 (form.flex.flex-wrap 677 pos=static; label.flex.flex-col 677 pos=static) |
| `/admin/inadimplencia` | admin | 200 | ok | - |
| `/admin/campanhas` | admin | 200 | ok | - |
| `/admin/parceiros` | admin | 200 | falha | alvo < 44 px (P1: 5): a.text-verde-fundo.font-extrabold 34x18; a.text-verde-fundo.font-extrabold 34x18; a.text-verde-fundo.font-extrabold 34x18<br>ação escondida por tabela larga (5): a.text-verde-fundo.font-extrabold "Gerir" (fora da tela, x=707 de 374); a.text-verde-fundo.font-extrabold "Gerir" (fora da tela, x=707 de 374); a.text-verde-fundo.font-extrabold "Gerir" (fora da tela, x=707 de 374) |
| `/admin/importacoes` | admin | 200 | falha | alvo < 44 px (P1: 2): a.underline 147x19; a.text-verde-fundo.font-extrabold 87x19<br>ação escondida por tabela larga (1): a.text-verde-fundo.font-extrabold "Baixar erros" (fora da tela, x=756 de 374) |
| `/admin/eventos` | admin | 200 | ok | - |
| `/admin/auditoria` | admin | 200 | falha | beco sem saída: sem ação adiante |
| `/admin/revisao/00000000-0000-4000-8000-0000000029e3` | admin | 200 | ok | - |
| `/admin/listas/c6693df3-e3f7-4bf3-a256-2150fca68eb1` | admin | 200 | ok | - |
| `/admin/reivindicacoes/00000000-0000-4000-8000-000000290201` | admin | 200 | falha | alvo < 44 px (P1: 1): a.text-[14px].font-extrabold 75x21 |
| `/admin/papelarias/00000000-0000-4000-8000-000000290301` | admin | 200 | falha | alvo < 44 px (P1: 1): a.text-verde-fundo.text-[14px] 75x21<br>ação irreversível sem confirmação (1): button.rounded-botao.relative.inline-flex.shrink-0 "Suspender" |
| `/admin/denuncias/00000000-0000-4000-8000-000000290701` | admin | 200 | falha | alvo < 44 px (P1: 2): a.text-[14px].font-extrabold 75x21; a.text-verde-fundo.mt-2 124x21 |
| `/admin/importacoes/00000000-0000-4000-8000-000000290801` | admin | 200 | falha | beco sem saída: sem caminho de volta |
| `/admin/parceiros/00000000-0000-4000-8000-000000290b02` | admin | 200 | falha | alvo < 44 px (P1: 1): a.text-[14px].font-extrabold 83x21<br>beco sem saída: sem ação adiante |
<!-- J7:end -->

<!-- J8:start -->
## J8 · Parceiro B2B integra

Gerado por `scripts/s29-checks.mjs` em 2026-09-30T00:57:33.720Z contra `http://127.0.0.1:3003`. Rotas com falha: **5** de 15.

| Rota | Conta | HTTP | Resultado | Achados |
|---|---|---|---|---|
| `/parceiros` | pub | 200 | falha | mais de uma ação principal: main=2 |
| `/parceiros/termos` | pub | 200 | falha | beco sem saída: sem ação adiante; sem caminho de volta |
| `/parceiros/docs` | pub | 200 | falha | beco sem saída: sem ação adiante; sem caminho de volta |
| `/b2b` | parceiro | 200 | falha | beco sem saída: sem caminho de volta |
| `/b2b/api` | parceiro | 200 | ok | - |
| `/b2b/docs` | parceiro | 200 | ok | - |
| `/b2b/widget` | parceiro | 200 | ok | - |
| `/b2b/webhooks` | parceiro | 200 | ok | - |
| `/b2b/campanhas` | parceiro | 200 | ok | - |
| `/b2b/campanhas/nova` | parceiro | 200 | ok | - |
| `/b2b/insights` | parceiro | 200 | ok | - |
| `/b2b/faturamento` | parceiro | 200 | ok | - |
| `/b2b/conta` | parceiro | 200 | ok | - |
| `/b2b/campanhas` | marca | 200 | falha | ação escondida por tabela larga (5): button.bg-tinta.text-papel "Enviar para aprovação" (fora da tela, x=626 de 370); button.bg-campo.text-texto-2 "Pausar" (fora da tela, x=653 de 370); button.bg-campo.text-texto-2 "Concluir" (fora da tela, x=642 de 370)<br>mais de uma ação principal: main=2 |
| `/b2b/campanhas/nova` | marca | 200 | ok | - |
<!-- J8:end -->

<!-- J9:start -->
## J9 · Sistema e bordas

Gerado por `scripts/s29-checks.mjs` em 2026-09-30T00:57:33.720Z contra `http://127.0.0.1:3003`. Rotas com falha: **0** de 10.

| Rota | Conta | HTTP | Resultado | Achados |
|---|---|---|---|---|
| `/403` | pub | 200 | ok | - |
| `/rota-inexistente-s29` | pub | 404 | ok | - |
| `/pesquisa` | pub | 200 | ok | - |
| `/pesquisa/privacidade` | pub | 200 | ok | - |
| `/pesquisa/resultados` | pub | 200 | ok | redirecionou para /pesquisa/resultados/login |
| `/pesquisa/resultados/login` | pub | 200 | ok | - |
| `/termos` | pub | 200 | ok | - |
| `/privacidade` | pub | 200 | ok | - |
| `/sobre` | pub | 200 | ok | - |
| `/como-funciona` | pub | 200 | ok | - |
<!-- J9:end -->

<!-- movimento:start -->
## Movimento fora dos tokens (CSS publicado, 2 folha(s))

Aceitos: 120/200/320 ms e `var(--mov-*)`. Isentos por lista nomeada: `animate-spin`, `animate-pulse`, `pesquisa-pulso`. Achados: **0**
<!-- movimento:end -->
