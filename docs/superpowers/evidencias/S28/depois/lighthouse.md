# Lighthouse mobile (depois) · S28

Build de produção local (`next start`, porta 3002), Supabase local com dados de demonstração, Lighthouse 12, emulação mobile padrão (4G simulado, CPU 4x). Mediana de 1 execuções por página. Páginas logadas usam o cookie de sessão de uma conta de demonstração (`@listacerta.test`). Gerado por `scripts/s28-medir.mjs` em 2026-09-29T13:46:46.463Z.

| Página | Rota | Desempenho | Acessibilidade | Boas práticas | SEO | LCP | CLS | TBT | Auditorias de a11y reprovadas |
|---|---|---|---|---|---|---|---|---|---|
| cotacao-nova | `/cotacao/nova` | 95 | 100 | 100 | 63 | 3.0 s | 0.000 | 44 ms | - |
| conta | `/conta` | 100 | 100 | 100 | 63 | 1.9 s | 0.000 | 18 ms | - |
| escola-painel | `/escola` | erro | | | | | | | Command failed: npx --yes lighthouse@12 http://127.0.0.1:3002/escola --form-factor=mobile --output=json --output-path=/var/folders/cw/yfgzzd6j73l2lsf0352bmc940000gq/T/s28-medir-depois/escola-painel-0.json --quiet --chrome-flags=--headless=new --extra-headers=/var/folders/cw/yfgzzd6j73l2lsf0352bmc940000gq/T/s28-medir-depois/hdr-pai.json |
| admin | `/admin` | 96 | 100 | 100 | 66 | 2.8 s | 0.000 | 20 ms | - |
| b2b | `/b2b` | 100 | 100 | 100 | 66 | 1.8 s | 0.000 | 20 ms | - |
| parceiros | `/parceiros` | 100 | 100 | 100 | 69 | 1.8 s | 0.000 | 18 ms | - |
