#!/usr/bin/env bash
# E2E da medição de uso da S28 (ADR-007) com agent-browser, build de produção local da trilha 2 (porta 3002) e um
# receptor local no lugar do PostHog. Cobre: sem chave nada existe; com chave, NADA persistente nem enviado antes do
# aceite (localStorage, cookie, requisições a /ingest, receptor); recusar não envia nada; aceitar libera os eventos da
# página (landing_viewed, school_searched) pelo proxy /ingest, sem cookie e sem PII; o proxy não repassa
# referer, cookie, x-forwarded-for nem user-agent do usuário.
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
eq "$(ev unset "(()=>{const b=[...document.querySelectorAll('[aria-label=\"Medição de uso\"] button')];return b.length===2&&b[0].className===b[1].className&&b.map(x=>x.textContent).join('|')==='Aceitar|Recusar'})()")" "true" "aviso na tela: Aceitar e Recusar com botões iguais (mesma classe visual)"
eq "$(ev unset "(()=>{const r=document.querySelector('[aria-label=\"Medição de uso\"]').getBoundingClientRect();return r.bottom<=innerHeight+1&&r.height>0})()")" "true" "aviso visível na janela (390 px)"
mkdir -p docs/superpowers/e2e/screenshots; ab unset screenshot docs/superpowers/e2e/screenshots/S28-consentimento.png >/dev/null 2>&1
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

echo "== 4) o proxy /ingest não repassa cabeçalho do usuário (revisão I1/I2/M1/M2)"
curl -s -X POST "$BASE/ingest/batch" -H 'content-type: application/json' -H 'cookie: sb-canary=segredo123' \
  -H 'referer: https://listacerta.test/lista/CANARIO-REFERER' -H 'x-forwarded-for: 203.0.113.77' -H 'x-real-ip: 203.0.113.77' \
  -H 'authorization: Bearer canario' -H 'user-agent: UsuarioReal/9.9 CANARIO-UA' --data '{"api_key":"phc_fake","batch":[]}' >/dev/null
sleep 1
last=$(tail -n 1 "$LOG")
has "$last" '"url":"/batch"' "a requisição direta chegou ao receptor (o destino foi o /batch)"
lacks "$last" "CANARIO-REFERER" "referer do usuário não chegou ao receptor"
lacks "$last" "segredo123" "cookie do usuário não chegou ao receptor"
lacks "$last" "203.0.113.77" "x-forwarded-for e x-real-ip do usuário não chegaram ao receptor"
lacks "$last" "CANARIO-UA" "user-agent do usuário não chegou ao receptor"
lacks "$last" "canario" "authorization do usuário não chegou ao receptor"
eq "$(python3 -c "
import json
d=json.loads(open('$LOG').read().splitlines()[-1]); h=d['headers']
print(sum(1 for k in ('cookie','referer','origin','authorization','x-forwarded-for','x-real-ip') if k in h))")" "0" "nenhum cabeçalho de identificação no receptor"
eq "$(python3 -c "
import json
bad=0
for l in open('$LOG'):
    h=json.loads(l).get('headers',{})
    ua=h.get('user-agent','')
    bad+= any(k in h for k in ('cookie','referer','x-forwarded-for','x-real-ip','authorization')) or 'Mozilla' in ua or 'Chrome' in ua
print(bad)")" "0" "em nenhuma requisição (inclusive as do navegador) chegou cookie, referer, IP ou user-agent do navegador"
eq "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/ingest/decide")" "404" "caminho fora da lista (/ingest/decide) responde 404"
eq "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/ingest/batch")" "405" "GET em /ingest/batch responde 405"
eq "$(head -c 70000 /dev/zero | tr '\0' x | curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/ingest/batch" -H 'content-type: application/json' --data-binary @-)" "413" "corpo acima de 64 KB responde 413"

echo; echo "RESULTADO: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = 0 ]
