# Checagens automáticas · S29

Uma seção por jornada; regenerada por `node scripts/s29-checks.mjs --jornada <ID>`.

<!-- J3:start -->
## J3 · Família entra e cuida da conta

Gerado por `scripts/s29-checks.mjs` em 2026-09-30T02:27:26.365Z contra `http://127.0.0.1:3003`. Rotas com falha: **0** de 8.

| Rota | Conta | HTTP | Resultado | Achados |
|---|---|---|---|---|
| `/entrar` | pub | 200 | ok | - |
| `/conta` | familia | 200 | ok | - |
| `/conta/alunos/novo` | familia | 200 | ok | - |
| `/conta/alunos/00000000-0000-4000-8000-000000290a01/editar` | familia | 200 | ok | - |
| `/conta/listas-salvas` | familia | 200 | ok | - |
| `/conta/carrinhos` | familia | 200 | ok | - |
| `/conta/notificacoes` | familia | 200 | ok | - |
| `/conta/privacidade` | familia | 200 | ok | - |
<!-- J3:end -->

<!-- movimento:start -->
## Movimento fora dos tokens (CSS publicado, 1 folha(s))

Aceitos: 120/200/320 ms e `var(--mov-*)`. Isentos por lista nomeada: `animate-spin`, `animate-pulse`, `pesquisa-pulso`. Achados: **0**
<!-- movimento:end -->

<!-- J4:start -->
## J4 · Família envia a lista da escola

Gerado por `scripts/s29-checks.mjs` em 2026-09-29T23:18:35.781Z contra `http://127.0.0.1:3003`. Rotas com falha: **2** de 3.

| Rota | Conta | HTTP | Resultado | Achados |
|---|---|---|---|---|
| `/enviar-lista` | familia | 200 | falha | mais de uma ação principal: form=3 |
| `/enviar-lista/6a2d46e1-d0e9-44a9-a0d4-1c3607780816` | familia | 200 | ok | - |
| `/enviar-lista/6a2d46e1-d0e9-44a9-a0d4-1c3607780816/revisar` | familia | 404 | falha | HTTP 404 (esperado 200)<br>beco sem saída: sem ação adiante; sem caminho de volta |
<!-- J4:end -->

<!-- J5:start -->
## J5 · Escola assume e publica

Gerado por `scripts/s29-checks.mjs` em 2026-09-29T23:25:26.240Z contra `http://127.0.0.1:3003`. Rotas com falha: **4** de 4.

| Rota | Conta | HTTP | Resultado | Achados |
|---|---|---|---|---|
| `/escolas/99029001/reivindicar` | familia | 200 | falha | beco sem saída: sem ação adiante<br>rolagem horizontal 416/390 (div.flex.flex-col 416 pos=static; ol.flex.items-center 392 pos=static)<br>alvo < 44 px (2): a.block.w-[142px] 142x32; a.text-[14px].font-extrabold 62x21 |
| `/escolas/99029001/reivindicar/confirmar` | familia | 200 | falha | alvo < 44 px (3): a.block.w-[142px] 142x32; a.text-[14px].font-extrabold 62x21; a.text-verde-fundo.text-[14px] 294x21 |
| `/escola` | escola | 200 | falha | beco sem saída: sem caminho de volta |
| `/escola/listas/nova` | escola | 200 | falha | beco sem saída: sem caminho de volta<br>botão fora do sistema (1): button.text-tinta.font-bold.underline "escolha no computador" |
<!-- J5:end -->

<!-- J6:start -->
## J6 · Papelaria vende

Gerado por `scripts/s29-checks.mjs` em 2026-09-30T03:23:45.918Z contra `http://127.0.0.1:3003`. Rotas com falha: **0** de 11.

| Rota | Conta | HTTP | Resultado | Achados |
|---|---|---|---|---|
| `/cadastrar-papelaria` | familia | 200 | ok | - |
| `/papelaria` | papelaria | 200 | ok | - |
| `/papelaria/areas` | papelaria | 200 | ok | - |
| `/papelaria/catalogo` | papelaria | 200 | ok | - |
| `/papelaria/creditos` | papelaria | 200 | ok | - |
| `/papelaria/creditos/faturas/00000000-0000-4000-8000-000000290901` | papelaria | 200 | ok | - |
| `/papelaria/leads` | papelaria | 200 | ok | - |
| `/papelaria/leads/LC-S29D1` | papelaria | 200 | ok | - |
| `/papelaria/leads/LC-S29D4` | papelaria | 200 | ok | - |
| `/papelaria/desempenho` | papelaria | 200 | ok | - |
| `/papelarias/s29-papelaria-demo` | pub | 200 | ok | - |
<!-- J6:end -->

