# Antes x depois · S28

Build de produção local (`next start`), Supabase local com dados de demonstração, Lighthouse 12 mobile (4G simulado, CPU 4x), mediana de 3 execuções, axe-core 4.13 a 390x844. Antes: base `1b9fb28` (sem S19). Depois: com a S19 integrada (CSP com nonce, Sentry). Gerado por `scripts/s28-comparar.py` a partir de `antes/*.md` e `depois/*.md`.

| Página | Rota | Desempenho (antes → depois) | Acessibilidade | LCP | CLS | TBT | axe sérias+críticas | axe moderadas |
|---|---|---|---|---|---|---|---|---|
| inicio | `/` | 95 → 100 | 100 → 100 | 2.9 s → 3.3 s | 0.000 → 0.000 | 56 ms → 35 ms | 0 → 0 | 0 → 0 |
| busca | `/escolas?q=Demonstra` | 91 → 100 | 100 → 100 | 3.0 s → 1.8 s | 0.000 → 0.000 | 206 ms → 21 ms | 0 → 0 | 0 → 0 |
| escola | `/escolas/99001001` | 96 → 100 | 100 → 100 | 2.8 s → 1.8 s | 0.000 → 0.000 | 22 ms → 55 ms | 0 → 0 | 0 → 0 |
| lista | `/escolas/99001001/ef-5?ano=2027` | 96 → 96 | 100 → 100 | 2.8 s → 2.7 s | 0.000 → 0.000 | 22 ms → 45 ms | 0 → 0 | 0 → 0 |
| carrinho | `/carrinho/6613e784-fcb8-4df3-98be-1c8308ffbec5` | 97 → 92 | 100 → 100 | 2.8 s → 3.4 s | 0.000 → 0.000 | 42 ms → 45 ms | 0 → 0 | 0 → 0 |
| enviar-lista | `/enviar-lista` | 93 → 93 | 100 → 100 | 3.3 s → 3.3 s | 0.000 → 0.000 | 48 ms → 33 ms | 0 → 0 | 2 → 0 |
| login | `/entrar` | 100 → 99 | 100 → 100 | 1.8 s → 2.3 s | 0.000 → 0.000 | 20 ms → 21 ms | 0 → 0 | 0 → 0 |
| papelaria | `/papelaria` | 96 → 92 | 100 → 100 | 2.7 s → 3.4 s | 0.000 → 0.000 | 21 ms → 43 ms | 0 → 0 | 0 → 0 |
| como-funciona | `/como-funciona` | 96 → 100 | 100 → 100 | 2.7 s → 1.8 s | 0.000 → 0.000 | 18 ms → 21 ms | 0 → 0 | 0 → 0 |
| cotacao-nova | `/cotacao/nova` | - → 98 | - → 100 | - → 2.3 s | - → 0.000 | - → 20 ms | n/m → 0 | n/m → 0 |
| conta | `/conta` | - → 93 | - → 100 | - → 3.2 s | - → 0.000 | - → 20 ms | n/m → 0 | n/m → 0 |
| escola-painel | `/escola` | - → 93 | - → 100 | - → 3.2 s | - → 0.000 | - → 36 ms | n/m → 0 | n/m → 0 |
| admin | `/admin` | - → 100 | - → 100 | - → 1.8 s | - → 0.000 | - → 21 ms | n/m → 0 | n/m → 0 |
| b2b | `/b2b` | - → 93 | - → 100 | - → 3.3 s | - → 0.000 | - → 20 ms | n/m → 0 | n/m → 0 |
| parceiros | `/parceiros` | - → 93 | - → 100 | - → 3.3 s | - → 0.000 | - → 20 ms | n/m → 0 | n/m → 0 |

n/m = página não medida na linha de base (Task 20 acrescentou as áreas logadas).

## Aceite

- Lighthouse desempenho ≥ 90 nas 7 páginas do aceite (início, busca, lista, carrinho, login, papelaria, como funciona): **sim**.
- Lighthouse acessibilidade ≥ 90 nas mesmas: **sim**.
- axe sem violação séria ou crítica nas mesmas: **sim**.
- Checagens próprias (rolagem, main, h1, alvo de toque, texto < 12 px) em `depois/checks.md`: **0 rota(s) com falha**.

## Capturas lado a lado (390x844)

Esquerda: antes. Direita: depois. Arquivos `depois/lado-a-lado-<página>.png`.

- `inicio`: ![inicio](depois/lado-a-lado-inicio.png)
- `busca`: ![busca](depois/lado-a-lado-busca.png)
- `escola`: ![escola](depois/lado-a-lado-escola.png)
- `lista`: ![lista](depois/lado-a-lado-lista.png)
- `carrinho`: ![carrinho](depois/lado-a-lado-carrinho.png)
- `enviar-lista`: ![enviar-lista](depois/lado-a-lado-enviar-lista.png)
- `login`: ![login](depois/lado-a-lado-login.png)
- `papelaria`: ![papelaria](depois/lado-a-lado-papelaria.png)
- `como-funciona`: ![como-funciona](depois/lado-a-lado-como-funciona.png)
