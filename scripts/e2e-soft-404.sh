#!/usr/bin/env bash
# Prova do soft-404: status HTTP real de notFound()/redirect(). Uso: BASE=http://127.0.0.1:3001 scripts/e2e-soft-404.sh
# Pré-requisito: build de produção rodando (`pnpm build && PORT=3001 pnpm start`) sobre banco local com dados demo
# (`pnpm import:inep tests/fixtures/inep-demo.csv --demo && pnpm seed:demo-lists && pnpm seed:demo-claims`).
set -u
BASE="${BASE:-http://127.0.0.1:3001}"
INEP="${INEP:-99001001}"   # escola demo com lista publicada
SERIE="${SERIE:-ef-5}"
fail=0
check() { # <esperado> <caminho> <descrição>
  local got
  got=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$2")
  if [ "$got" = "$1" ]; then r=OK; else r=FALHA; fail=$((fail + 1)); fi
  printf '%-5s esperado %s obtido %s  %s  (%s)\n' "$r" "$1" "$got" "$2" "$3"
}
check 200 "/escolas/$INEP" "perfil válido"
check 200 "/escolas/$INEP/$SERIE?ano=2027" "lista válida"
check 404 "/escolas/00000000" "INEP inexistente"
check 404 "/escolas/abc" "INEP malformado"
check 404 "/escolas/$INEP/serie-invalida" "série inválida"
check 404 "/escolas/00000000/reivindicar" "reivindicação de escola inexistente"
check 404 "/escolas/00000000/reivindicar/confirmar?token=x" "confirmação de escola inexistente"
check 307 "/papelaria/leads/LC-ZZZZ" "anônimo em lead: redireciona ao login"
check 307 "/cotacao/LC-ZZZZ" "anônimo em cotação: redireciona ao login"
check 307 "/admin/reivindicacoes/00000000-0000-0000-0000-000000000000" "anônimo em admin: redireciona"
check 307 "/papelaria" "anônimo em papelaria: redireciona ao login"
check 307 "/escola" "anônimo em escola: redireciona ao login"
# S29 T10: uma rota por `loading.tsx` novo (admin, conta, cotacao, enviar-lista, carrinho, cadastrar-papelaria). O carregando não pode
# transformar o guard em 200. Id inválido em rota privada também redireciona (o guard vem antes do `notFound()`); 404 de id só
# se prova logado (roteiros E2E de cada fatia).
check 307 "/admin" "anônimo em admin (loading.tsx de admin)"
check 307 "/conta" "anônimo em conta (loading.tsx de conta)"
check 307 "/cotacao/nova" "anônimo em cotação nova (loading.tsx de cotacao)"
check 307 "/enviar-lista" "anônimo em enviar-lista (loading.tsx de enviar-lista)"
check 307 "/enviar-lista/abc" "anônimo em envio com id inválido"
check 307 "/carrinho/novo" "anônimo em carrinho novo (loading.tsx de carrinho)"
check 307 "/carrinho/abc" "anônimo em carrinho com id inválido"
# S29 T13: `app/conta/notificacoes/loading.tsx` existe (a página não chama `notFound()`); anônimo em qualquer rota de conta segue 307.
check 307 "/conta/notificacoes" "anônimo em notificações (loading.tsx de conta/notificacoes)"
check 307 "/conta/privacidade" "anônimo em privacidade"
check 307 "/conta/alunos/novo" "anônimo em aluno novo"
check 307 "/conta/alunos/abc/editar" "anônimo em edição de aluno com id inválido"
# S29 T14: `/conta/envios` (Meus envios) não chama `notFound()`; anônimo redireciona.
check 307 "/conta/envios" "anônimo em meus envios"
check 200 "/cadastrar-papelaria" "cadastro de papelaria não tem guard: 200 esperado (loading.tsx de cadastrar-papelaria)"
# Logado, id inexistente = 404 de verdade. `FAMILIA_COOKIE`/`ADMIN_COOKIE` = valor do cabeçalho Cookie das contas de demonstração
# (login por link mágico); sem eles esta parte é pulada. Foi o que pegou o soft-404 dos loading.tsx de admin/conta/cotacao/enviar-lista.
checkc() { # <cookie> <esperado> <caminho> <descrição>
  local got
  got=$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: $1" "$BASE$3")
  if [ "$got" = "$2" ]; then r=OK; else r=FALHA; fail=$((fail + 1)); fi
  printf '%-5s esperado %s obtido %s  %s  (%s)\n' "$r" "$2" "$got" "$3" "$4"
}
NOID="00000000-0000-4000-8000-0000000fffff"
if [ -n "${FAMILIA_COOKIE:-}" ]; then
  checkc "$FAMILIA_COOKIE" 404 "/cotacao/LC-ZZZZ" "logada: cotação inexistente"
  # S29 T12: carrinho inexistente = 404 de verdade (o `loading.tsx` antigo de `carrinho/[id]` dava 200, D-043).
  checkc "$FAMILIA_COOKIE" 404 "/carrinho/$NOID" "logada: carrinho inexistente"
  checkc "$FAMILIA_COOKIE" 404 "/carrinho/$NOID/checkout" "logada: checkout de carrinho inexistente"
  checkc "$FAMILIA_COOKIE" 404 "/carrinho/abc" "logada: carrinho com id malformado"
  checkc "$FAMILIA_COOKIE" 404 "/enviar-lista/$NOID" "logada: envio inexistente"
  checkc "$FAMILIA_COOKIE" 404 "/enviar-lista/$NOID/revisar" "logada: revisão de envio inexistente"
  checkc "$FAMILIA_COOKIE" 404 "/conta/alunos/$NOID/editar" "logada: aluno inexistente"
  # S29 T13: com o `loading.tsx` de notificações, a rota real continua 200 e as vizinhas com `notFound()` continuam 404.
  checkc "$FAMILIA_COOKIE" 200 "/conta/notificacoes" "logada: central de notificações (loading.tsx próprio)"
  checkc "$FAMILIA_COOKIE" 200 "/conta/notificacoes?pagina=99" "logada: página alta da central não vira 404 nem erro"
  checkc "$FAMILIA_COOKIE" 200 "/conta" "logada: hub"
  checkc "$FAMILIA_COOKIE" 200 "/conta/privacidade" "logada: privacidade"
  checkc "$FAMILIA_COOKIE" 200 "/conta/envios" "logada: meus envios"
  checkc "$FAMILIA_COOKIE" 404 "/conta/alunos/abc/editar" "logada: aluno com id malformado"