<!-- J7:start -->
## J7 · Equipe opera

Gerado por `scripts/s29-checks.mjs` em 2026-09-29T23:56:36.813Z contra `http://127.0.0.1:3003`. Rotas com falha: **15** de 22.

| Rota | Conta | HTTP | Resultado | Achados |
|---|---|---|---|---|
| `/admin` | admin | 200 | falha | beco sem saída: sem caminho de volta |
| `/admin/revisao` | admin | 200 | falha | beco sem saída: sem ação adiante; sem caminho de volta |
| `/admin/reivindicacoes` | admin | 200 | falha | beco sem saída: sem ação adiante; sem caminho de volta |
| `/admin/papelarias` | admin | 200 | falha | beco sem saída: sem ação adiante; sem caminho de volta |
| `/admin/denuncias` | admin | 200 | falha | beco sem saída: sem ação adiante; sem caminho de volta |
| `/admin/contestacoes` | admin | 200 | falha | beco sem saída: sem ação adiante; sem caminho de volta |
| `/admin/planos` | admin | 200 | falha | beco sem saída: sem caminho de volta |
| `/admin/ia` | admin | 200 | falha | beco sem saída: sem caminho de volta |
| `/admin/repasses` | admin | 200 | falha | beco sem saída: sem caminho de volta |
| `/admin/inadimplencia` | admin | 200 | falha | beco sem saída: sem caminho de volta |
| `/admin/campanhas` | admin | 200 | falha | beco sem saída: sem ação adiante; sem caminho de volta |
| `/admin/parceiros` | admin | 200 | falha | beco sem saída: sem caminho de volta |
| `/admin/importacoes` | admin | 200 | falha | beco sem saída: sem caminho de volta |
| `/admin/eventos` | admin | 200 | falha | beco sem saída: sem caminho de volta |
| `/admin/auditoria` | admin | 200 | falha | beco sem saída: sem ação adiante; sem caminho de volta |
| `/admin/revisao/` | admin | - | pulada | pulada: sem dado no seed (item de revisão); o seed cresce na Task 5 |
| `/admin/listas/` | admin | - | pulada | pulada: sem dado no seed (lista); o seed cresce na Task 5 |
| `/admin/reivindicacoes/` | admin | - | pulada | pulada: sem dado no seed (reivindicação); o seed cresce na Task 5 |
| `/admin/papelarias/` | admin | - | pulada | pulada: sem dado no seed (id da papelaria); o seed cresce na Task 5 |
| `/admin/denuncias/` | admin | - | pulada | pulada: sem dado no seed (denúncia); o seed cresce na Task 5 |
| `/admin/importacoes/` | admin | - | pulada | pulada: sem dado no seed (lote de importação); o seed cresce na Task 5 |
| `/admin/parceiros/` | admin | - | pulada | pulada: sem dado no seed (id do parceiro); o seed cresce na Task 5 |
<!-- J7:end -->

<!-- J8:start -->
## J8 · Parceiro B2B integra

Gerado por `scripts/s29-checks.mjs` em 2026-09-30T00:08:13.159Z contra `http://127.0.0.1:3003`. Rotas com falha: **13** de 13.

