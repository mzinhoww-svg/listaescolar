# Checagens automáticas · S29

Uma seção por jornada; regenerada por `node scripts/s29-checks.mjs --jornada <ID>`.

<!-- J3:start -->
## J3 · Família entra e cuida da conta

Gerado por `scripts/s29-checks.mjs` em 2026-09-29T23:15:17.867Z contra `http://127.0.0.1:3003`. Rotas com falha: **5** de 8.

| Rota | Conta | HTTP | Resultado | Achados |
|---|---|---|---|---|
| `/entrar` | pub | 200 | falha | beco sem saída: sem caminho de volta |
| `/conta` | familia | 200 | falha | beco sem saída: sem caminho de volta |
| `/conta/alunos/novo` | familia | 200 | ok | - |
| `/conta/alunos//editar` | familia | - | pulada | pulada: sem dado no seed (aluno); o seed cresce na Task 5 |
| `/conta/listas-salvas` | familia | 200 | falha | botão fora do sistema (1): button.text-[12px].font-extrabold.text-erro-texto.underline "Remover"<br>alvo < 44 px (1): a.text-[16px].font-extrabold 196x24 |
| `/conta/carrinhos` | familia | 200 | ok | - |
| `/conta/notificacoes` | familia | 200 | falha | beco sem saída: sem ação adiante; sem caminho de volta |
| `/conta/privacidade` | familia | 200 | falha | beco sem saída: sem caminho de volta<br>botão fora do sistema (1): button.text-erro-texto.text-[12px].font-extrabold.underline "Revogar" |
<!-- J3:end -->

<!-- movimento:start -->
## Movimento fora dos tokens (CSS publicado, 1 folha(s))

Aceitos: 120/200/320 ms e `var(--mov-*)`. Isentos por lista nomeada: `animate-spin`, `animate-pulse`, `pesquisa-pulso`. Achados: **3**

- `21ejjs3j--ktj.css: :root,:host { --default-transition-duration: .15s } (150 ms)`
- `21ejjs3j--ktj.css: .duration-500 { --tw-duration: .5s } (500 ms)`
- `21ejjs3j--ktj.css: .duration-500 { transition-duration: .5s } (500 ms)`
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

Gerado por `scripts/s29-checks.mjs` em 2026-09-29T23:25:50.230Z contra `http://127.0.0.1:3003`. Rotas com falha: **9** de 10.

| Rota | Conta | HTTP | Resultado | Achados |
|---|---|---|---|---|
| `/cadastrar-papelaria` | familia | 200 | falha | beco sem saída: sem caminho de volta |
| `/papelaria` | papelaria | 200 | falha | beco sem saída: sem caminho de volta<br>botão fora do sistema (1): button.min-h-11.px-2.text-[12px].font-semibold "Sair" |
| `/papelaria/areas` | papelaria | 200 | falha | beco sem saída: sem caminho de volta<br>botão fora do sistema (1): button.min-h-11.px-2.text-[12px].font-semibold "Sair" |
| `/papelaria/catalogo` | papelaria | 200 | falha | beco sem saída: sem caminho de volta<br>botão fora do sistema (1): button.min-h-11.px-2.text-[12px].font-semibold "Sair" |
| `/papelaria/creditos` | papelaria | 200 | falha | beco sem saída: sem caminho de volta<br>botão fora do sistema (1): button.min-h-11.px-2.text-[12px].font-semibold "Sair" |
| `/papelaria/creditos/faturas/` | papelaria | - | pulada | pulada: sem dado no seed (fatura); o seed cresce na Task 5 |
| `/papelaria/leads` | papelaria | 200 | falha | beco sem saída: sem caminho de volta<br>botão fora do sistema (1): button.min-h-11.px-2.text-[12px].font-semibold "Sair" |
| `/papelaria/leads/LC-S29D1` | papelaria | 200 | falha | beco sem saída: sem caminho de volta<br>botão fora do sistema (1): button.min-h-11.px-2.text-[12px].font-semibold "Sair" |
| `/papelaria/desempenho` | papelaria | 200 | falha | beco sem saída: sem caminho de volta<br>botão fora do sistema (1): button.min-h-11.px-2.text-[12px].font-semibold "Sair" |
| `/papelarias/s29-papelaria-demo` | pub | 200 | falha | beco sem saída: sem caminho de volta |
<!-- J6:end -->
