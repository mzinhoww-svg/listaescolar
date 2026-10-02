# Lighthouse mobile (depois) · S28

Build de produção local (`next start`, porta 3002), Supabase local com dados de demonstração, Lighthouse 12, emulação mobile padrão (4G simulado, CPU 4x). Mediana de 3 execuções por página. Páginas logadas usam o cookie de sessão de uma conta de demonstração (`@listacerta.test`). Gerado por `scripts/s28-medir.mjs` em 2026-09-29T17:40:10.052Z.

| Página | Rota | Desempenho | Acessibilidade | Boas práticas | SEO | LCP | CLS | TBT | JS transferido | Auditorias de a11y reprovadas |
|---|---|---|---|---|---|---|---|---|---|---|
| inicio | `/` | 92 | 100 | 96 | 69 | 3.3 s | 0.000 | 42 ms | 318 KB | - |
| busca | `/escolas?q=Demonstra` | 93 | 100 | 96 | 66 | 3.3 s | 0.000 | 38 ms | 313 KB | - |
| escola | `/escolas/99001001` | 92 | 100 | 96 | 66 | 3.3 s | 0.000 | 57 ms | 316 KB | - |
| lista | `/escolas/99001001/ef-5?ano=2027` | 100 | 100 | 93 | 63 | 1.8 s | 0.000 | 31 ms | 316 KB | - |
| carrinho | `/carrinho/935fa93e-f0ee-4957-9d6f-b834c153ddf9` | 92 | 100 | 96 | 63 | 3.3 s | 0.000 | 30 ms | 311 KB | - |
| enviar-lista | `/enviar-lista` | 99 | 100 | 96 | 63 | 1.9 s | 0.000 | 33 ms | 323 KB | - |
| login | `/entrar` | 93 | 100 | 96 | 66 | 3.3 s | 0.000 | 38 ms | 313 KB | - |
| papelaria | `/papelaria` | 91 | 100 | 100 | 66 | 3.5 s | 0.000 | 46 ms | 316 KB | - |
| como-funciona | `/como-funciona` | 93 | 100 | 100 | 69 | 3.3 s | 0.000 | 27 ms | 316 KB | - |
| cotacao-nova | `/cotacao/nova` | 100 | 100 | 100 | 63 | 1.8 s | 0.000 | 22 ms | 312 KB | - |
| conta | `/conta` | 93 | 100 | 100 | 63 | 3.2 s | 0.000 | 34 ms | 310 KB | - |
| escola-painel | `/escola` | 93 | 100 | 100 | 66 | 3.2 s | 0.000 | 28 ms | 316 KB | - |
| admin | `/admin` | 100 | 100 | 100 | 66 | 1.9 s | 0.000 | 33 ms | 325 KB | - |
| b2b | `/b2b` | 100 | 100 | 100 | 66 | 1.9 s | 0.000 | 25 ms | 316 KB | - |
| parceiros | `/parceiros` | 92 | 100 | 96 | 69 | 3.3 s | 0.000 | 36 ms | 316 KB | - |