fi
if [ -n "${ADMIN_COOKIE:-}" ]; then
  checkc "$ADMIN_COOKIE" 404 "/admin/reivindicacoes/$NOID" "admin: pedido inexistente"
  checkc "$ADMIN_COOKIE" 404 "/admin/revisao/$NOID" "admin: revisão inexistente"
fi
# S29 T15: papelaria. `app/papelaria/loading.tsx` e `creditos/loading.tsx` davam 200 para lead e fatura inexistentes (D-043);
# os carregando agora vivem em grupos de rota que não cobrem as páginas com `notFound()`. `PAPELARIA_COOKIE` = Cookie de papelaria@listacerta.test.
check 404 "/papelarias/nao-existe-slug-s29" "perfil público de papelaria inexistente"
check 404 "/papelarias/Slug_Invalido" "perfil público com slug malformado"
check 307 "/papelaria/creditos/faturas/abc" "anônimo em fatura com id inválido"
if [ -n "${PAPELARIA_COOKIE:-}" ]; then
  checkc "$PAPELARIA_COOKIE" 404 "/papelaria/leads/LC-ZZZZ" "papelaria: lead inexistente"
  checkc "$PAPELARIA_COOKIE" 404 "/papelaria/leads/abc" "papelaria: lead com código malformado"
  checkc "$PAPELARIA_COOKIE" 404 "/papelaria/creditos/faturas/$NOID" "papelaria: fatura inexistente"
  checkc "$PAPELARIA_COOKIE" 404 "/papelaria/creditos/faturas/abc" "papelaria: fatura com id malformado"
  checkc "$PAPELARIA_COOKIE" 200 "/papelaria" "papelaria: painel (loading.tsx do grupo painel)"
  checkc "$PAPELARIA_COOKIE" 200 "/papelaria/leads" "papelaria: lista de leads"
  checkc "$PAPELARIA_COOKIE" 200 "/papelaria/creditos" "papelaria: créditos e plano"
  checkc "$PAPELARIA_COOKIE" 200 "/papelaria/areas" "papelaria: bairros"
  checkc "$PAPELARIA_COOKIE" 200 "/papelaria/desempenho" "papelaria: desempenho"
  checkc "$PAPELARIA_COOKIE" 200 "/papelaria/catalogo" "papelaria: catálogo"
fi
check 404 "/rota-inexistente-s29" "404 global"
check 200 "/" "home"
exit $((fail > 0))
