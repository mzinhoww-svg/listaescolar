#!/usr/bin/env bash
# Helpers comuns dos roteiros E2E com agent-browser (D-091, S18): as fatias S06 a S27 repetiam ~40 linhas quase
# idênticas (ab, sql, ok/bad, expect_text, wait_text, login...) em cada scripts/e2e-sNN.sh. Extraído para uso a
# partir da S18 em diante (scripts/e2e-s18.sh); os 17 roteiros já executados (S06–S27) NÃO foram retrofitados —
# cada um já rodou com sucesso para a própria fatia e não é reexecutado em CI; o risco de introduzir uma
# regressão mecânica num script arquivístico supera o ganho de legibilidade (Ruling, ledger.md S18).
#
# Uso: o script chamador define BASE, DB, MAILPIT e AGENT_BROWSER_SESSION_PREFIX (ou aceita os defaults abaixo)
# ANTES de `source "$(dirname "$0")/e2e-lib.sh"`; PASS/FAIL ficam no escopo do chamador.
set -u

: "${BASE:=http://127.0.0.1:3003}"
: "${MAILPIT:=http://127.0.0.1:54624}"
: "${DB:=supabase_db_listacerta-t3}"
: "${AGENT_BROWSER_SESSION_PREFIX:=e2e}"
PASS=${PASS:-0}
FAIL=${FAIL:-0}

# Sessão do agent-browser prefixada (evita colisão entre fatias/trilhas rodando em paralelo).
ab() {
  local s=$1; shift
  AGENT_BROWSER_SESSION="${AGENT_BROWSER_SESSION_PREFIX}-$s" agent-browser "$@"
  # Achado do E2E da S16: `get text body` logo após `open` às vezes pega HTML ainda em streaming (SSR/RSC).
  if [ "${1:-}" = "open" ]; then sleep 1; fi
}
sql() { docker exec "$DB" psql -U postgres -Atq -c "$1"; }
sql_stdin() { docker exec -i "$DB" psql -U postgres -At -v ON_ERROR_STOP=1; }
ok() { PASS=$((PASS+1)); echo "PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL  $1  ($2)"; }
eq() { if [[ "$1" == "$2" ]]; then ok "$3"; else bad "$3" "esperava '$2'; veio '$1'"; fi; }
has() { if grep -qF -- "$2" <<<"$1"; then ok "$3"; else bad "$3" "esperava conter '$2'; veio: ${1:0:200}"; fi; }
lacks() { if grep -qF -- "$2" <<<"$1"; then bad "$3" "não devia conter '$2'"; else ok "$3"; fi; }
expect_text() { local t; t=$(ab "$1" get text body 2>/dev/null); has "$t" "$2" "$3"; }
absent_text() { local t; t=$(ab "$1" get text body 2>/dev/null); lacks "$t" "$2" "$3"; }
wait_text() { for _ in $(seq 1 "$3"); do ab "$1" get text body 2>/dev/null | grep -qF -- "$2" && return 0; sleep 1; done; return 1; }
wait_ok() { wait_text "$1" "$2" "${4:-30}" && ok "$3" || bad "$3" "esperava '$2'; veio: $(ab "$1" get text body 2>/dev/null | head -c 220)"; }
shot() { sleep 1; ab "$1" screenshot "$2" >/dev/null; }

# Login por link mágico (Mailpit local): sessão, e-mail, next.
login() {
  local s=$1 email=$2 next=$3 before after id link
  before=$(curl -s "$MAILPIT/api/v1/search?query=to:$email" | python3 -c "import sys,json;print(json.load(sys.stdin)['messages_count'])")
  ab "$s" open "$BASE/entrar?next=$next" >/dev/null
  ab "$s" fill '#email' "$email" >/dev/null
  ab "$s" press Enter >/dev/null
  for _ in $(seq 1 20); do
    after=$(curl -s "$MAILPIT/api/v1/search?query=to:$email" | python3 -c "import sys,json;print(json.load(sys.stdin)['messages_count'])")
    [ "$after" -gt "$before" ] && break; sleep 1
  done
  id=$(curl -s "$MAILPIT/api/v1/search?query=to:$email" | python3 -c "import sys,json;print(json.load(sys.stdin)['messages'][0]['ID'])")
  link=$(curl -s "$MAILPIT/api/v1/message/$id" | python3 -c "import sys,json,re;print(re.findall(r'https?://[^\s\"<>]+', json.load(sys.stdin)['Text'])[0])")
  ab "$s" open "$link" >/dev/null
}

# clique pelo texto exato (o agent-browser não tem seletor estável por texto).
clicktext() { ab "$1" eval "(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>x.textContent.trim()==='$2');if(!b)return 'notfound';b.click();return 'ok'})()" | grep -q ok; }
