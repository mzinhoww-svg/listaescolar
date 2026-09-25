#!/usr/bin/env bash
# E2E da S08 (pipeline real de extração com PROVEDORES FALSOS) com agent-browser, build de produção local da trilha 2.
# NUNCA chama o OpenRouter: FAKE_AI_SCRIPT (JSON por rota) só vale com APP_ENV local/development/preview/staging.
# Pré-requisitos: `pnpm db:start && pnpm db:reset`; `node scripts/supa.mjs env > .env.local` (só neste worktree, ignorado
# pelo git); `pnpm build`; worker servido com o mesmo script falso (ver docs/superpowers/e2e/S08.md). Sem chaves aqui.
set -u
cd "$(dirname "$0")/.."
# Trava de custo: chave/modelos reais no shell poderiam gastar dinheiro de verdade. Aborta e nunca os repassa.
for v in OPENROUTER_KEY AI_MODEL_CHEAP AI_MODEL_STRONG AI_MODEL_VISION; do
  if [ -n "${!v:-}" ]; then echo "ABORTADO: $v está definida no shell; rode com um shell limpo (E2E só usa provedor falso)." >&2; exit 2; fi
done
NOAI="env -u OPENROUTER_KEY -u AI_MODEL_CHEAP -u AI_MODEL_STRONG -u AI_MODEL_VISION"
BASE=${BASE:-http://127.0.0.1:3002}
MAILPIT=${MAILPIT:-http://127.0.0.1:54524}
WORKER=${WORKER:-http://127.0.0.1:54521/functions/v1/ocr-worker}
SECRET_FILE=${SECRET_FILE:-/tmp/s08-worker-secret}
DB=${DB:-supabase_db_listacerta-t2}
OUT=docs/superpowers/e2e/screenshots
TMP=$(mktemp -d)
PASS=0; FAIL=0
export AGENT_BROWSER_SESSION_PREFIX=t2s08
ab() { local s=$1; shift; AGENT_BROWSER_SESSION="t2s08-$s" agent-browser "$@"; }
sql() { docker exec "$DB" psql -U postgres -At -c "$1"; }
ok() { PASS=$((PASS+1)); echo "PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL  $1  ($2)"; }
expect_text() { local t; t=$(ab "$1" get text body 2>/dev/null); if grep -qF -- "$2" <<<"$t"; then ok "$3"; else bad "$3" "esperava '$2'; veio: ${t:0:200}"; fi; }
wait_text() { for _ in $(seq 1 "$3"); do ab "$1" get text body 2>/dev/null | grep -qF -- "$2" && return 0; sleep 1; done; return 1; }
last_id() { sql "select id from public.list_submissions order by created_at desc limit 1"; }
chain() { sql "select string_agg(decision||':'||attempt||':'||justification||':'||model, ' > ' order by started_at, attempt) from public.ai_decisions where entity_id='$1'"; }

# --- scripts falsos (dados sintéticos, sem nada de escola real) ---
LOW='{"items":[{"name":"Caderno brochura (exemplo)","quantity":2,"unit":"un","category":"papelaria","confidence":0.5}],"overallConfidence":0.5}'
GOOD='{"items":[{"name":"Caderno brochura (exemplo)","quantity":2,"unit":"un","category":"papelaria","confidence":0.95},{"name":"Pacote de sulfite para a sala (exemplo)","quantity":1,"unit":"pct","category":"papelaria","confidence":0.9},{"name":"Lápis preto (exemplo)","quantity":12,"unit":"un","category":"escrita","confidence":0.9}],"overallConfidence":0.92}'
FAST="{\"cheap\":[{\"json\":$LOW}],\"strong\":[{\"json\":$GOOD}],\"vision\":[{\"json\":$LOW}]}"
SLOW="{\"cheap\":[{\"delayMs\":13000,\"json\":$LOW}],\"strong\":[{\"json\":$GOOD}],\"vision\":[{\"delayMs\":13000,\"json\":$LOW}]}"
export FAKE_FAST="$FAST" FAKE_SLOW="$SLOW"

start_app() { # script falso ("" = sem provedor)
  stop_app
  if [ -n "$1" ]; then
    $NOAI APP_ENV=local FAKE_AI_SCRIPT="$1" ./node_modules/.bin/next start -p 3002 >/tmp/s08-app.log 2>&1 &
  else
    $NOAI APP_ENV=local ./node_modules/.bin/next start -p 3002 >/tmp/s08-app.log 2>&1 &
  fi
  echo $! >/tmp/s08-app.pid
  for _ in $(seq 1 30); do curl -s -o /dev/null "$BASE/" && return 0; sleep 1; done
}
stop_app() { [ -f /tmp/s08-app.pid ] && kill "$(cat /tmp/s08-app.pid)" 2>/dev/null; sleep 1; local p; p=$(lsof -ti tcp:3002 -sTCP:LISTEN); [ -n "$p" ] && kill "$p" 2>/dev/null; sleep 1; }

login() { # sessão, e-mail, next
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
printf '%%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%%%EOF\n' > "$TMP/lista.pdf"
fill_form() {
  wait_text "$1" "Enviar para revisão" 20; sleep 1
  for _ in 1 2 3 4 5 6; do ab "$1" upload '#file' "$TMP/lista.pdf" >/dev/null; ab "$1" get text '[data-testid=picked]' 2>/dev/null | grep -q . && break; sleep 1; done
  ab "$1" select '#grade' "5º ano" >/dev/null
  ab "$1" check 'input[name=consent]' >/dev/null
}
submit() { ab p open "$BASE/enviar-lista" >/dev/null; fill_form p; ab p click 'button[type=submit]' >/dev/null; }

# O seed do banco aponta as rotas para o OpenRouter; o E2E as troca por dado (ai_settings) para o provedor falso.
fake_routes() { sql "update public.ai_settings set routes = jsonb_build_object('cheap',jsonb_build_object('provider','fake','timeout_ms',20000),'strong',jsonb_build_object('provider','fake','timeout_ms',20000),'vision',jsonb_build_object('provider','fake','timeout_ms',20000))" >/dev/null;}
fake_routes
for s in p; do ab $s close >/dev/null 2>&1; done
echo "== fase 1: app com script falso (barato baixa confiança -> forte aceita)"
start_app "$FAST"
ab p set viewport 390 844 >/dev/null
login p parent@listacerta.test %2Fenviar-lista

echo "== 1) escalada barato -> forte"
submit
wait_text p "Lista lida" 40 && ok "resultado: 'Lista lida'" || bad "resultado" "$(ab p get text body | head -c 200)"
expect_text p "Pacote de sulfite para a sala (exemplo)" "itens do forte na tela"
expect_text p "possível uso coletivo" "alerta de item coletivo (sinalização para revisão)"
ab p screenshot "$OUT/S08-resultado.png" >/dev/null
S1=$(last_id)
[[ $(chain "$S1") == "escalated:1:low_confidence:fake-cheap > accepted:2:accepted:fake-strong" ]] && ok "ai_decisions: escalated -> accepted" || bad "cadeia" "$(chain "$S1")"
[[ $(sql "select count(*) from public.ai_decisions where entity_id='$S1' and (to_jsonb(ai_decisions)::text ilike '%caderno%' or to_jsonb(ai_decisions)::text ilike '%sulfite%')") == 0 ]] && ok "decisões sem conteúdo do documento" || bad "conteúdo em decisões" ""
[[ $(sql "select status||'/'||is_demo from public.list_submissions where id='$S1'") == "review_needed/false" ]] && ok "banco: review_needed, não demo" || bad "estado" ""

echo "== 2) ai_settings muda o comportamento sem deploy (limiar 0,99 -> baixa confiança final)"
sql "update public.ai_settings set confidence_threshold=0.99" >/dev/null
sleep 32   # cache de 30 s das settings
submit
wait_text p "Lista lida" 40 && ok "resultado com baixa confiança" || bad "resultado 2" ""
expect_text p "revisão obrigatória antes de qualquer publicação" "aviso de baixa confiança visível"
ab p screenshot "$OUT/S08-baixa-confianca.png" >/dev/null
S2=$(last_id)
[[ $(chain "$S2") == "escalated:1:low_confidence:fake-cheap > accepted:2:low_confidence:fake-strong" ]] && ok "ai_decisions: accepted com low_confidence" || bad "cadeia 2" "$(chain "$S2")"
sql "update public.ai_settings set confidence_threshold=0.8" >/dev/null

echo "== 3) falha fechada: rotas em openrouter sem chave/modelo (dado, não deploy)"
sql "update public.ai_settings set routes = jsonb_build_object('cheap',jsonb_build_object('provider','openrouter','timeout_ms',20000),'strong',jsonb_build_object('provider','openrouter','timeout_ms',20000),'vision',jsonb_build_object('provider','openrouter','timeout_ms',20000))" >/dev/null
sleep 32
submit
sleep 6
S3=$(last_id)
[[ $(sql "select status from public.list_submissions where id='$S3'") == processing_async ]] && ok "sem modelo/chave: envio segue assíncrono (nada inventado)" || bad "estado 3" "$(sql "select status from public.list_submissions where id='$S3'")"
[[ $(sql "select count(*) from public.ai_decisions where entity_id='$S3'") == 0 ]] && ok "falha fechada: nenhuma decisão, nenhuma rede" || bad "decisões 3" ""
[[ $(sql "select count(*) from public.ocr_jobs where submission_id='$S3'") == 0 ]] && ok "nenhum resultado gravado" || bad "ocr_jobs 3" ""
ab p screenshot "$OUT/S08-falha-fechada.png" >/dev/null
fake_routes
sql "update public.jobs set status='dead' where submission_id='$S3'" >/dev/null

echo "== fase 2: app com barato lento (13 s > orçamento de 10 s); o worker (script rápido) refaz"
start_app "$SLOW"
sleep 32   # a sessão do navegador continua logada
submit
wait_text p "Continuar aguardando" 40 && ok "estado assíncrono após estourar 10 s" || bad "assíncrono" "$(ab p get text body | head -c 200)"
S4=$(last_id)
[[ $(chain "$S4") == "failed:1:provider_timeout:fake-cheap" ]] && ok "orçamento estourado: o roteador fecha a tentativa paga (failed:provider_timeout)" || bad "decisões 4" "$(chain "$S4")"
curl -s -m 100 -X POST -H "x-worker-secret: $(cat "$SECRET_FILE")" "$WORKER" | head -c 200; echo
wait_text p "Lista lida" 90 && ok "worker concluiu; painel mudou sozinho" || bad "worker" "$(ab p get text body | head -c 200)"
[[ $(chain "$S4") == "failed:1:provider_timeout:fake-cheap > escalated:1:low_confidence:fake-cheap > accepted:2:accepted:fake-strong" ]] && ok "worker: mesma cadeia com entity_id do envio (após a decisão do síncrono)" || bad "cadeia worker" "$(chain "$S4")"
ab p screenshot "$OUT/S08-worker.png" >/dev/null

echo "== fase 3: sem OPENROUTER_KEY/modelos/fake -> leitura automática indisponível"
start_app ""
sleep 1
submit
wait_text p "Leitura automática indisponível" 30 && ok "indisponível" || bad "indisponível" "$(ab p get text body | head -c 200)"
ab p screenshot "$OUT/S08-indisponivel.png" >/dev/null
S5=$(last_id)
[[ $(sql "select count(*) from public.ai_decisions where entity_id='$S5'") == 0 ]] && ok "nenhuma decisão sem provedor" || bad "decisões 5" ""
sql "update public.jobs set status='dead' where submission_id='$S5'" >/dev/null

stop_app
ab p close >/dev/null 2>&1
echo "== PASS=$PASS FAIL=$FAIL"
