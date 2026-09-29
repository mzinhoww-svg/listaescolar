# Lighthouse mobile (antes) · S28

Build de produção local (`next start`, porta 3002), Supabase local com dados de demonstração, Lighthouse 12, emulação mobile padrão (4G simulado, CPU 4x). Mediana de 3 execuções por página. Páginas logadas usam o cookie de sessão de uma conta de demonstração (`@listacerta.test`). Gerado por `scripts/s28-medir.mjs` em 2026-09-29T03:41:13.672Z.

| Página | Rota | Desempenho | Acessibilidade | Boas práticas | SEO | LCP | CLS | TBT | Auditorias de a11y reprovadas |
|---|---|---|---|---|---|---|---|---|---|
| inicio | `/` | 96 | 100 | 100 | 69 | 2.8 s | 0.000 | 23 ms | - |
| busca | `/escolas?q=Demonstra` | 97 | 100 | 100 | 66 | 2.7 s | 0.000 | 21 ms | - |
| escola | `/escolas/99001001` | 96 | 100 | 100 | 54 | 2.8 s | 0.000 | 21 ms | - |
| lista | `/escolas/99001001/ef-5?ano=2027` | 96 | 100 | 100 | 54 | 2.8 s | 0.000 | 22 ms | - |
| carrinho | `/carrinho/155fdc1d-cb65-4cd7-bc5d-a500cce5c993` | 97 | 100 | 100 | 63 | 2.7 s | 0.000 | 23 ms | - |
| enviar-lista | `/enviar-lista` (redirecionou para `/entrar`) | 93 | 100 | 100 | 66 | 3.2 s | 0.000 | 21 ms | - |
| login | `/entrar` | 95 | 100 | 100 | 66 | 3.0 s | 0.000 | 23 ms | - |
| papelaria | `/papelaria` (redirecionou para `/entrar`) | 99 | 100 | 100 | 66 | 1.9 s | 0.000 | 23 ms | - |
| como-funciona | `/como-funciona` | 96 | 100 | 100 | 69 | 2.7 s | 0.000 | 19 ms | - |
