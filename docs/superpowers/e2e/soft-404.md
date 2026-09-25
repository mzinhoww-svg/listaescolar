# E2E chore/soft-404 · status HTTP real de notFound() e redirect()

Causa: `app/loading.tsx` raiz (e os de `/escolas`, `/entrar`, leads, importações) faziam o Next 16 enviar 200 em streaming antes de `notFound()`/`redirect()` rodarem. Correção: loadings removidos das rotas públicas; onde ainda há esqueleto, ele fica em route group `(lista)` que não envolve páginas de detalhe.

Ambiente: trilha 1, dados 100% demo. `pnpm db:reset`, `.env.local` a partir de `node scripts/supa.mjs env` (só chaves locais; não versionado), `pnpm import:inep tests/fixtures/inep-demo.csv --demo && pnpm seed:demo-lists && pnpm seed:demo-claims`, `pnpm build && PORT=3001 pnpm start` (build de produção). Script: `scripts/e2e-soft-404.sh` (`BASE`, `INEP`, `SERIE` configuráveis).

| Caminho | Esperado | Antes | Depois |
|---|---|---|---|
| /escolas/99001001 (perfil válido) | 200 | 200 | 200 |
| /escolas/99001001/ef-5?ano=2027 (lista válida) | 200 | 200 | 200 |
| /escolas/00000000 (INEP inexistente) | 404 | 200 | 404 |
| /escolas/abc (INEP malformado) | 404 | 200 | 404 |
| /escolas/99001001/serie-invalida | 404 | 200 | 404 |
| /escolas/00000000/reivindicar | 404 | 200 | 404 |
| /escolas/00000000/reivindicar/confirmar?token=x | 404 | 200 | 404 |
| /papelaria/leads/LC-ZZZZ (anônimo) | 307 login | 307 | 307 |
| /cotacao/LC-ZZZZ (anônimo) | 307 login | 307 | 307 |
| /admin/reivindicacoes/<uuid> (anônimo) | 307 | 307 | 307 |
| / | 200 | 200 | 200 |

Limite: código de lead/cotação inexistente com sessão autenticada (404 do `notFound()` da página) não foi exercitado por curl (exige login por magic link); as páginas `[code]` deixaram de ter qualquer `loading.tsx` ancestral, então seguem a mesma mecânica dos casos acima.
