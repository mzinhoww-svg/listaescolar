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
check 200 "/" "home"
exit $((fail > 0))
