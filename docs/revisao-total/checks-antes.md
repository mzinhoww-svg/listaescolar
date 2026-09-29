# Checagens automáticas · S29

Uma seção por jornada; regenerada por `node scripts/s29-checks.mjs --jornada <ID>`.

<!-- J1:start -->
## J1 · Família acha a lista

Gerado por `scripts/s29-checks.mjs` em 2026-09-29T22:45:56.881Z contra `http://127.0.0.1:3003`. Rotas com falha: **1** de 6.

| Rota | Conta | HTTP | Resultado | Achados |
|---|---|---|---|---|
| `/` | pub | 200 | ok | - |
| `/escolas` | pub | 200 | falha | beco sem saída: sem caminho de volta |
| `/escolas/99029001` | pub | 200 | ok | - |
| `/escolas/99029001/ef-5?ano=2027` | pub | 200 | ok | - |
| `/l/2YE4099M` | pub | 200 | ok | redirecionou para /escolas/99029001/ef-5 |
| `/l/2YE4099M/qr` | pub | 200 | ok | não é HTML (image/svg+xml; charset=utf-8): só status |
<!-- J1:end -->

<!-- movimento:start -->
## Movimento fora dos tokens (CSS publicado, 1 folha(s))

Aceitos: 120/200/320 ms e `var(--mov-*)`. Isentos por lista nomeada: `animate-spin`, `animate-pulse`, `pesquisa-pulso`. Achados: **3**

- `3bsxnpd9gp9je.css: :root,:host { --default-transition-duration: .15s } (150 ms)`
- `3bsxnpd9gp9je.css: .duration-500 { --tw-duration: .5s } (500 ms)`
- `3bsxnpd9gp9je.css: .duration-500 { transition-duration: .5s } (500 ms)`
<!-- movimento:end -->
