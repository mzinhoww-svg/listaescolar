# Lighthouse mobile (antes) · S28

Build de produção local (`next start`, porta 3002), Supabase local com dados de demonstração, Lighthouse 12, emulação mobile padrão (4G simulado, CPU 4x). Mediana de 3 execuções por página. Páginas logadas usam o cookie de sessão de uma conta de demonstração (`@listacerta.test`). Gerado por `scripts/s28-medir.mjs` em 2026-09-29T04:31:06.816Z.

| Página | Rota | Desempenho | Acessibilidade | Boas práticas | SEO | LCP | CLS | TBT | Auditorias de a11y reprovadas |
|---|---|---|---|---|---|---|---|---|---|
| inicio | `/` | 95 | 100 | 100 | 69 | 2.9 s | 0.000 | 56 ms | - |
| busca | `/escolas?q=Demonstra` | 91 | 100 | 100 | 66 | 3.0 s | 0.000 | 206 ms | - |
| escola | `/escolas/99001001` | 96 | 100 | 100 | 54 | 2.8 s | 0.000 | 22 ms | - |
| lista | `/escolas/99001001/ef-5?ano=2027` | 96 | 100 | 100 | 54 | 2.8 s | 0.000 | 22 ms | - |
| carrinho | `/carrinho/155fdc1d-cb65-4cd7-bc5d-a500cce5c993` | 97 | 100 | 100 | 63 | 2.8 s | 0.000 | 42 ms | - |
| enviar-lista | `/enviar-lista` | 93 | 100 | 100 | 63 | 3.3 s | 0.000 | 48 ms | - |
| login | `/entrar` | 100 | 100 | 100 | 66 | 1.8 s | 0.000 | 20 ms | - |
| papelaria | `/papelaria` | 96 | 100 | 100 | 66 | 2.7 s | 0.000 | 21 ms | - |
| como-funciona | `/como-funciona` | 96 | 100 | 100 | 69 | 2.7 s | 0.000 | 18 ms | - |
