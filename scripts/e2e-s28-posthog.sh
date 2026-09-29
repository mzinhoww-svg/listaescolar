#!/usr/bin/env bash
# E2E da medição de uso da S28 (ADR-007) com agent-browser, build de produção local da trilha 2 (porta 3002) e um
# receptor local no lugar do PostHog. Cobre: sem chave nada existe; com chave, NADA persistente nem enviado antes do
# aceite (localStorage, cookie, requisições a /ingest, receptor); recusar não envia nada; aceitar libera os eventos da
# página (landing_viewed, school_searched) pelo proxy /ingest, sem cookie e sem PII.
# Uso: set -a; source .env.local; set +a; bash scripts/e2e-s28-posthog.sh   (faz o build com a chave falsa; SKIP_BUILD=1 pula)
set -u
cd "$(dirname "$0")/.."
BASE=${BASE:-http://127.0.0.1:3002}
RECV_PORT=${RECV_PORT:-54999}
LOG=${LOG:-/tmp/e2e-s28-posthog.ndjson}
RUN=$(date +%s)
export AGENT_BROWSER_SESSION_PREFIX="t2ph-$RUN"
source "$(dirname "$0")/e2e-lib.sh"

cleanup() { kill "${SPID:-}" "${RPID:-}" 2>/dev/null; for s in unset deny accept; do agent-browser close --session "${AGENT_BROWSER_SESSION_PREFIX}-$s" >/dev/null 2>&1; done; }
trap cleanup EXIT

node scripts/e2e-posthog-receiver.mjs "$RECV_PORT" "$LOG" & RPID=$!
export NEXT_PUBLIC_POSTHOG_KEY=phc_fake NEXT_PUBLIC_POSTHOG_HOST="http://127.0.0.1:$RECV_PORT" APP_ENV=local
if [ "${SKIP_BUILD:-0}" != "1" ]; then pnpm build >/tmp/e2e-s28-posthog-build.log 2>&1 || { echo "build falhou"; tail -20 /tmp/e2e-s28-posthog-build.log; exit 1; }; fi
PORT=3002 pnpm start -p 3002 >/tmp/e2e-s28-posthog-start.log 2>&1 & SPID=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "$BASE/" && break; sleep 1; done

ev() { ab "$1" eval "$2" 2>/dev/null | tr -d '"'; }
count_log() { wc -l <"$LOG" | tr -d ' '; }
names_log() { python3 -c "
import sys,json
out=[]
for l in open('$LOG'):
    d=json.loads(l); b=d['body'] or {}
    evs=b.get('batch') or [b]
    out+= [e.get('event') for e in evs]
print(','.join(sorted(out)))"; }

echo "== 1) sem escolha: aviso visível, nada persistente, nada enviado"
ab unset open "$BASE/" >/dev/null; sleep 4
eq "$(ev unset "!!document.querySelector('[aria-label=\"Medição de uso\"]')")" "true" "aviso de medição aparece"
eq "$(ev unset "localStorage.length")" "0" "localStorage vazio antes do aceite"
eq "$(ev unset "document.cookie.split(';').filter(c=>c.includes('lc_')||c.includes('ph_')).length")" "0" "nenhum cookie de medição antes do aceite"
eq "$(ev unset "performance.getEntriesByType('resource').filter(e=>e.name.includes('/ingest')).length")" "0" "nenhuma requisição a /ingest antes do aceite"
ab unset open "$BASE/escolas?q=maria" >/dev/null; sleep 8
eq "$(count_log)" "0" "receptor não recebeu nada antes da escolha (nem depois de navegar e esperar o lote)"
eq "$(ev unset "localStorage.length")" "0" "localStorage continua vazio depois de navegar"

echo "== 2) recusar: nada é enviado e a escolha é lembrada"
ab deny open "$BASE/" >/dev/null; sleep 3
clicktext deny "Recusar" && ok "clicou em Recusar" || bad "Recusar" "botão não achado"
ab deny open "$BASE/escolas?q=maria" >/dev/null; sleep 8
eq "$(count_log)" "0" "receptor continua sem nada depois de recusar"
eq "$(ev deny "localStorage.getItem('lc_analytics_consent_v1')")" "denied" "escolha 'denied' guardada"
eq "$(ev deny "localStorage.getItem('lc_analytics_id')")" "null" "nenhum identificador guardado"
eq "$(ev deny "!!document.querySelector('[aria-label=\"Medição de uso\"]')")" "false" "aviso não reaparece"

echo "== 3) aceitar: os eventos da página saem pelo proxy, sem cookie e sem PII"
ab accept open "$BASE/" >/dev/null; sleep 3
clicktext accept "Aceitar" && ok "clicou em Aceitar" || bad "Aceitar" "botão não achado"
sleep 2
ab accept open "$BASE/escolas?q=maria" >/dev/null; sleep 8
n=$(count_log); [ "$n" -gt 0 ] && ok "receptor recebeu $n requisição(ões) pelo proxy /ingest" || bad "receptor" "nada recebido depois do aceite"
names=$(names_log)
has "$names" "landing_viewed" "landing_viewed (da página anterior ao aceite, liberado na mesma página) chegou"
has "$names" "school_searched" "school_searched chegou depois do aceite"
raw=$(cat "$LOG")
lacks "$raw" "maria" "o texto da busca não vai no evento (só query_length)"
lacks "$raw" "@" "nenhum e-mail nos eventos"
eq "$(grep -c '"hasCookie":true' "$LOG")" "0" "nenhuma requisição levou cookie ao proxy"
eq "$(ev accept "localStorage.getItem('lc_analytics_consent_v1')")" "granted" "escolha 'granted' guardada só depois do aceite"
eq "$(ev accept "!!localStorage.getItem('lc_analytics_id')")" "true" "identificador anônimo guardado só depois do aceite"
has "$raw" '"query_length":5' "query_length numérico, sem o texto"

echo; echo "RESULTADO: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = 0 ]