| Rota | Conta | HTTP | Resultado | Achados |
|---|---|---|---|---|
| `/parceiros` | pub | 200 | falha | mais de uma ação principal: main=2 |
| `/parceiros/termos` | pub | 200 | falha | beco sem saída: sem ação adiante; sem caminho de volta |
| `/parceiros/docs` | pub | 200 | falha | beco sem saída: sem ação adiante; sem caminho de volta |
| `/b2b` | parceiro | 200 | falha | beco sem saída: sem caminho de volta<br>botão fora do sistema (1): button.min-h-11.px-2.text-[12px].font-semibold "Sair" |
| `/b2b/api` | parceiro | 200 | falha | beco sem saída: sem caminho de volta<br>botão fora do sistema (3): button.min-h-11.px-2.text-[12px].font-semibold "Sair" | button.text-verde-fundo.text-[13px].font-extrabold.underline "Rotacionar" | button.text-erro-texto.inline-flex.min-h-11.items-center "Revogar" |
| `/b2b/docs` | parceiro | 200 | falha | beco sem saída: sem caminho de volta<br>botão fora do sistema (1): button.min-h-11.px-2.text-[12px].font-semibold "Sair" |
| `/b2b/widget` | parceiro | 200 | falha | beco sem saída: sem caminho de volta<br>botão fora do sistema (1): button.min-h-11.px-2.text-[12px].font-semibold "Sair" |
| `/b2b/webhooks` | parceiro | 200 | falha | beco sem saída: sem caminho de volta<br>botão fora do sistema (3): button.min-h-11.px-2.text-[12px].font-semibold "Sair" | button.text-verde-fundo.text-[13px].font-extrabold.underline "Revelar" | button.text-verde-fundo.text-[13px].font-extrabold.underline "Rotacionar" |
| `/b2b/campanhas` | parceiro | 200 | falha | beco sem saída: sem caminho de volta<br>botão fora do sistema (1): button.min-h-11.px-2.text-[12px].font-semibold "Sair" |
| `/b2b/campanhas/nova` | parceiro | 200 | falha | beco sem saída: sem caminho de volta<br>botão fora do sistema (1): button.min-h-11.px-2.text-[12px].font-semibold "Sair" |
| `/b2b/insights` | parceiro | 200 | falha | beco sem saída: sem caminho de volta<br>botão fora do sistema (1): button.min-h-11.px-2.text-[12px].font-semibold "Sair" |
| `/b2b/faturamento` | parceiro | 200 | falha | beco sem saída: sem caminho de volta<br>botão fora do sistema (1): button.min-h-11.px-2.text-[12px].font-semibold "Sair" |
| `/b2b/conta` | parceiro | 200 | falha | beco sem saída: sem caminho de volta<br>botão fora do sistema (1): button.min-h-11.px-2.text-[12px].font-semibold "Sair" |
<!-- J8:end -->

<!-- J1:start -->
## J1 · Família acha a lista

Gerado por `scripts/s29-checks.mjs` em 2026-09-30T01:25:46.025Z contra `http://127.0.0.1:3003`. Rotas com falha: **0** de 8.

| Rota | Conta | HTTP | Resultado | Achados |
|---|---|---|---|---|
| `/` | pub | 200 | ok | - |
| `/escolas` | pub | 200 | ok | - |
| `/escolas/99029001` | pub | 200 | ok | - |
| `/escolas/99029001/ef-5?ano=2027` | pub | 200 | ok | - |
| `/l/2YE4099M` | pub | 200 | ok | redirecionou para /escolas/99029001/ef-5 |
| `/l/2YE4099M/qr` | pub | 200 | ok | não é HTML (image/svg+xml; charset=utf-8): só status |
| `/escolas?q=Maria%20das%20Dores` | pub | 200 | ok | - |
| `/escolas/99029003` | pub | 200 | ok | - |
<!-- J1:end -->

<!-- J2:start -->
## J2 · Família compra

Gerado por `scripts/s29-checks.mjs` em 2026-09-30T03:24:11.151Z contra `http://127.0.0.1:3003`. Rotas com falha: **0** de 11.

| Rota | Conta | HTTP | Resultado | Achados |
|---|---|---|---|---|
| `/carrinho/novo` | familia | 200 | ok | - |
| `/carrinho/novo?lista=eb7391e5-8aea-4f54-b9e9-50d2dd4f6724` | familia | 200 | ok | - |
| `/carrinho/00000000-0000-4000-8000-0000000029d2` | familia | 200 | ok | - |
| `/ir-para/00000000-0000-4000-8000-0000000029d2/mercadolivre` | familia | 200 | ok | - |
| `/carrinho/00000000-0000-4000-8000-0000000029d2/checkout` | familia | 200 | ok | - |
| `/cotacao` | familia | 200 | ok | - |
| `/cotacao/nova` | familia | 200 | ok | - |
| `/cotacao/nova?carrinho=00000000-0000-4000-8000-0000000029d2` | familia | 200 | ok | - |
| `/cotacao/LC-S29D1` | familia | 200 | ok | - |
| `/cotacao/LC-S29D4` | familia | 200 | ok | - |
| `/conta/compras` | familia | 200 | ok | - |
<!-- J2:end -->
