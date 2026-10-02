# Lighthouse mobile (depois) · S28

Build de produção local (`next start`, porta 3002), Supabase local com dados de demonstração, Lighthouse 12, emulação mobile padrão (4G simulado, CPU 4x). Mediana de 3 execuções por página. Páginas logadas usam o cookie de sessão de uma conta de demonstração (`@listacerta.test`). Gerado por `scripts/s28-medir.mjs` em 2026-09-29T13:56:44.761Z.

| Página | Rota | Desempenho | Acessibilidade | Boas práticas | SEO | LCP | CLS | TBT | JS transferido | Auditorias de a11y reprovadas |
|---|---|---|---|---|---|---|---|---|---|---|
| inicio | `/` | 97 | 100 | 96 | 69 | 2.7 s | 0.000 | 23 ms | 204 KB | - |
| busca | `/escolas?q=Demonstra` | 97 | 100 | 96 | 66 | 2.7 s | 0.000 | 43 ms | 213 KB | - |
| enviar-lista | `/enviar-lista` | 93 | 100 | 96 | 63 | 3.3 s | 0.000 | 43 ms | 314 KB | - |
| login | `/entrar` | 94 | 100 | 96 | 66 | 3.1 s | 0.000 | 46 ms | 298 KB | - |
