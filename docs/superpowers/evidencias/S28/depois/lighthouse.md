# Lighthouse mobile (depois) · S28

Build de produção local (`next start`, porta 3002), Supabase local com dados de demonstração, Lighthouse 12, emulação mobile padrão (4G simulado, CPU 4x). Mediana de 3 execuções por página. Páginas logadas usam o cookie de sessão de uma conta de demonstração (`@listacerta.test`). Gerado por `scripts/s28-medir.mjs` em 2026-09-29T14:05:57.878Z.

| Página | Rota | Desempenho | Acessibilidade | Boas práticas | SEO | LCP | CLS | TBT | JS transferido | Auditorias de a11y reprovadas |
|---|---|---|---|---|---|---|---|---|---|---|
| inicio | `/` | 96 | 100 | 100 | 69 | 2.8 s | 0.000 | 20 ms | 224 KB | - |
| busca | `/escolas?q=Demonstra` | 96 | 100 | 100 | 66 | 2.8 s | 0.000 | 19 ms | 230 KB | - |
| escola | `/escolas/99001001` | 96 | 100 | 100 | 66 | 2.8 s | 0.000 | 20 ms | 225 KB | - |
| lista | `/escolas/99001001/ef-5?ano=2027` | 96 | 100 | 100 | 63 | 2.8 s | 0.000 | 21 ms | 227 KB | - |
| carrinho | `/carrinho/` (redirecionou para `/entrar`) | 98 | 100 | 100 | 66 | 2.4 s | 0.000 | 18 ms | 316 KB | - |
| enviar-lista | `/enviar-lista` | 99 | 100 | 100 | 63 | 2.3 s | 0.000 | 19 ms | 329 KB | - |
| login | `/entrar` | 100 | 100 | 100 | 66 | 1.8 s | 0.000 | 18 ms | 316 KB | - |
| papelaria | `/papelaria` | 95 | 100 | 100 | 66 | 3.0 s | 0.000 | 39 ms | 222 KB | - |
| como-funciona | `/como-funciona` | 96 | 100 | 100 | 69 | 2.8 s | 0.000 | 18 ms | 224 KB | - |
| cotacao-nova | `/cotacao/nova` | 97 | 100 | 100 | 63 | 2.6 s | 0.000 | 19 ms | 227 KB | - |
| conta | `/conta` | 97 | 100 | 100 | 63 | 2.7 s | 0.000 | 19 ms | 217 KB | - |
| escola-painel | `/escola` | erro | | | | | | | | Command failed: npx --yes lighthouse@12 http://127.0.0.1:3002/escola --form-factor=mobile --output=json --output-path=/var/folders/cw/yfgzzd6j73l2lsf0352bmc940000gq/T/s28-medir-depois/escola-painel-0.json --quiet --chrome-flags=--headless=new --extra-headers=/var/folders/cw/yfgzzd6j73l2lsf0352bmc940000gq/T/s28-medir-depois/hdr-pai.json |
| admin | `/admin` | 96 | 100 | 100 | 66 | 2.8 s | 0.000 | 19 ms | 321 KB | - |
| b2b | `/b2b` | 96 | 100 | 100 | 66 | 2.8 s | 0.000 | 18 ms | 225 KB | - |
| parceiros | `/parceiros` | 100 | 100 | 100 | 69 | 1.8 s | 0.000 | 19 ms | 224 KB | - |
