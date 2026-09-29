# Lighthouse mobile (depois) · S28

Build de produção local (`next start`, porta 3002), Supabase local com dados de demonstração, Lighthouse 12, emulação mobile padrão (4G simulado, CPU 4x). Mediana de 3 execuções por página. Páginas logadas usam o cookie de sessão de uma conta de demonstração (`@listacerta.test`). Gerado por `scripts/s28-medir.mjs` em 2026-09-29T15:46:53.814Z.

| Página | Rota | Desempenho | Acessibilidade | Boas práticas | SEO | LCP | CLS | TBT | JS transferido | Auditorias de a11y reprovadas |
|---|---|---|---|---|---|---|---|---|---|---|
| inicio | `/` | 100 | 100 | 96 | 69 | 3.3 s | 0.000 | 35 ms | 318 KB | - |
| busca | `/escolas?q=Demonstra` | 100 | 100 | 96 | 66 | 1.8 s | 0.000 | 21 ms | 313 KB | - |
| escola | `/escolas/99001001` | 100 | 100 | 96 | 66 | 1.8 s | 0.000 | 55 ms | 316 KB | - |
| lista | `/escolas/99001001/ef-5?ano=2027` | 96 | 100 | 93 | 63 | 2.7 s | 0.000 | 45 ms | 316 KB | - |
| carrinho | `/carrinho/6613e784-fcb8-4df3-98be-1c8308ffbec5` | 92 | 100 | 96 | 63 | 3.4 s | 0.000 | 45 ms | 311 KB | - |
| enviar-lista | `/enviar-lista` | 93 | 100 | 96 | 63 | 3.3 s | 0.000 | 33 ms | 323 KB | - |
| login | `/entrar` | 99 | 100 | 96 | 66 | 2.3 s | 0.000 | 21 ms | 313 KB | - |
| papelaria | `/papelaria` | 92 | 100 | 100 | 66 | 3.4 s | 0.000 | 43 ms | 316 KB | - |
| como-funciona | `/como-funciona` | 100 | 100 | 100 | 69 | 1.8 s | 0.000 | 21 ms | 316 KB | - |
| cotacao-nova | `/cotacao/nova` | 98 | 100 | 100 | 63 | 2.3 s | 0.000 | 20 ms | 312 KB | - |
| conta | `/conta` | 93 | 100 | 100 | 63 | 3.2 s | 0.000 | 20 ms | 310 KB | - |
| escola-painel | `/escola` | 93 | 100 | 100 | 63 | 3.2 s | 0.000 | 36 ms | 316 KB | - |
| admin | `/admin` | 100 | 100 | 100 | 66 | 1.8 s | 0.000 | 21 ms | 325 KB | - |
| b2b | `/b2b` | 93 | 100 | 100 | 66 | 3.3 s | 0.000 | 20 ms | 316 KB | - |
| parceiros | `/parceiros` | 93 | 100 | 96 | 69 | 3.3 s | 0.000 | 20 ms | 316 KB | - |
