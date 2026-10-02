#!/usr/bin/env bash
# E2E da S19 (Segurança e observabilidade) com agent-browser, build de produção local da trilha 3 (porta 3003).
# Cobre: cabeçalhos de segurança e CSP (curl -I) nas páginas principais e em /brand/*; todo <script> do HTML com
# nonce; hidratação sem violação de CSP no console em /, /entrar, /escolas/<inep> (JSON-LD) e na página 403 (parent
# abrindo /admin: reverificação N1); service worker do PushOptIn registrando sob a CSP (N3); documento da revisão
# carregando sob a CSP de Storage (N6); 429 do rate limit (login, lead, envio de lista); alerta do health-check com
# job morto semeado; nenhum dado pessoal nos logs do servidor.
# Pré-requisitos: `pnpm db:reset`; `.env.local` (variáveis de `pnpm db:env`, DEMO_RETAILERS=1, CRON_SECRET); build de
# produção feito (`pnpm build`). O script sobe `PORT=3003 pnpm start` (só se a porta estiver livre) e encerra SÓ o
# servidor que ele abriu. Sessões do agent-browser com prefixo próprio; nunca `close --all`.
set -u
cd "$(dirname "$0")/.."
BASE=${BASE:-http://127.0.0.1:3003}
PORT=${PORT:-3003}
MAILPIT=${MAILPIT:-http://127.0.0.1:54624}
DB=${DB:-supabase_db_listacerta-t3}
OUT=docs/superpowers/e2e/screenshots
INEP=51999190
INEP_JSONLD=51999191
LIST=00000000-0000-4000-8000-00000000d3a0
RUN=$(date +%s)
export AGENT_BROWSER_SESSION_PREFIX="t3s19-$RUN"
LOG_DIR=${LOG_DIR:-$(mktemp -d)}
SERVER_LOG="$LOG_DIR/server.log"
source "$(dirname "$0")/e2e-lib.sh"

SERVER_PID=""
cleanup() {
  for s in anon parent admin; do agent-browser close --session "${AGENT_BROWSER_SESSION_PREFIX}-$s" >/dev/null 2>&1; done
  if [ -n "$SERVER_PID" ]; then
    pkill -P "$SERVER_PID" 2>/dev/null
    kill "$SERVER_PID" 2>/dev/null
  fi
}
trap cleanup EXIT

echo "== 0) servidor de produção local e semente"
if lsof -ti ":$PORT" >/dev/null 2>&1; then
  echo "porta $PORT já ocupada: usando o servidor existente (log do servidor não será verificado)"
  SERVER_LOG=""
else
  set -a; source .env.local; set +a
  PORT=$PORT nohup pnpm start >"$SERVER_LOG" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 60); do curl -s -o /dev/null "$BASE/" && break; sleep 1; done
fi
CRON_SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)
docker exec -i "$DB" psql -U postgres -q -v ON_ERROR_STOP=1 < scripts/e2e-s14-seed.sql >/dev/null
sql_stdin >/dev/null <<SQL
insert into public.schools (inep, name, normalized_name, network, municipality_id, is_demo)
select '$INEP', 'Escola E2E S19', 'escola e2e s19', 'municipal', id, true from public.municipalities where ibge_code = '5103403'
on conflict (inep) do nothing;
-- JSON-LD só sai para escola NÃO demonstrativa e reivindicada/verificada (isIndexableSchool): segunda escola, verificada.
insert into public.schools (inep, name, normalized_name, network, municipality_id, is_demo, verification_status)
select '$INEP_JSONLD', 'Escola Verificada E2E S19', 'escola verificada e2e s19', 'municipal', id, false, 'verified' from public.municipalities where ibge_code = '5103403'
on conflict (inep) do nothing;
SQL
[ "$(sql "select count(*) from public.schools where inep in ('$INEP','$INEP_JSONLD')")" = "2" ] && ok "seed: escola demo $INEP e escola verificada $INEP_JSONLD" || bad "seed" "escolas não criadas"

# Console do navegador: qualquer violação de CSP falha. `console` acumula desde o início da sessão; limpa antes de cada página.
csp_errors() { ab "$1" console 2>/dev/null | grep -iE "content security policy|refused to (execute|load|apply|connect|frame|create a worker)|violates the following" | head -3; }
hydrated() { ab "$1" eval "[...document.querySelectorAll('*')].some(e=>Object.keys(e).some(k=>k.startsWith('__reactFiber')||k.startsWith('__reactContainer')))" | tr -d '"'; }
check_page() { # sessão, url, rótulo
  ab "$1" console --clear >/dev/null 2>&1
  ab "$1" open "$2" >/dev/null
  sleep 2
  local h err; h=$(hydrated "$1"); err=$(csp_errors "$1")
  eq "$h" "true" "$3: hidratou (React anexado ao DOM)"
  if [ -z "$err" ]; then ok "$3: sem violação de CSP no console"; else bad "$3: console" "$err"; fi
}

echo "== 1) cabeçalhos de segurança e CSP (curl -I)"
hdr() { curl -sI "$BASE$1" | tr -d '\r'; }
for path in / /entrar /escolas/$INEP /escolas/$INEP_JSONLD; do
  H=$(hdr "$path")
  CSP=$(grep -i '^content-security-policy:' <<<"$H")
  has "$CSP" "'nonce-" "$path: CSP com nonce"
  has "$CSP" "'strict-dynamic'" "$path: script-src com strict-dynamic"
  SCRIPT_SRC=$(sed -E 's/.*(script-src[^;]*);.*/\1/' <<<"$CSP")
  lacks "$SCRIPT_SRC" "unsafe-inline" "$path: script-src sem unsafe-inline"
  lacks "$SCRIPT_SRC" "unsafe-eval" "$path: script-src sem unsafe-eval (produção)"
  has "$CSP" "worker-src 'self'" "$path: worker-src 'self' (N3)"
  has "$CSP" "manifest-src 'self'" "$path: manifest-src 'self' (N3)"
  has "$CSP" "frame-ancestors 'self'" "$path: frame-ancestors 'self'"
  has "$CSP" "/storage/v1/" "$path: img/frame-src só no caminho do Storage (N6)"
  has "$H" "x-content-type-options: nosniff" "$path: nosniff"
  has "$H" "strict-transport-security: max-age=63072000" "$path: HSTS"
  lacks "$(grep -i '^strict-transport-security:' <<<"$H")" "preload" "$path: HSTS sem preload"
  has "$H" "referrer-policy: strict-origin-when-cross-origin" "$path: Referrer-Policy"
  has "$H" "cross-origin-opener-policy: same-origin" "$path: COOP"
  has "$H" "permissions-policy: camera=()" "$path: Permissions-Policy"
done
N1=$(hdr / | grep -i '^content-security-policy:' | grep -o "nonce-[^']*")
N2=$(hdr / | grep -i '^content-security-policy:' | grep -o "nonce-[^']*")
[ -n "$N1" ] && [ "$N1" != "$N2" ] && ok "nonce diferente a cada requisição" || bad "nonce" "'$N1' vs '$N2'"
HB=$(hdr /brand/favicon.svg)
has "$HB" "default-src 'none'" "/brand/*: CSP restritiva"
has "$HB" "sandbox" "/brand/*: sandbox"
has "$HB" "x-content-type-options: nosniff" "/brand/*: nosniff"
HW=$(hdr /widget.js)
lacks "$HW" "content-security-policy" "/widget.js: sem CSP (S25, sem iframe)"
has "$HW" "x-content-type-options: nosniff" "/widget.js: nosniff"

echo "== 2) todo <script> do HTML tem nonce (e é o nonce do cabeçalho)"
for path in / /entrar /escolas/$INEP /escolas/$INEP_JSONLD; do
  TMP_H=$(mktemp); HTML=$(curl -s -D "$TMP_H" "$BASE$path")
  HN=$(grep -i '^content-security-policy:' "$TMP_H" | grep -o "nonce-[^']*" | head -1 | sed 's/^nonce-//')
  TOTAL=$(grep -o '<script[^>]*>' <<<"$HTML" | wc -l | tr -d ' ')
  WITHOUT=$(grep -o '<script[^>]*>' <<<"$HTML" | grep -vc 'nonce=' )
  WRONG=$(grep -o '<script[^>]*nonce="[^"]*"' <<<"$HTML" | grep -vcF "nonce=\"$HN\"")
  [ "$TOTAL" -gt 0 ] && eq "$WITHOUT" "0" "$path: $TOTAL <script>, todos com nonce" || bad "$path: scripts" "nenhum <script>"
  eq "$WRONG" "0" "$path: nonce do HTML == nonce do cabeçalho"
  rm -f "$TMP_H"
done

echo "== 3) hidratação sem violação de CSP no navegador"
ab anon set viewport 390 844 >/dev/null
check_page anon "$BASE/" "/"
shot anon "$OUT/S19-01-home.png"
check_page anon "$BASE/entrar" "/entrar"
shot anon "$OUT/S19-02-entrar.png"
check_page anon "$BASE/escolas/$INEP" "/escolas/$INEP (demo)"
check_page anon "$BASE/escolas/$INEP_JSONLD" "/escolas/$INEP_JSONLD (verificada)"
LD=$(ab anon eval "(()=>{const s=document.querySelector('script[type=\"application/ld+json\"]');if(!s)return 'sem';try{JSON.parse(s.textContent);return 'ok'}catch(e){return 'json-invalido'}})()" | tr -d '"')
eq "$LD" "ok" "/escolas/$INEP_JSONLD: JSON-LD presente e válido (nonce do <script> manual)"
shot anon "$OUT/S19-03-escola-jsonld.png"

echo "== 4) página 403 (parent abrindo /admin): scripts com nonce (reverificação N1)"
ab parent set viewport 390 844 >/dev/null
login parent parent@listacerta.test "/admin"
ab parent console --clear >/dev/null 2>&1
ab parent open "$BASE/admin" >/dev/null; sleep 2
expect_text parent "Erro 403" "parent em /admin vê a página 403"
eq "$(hydrated parent)" "true" "403: hidratou (scripts executaram sob strict-dynamic)"
ERR=$(csp_errors parent)
if [ -z "$ERR" ]; then ok "403: sem violação de CSP no console"; else bad "403: console" "$ERR"; fi
SNONCE=$(ab parent eval "[...document.querySelectorAll('script[src]')].filter(s=>!s.nonce).length" | tr -d '"')
eq "$SNONCE" "0" "403: nenhum <script src> sem nonce"
shot parent "$OUT/S19-04-403.png"

echo "== 5) PushOptIn: service worker registra sob a CSP (worker-src, N3)"
ab parent console --clear >/dev/null 2>&1
ab parent open "$BASE/conta/notificacoes" >/dev/null; sleep 2
SW=$(ab parent eval "(async()=>navigator.serviceWorker.register('/sw.js').then(r=>'ok:'+new URL(r.scope).pathname).catch(e=>'erro:'+e.message))()" | tr -d '"')
eq "$SW" "ok:/" "/sw.js registrou (escopo /)"
sleep 1
ERR=$(csp_errors parent)
if [ -z "$ERR" ]; then ok "service worker: sem violação de CSP"; else bad "service worker: console" "$ERR"; fi
ab parent eval "navigator.serviceWorker.getRegistrations().then(rs=>Promise.all(rs.map(r=>r.unregister())))" >/dev/null
shot parent "$OUT/S19-05-notificacoes-sw.png"

echo "== 6) 429 do rate limit"
# 6a) login: 5 por IP+e-mail, o 6º recusa (a mensagem só sai do nosso limitador; conferimos 5 e-mails no Mailpit)
RL_EMAIL="ratelimit-$RUN@listacerta.test"
FIRST_429=0
for i in 1 2 3 4 5 6 7; do
  ab anon open "$BASE/entrar" >/dev/null
  ab anon fill '#email' "$RL_EMAIL" >/dev/null
  ab anon press Enter >/dev/null
  sleep 2
  if ab anon get text body 2>/dev/null | grep -qi "Aguarde um minuto"; then FIRST_429=$i; break; fi
done
eq "$FIRST_429" "6" "login: a 6ª tentativa (mesmo IP e e-mail) é recusada"
MAILS=$(curl -s "$MAILPIT/api/v1/search?query=to:$RL_EMAIL" | python3 -c "import sys,json;print(json.load(sys.stdin)['messages_count'])")
eq "$MAILS" "5" "login: só 5 e-mails saíram (o limite foi nosso, não do Supabase)"
shot anon "$OUT/S19-06-login-429.png"

# 6b) lead: 10 por 10 min por IP+ator; o 11º volta com ?erro=rate_limited
PAP_A=00000000-0000-4000-8000-0000000014a2
ab parent open "$BASE/carrinho/novo?lista=$LIST" >/dev/null
wait_text parent "Comparar opções" 20; sleep 1
clicktext parent "Comparar opções"
for _ in $(seq 1 20); do ab parent get url | grep -q "/carrinho/[0-9a-f-]\{36\}" && break; sleep 1; done
CART=$(ab parent get url | sed -E 's#.*/carrinho/([0-9a-f-]{36}).*#\1#')
[ -n "$CART" ] && ok "carrinho demo criado" || bad "carrinho" "sem id"
LEAD_429=0
for i in $(seq 1 12); do
  ab parent open "$BASE/cotacao/nova?carrinho=$CART&papelaria=$PAP_A" >/dev/null
  # espera hidratar ANTES de marcar o consentimento (senão o requestSubmit sai sem o aceite e não envia)
  for _ in $(seq 1 20); do [ "$(hydrated parent)" = "true" ] && ab parent eval "!!document.querySelector('form[aria-label^=Consentimento]')" | grep -q true && break; sleep 1; done
  ab parent click 'input[type=checkbox]' >/dev/null
  ab parent eval "document.querySelector('form[aria-label^=Consentimento]').requestSubmit()" >/dev/null
  for _ in $(seq 1 15); do ab parent get url | grep -q "/cotacao/LC-\|erro=" && break; sleep 1; done
  if ab parent get url | grep -q "erro=rate_limited"; then LEAD_429=$i; break; fi
done
eq "$LEAD_429" "11" "lead: o 11º pedido em 10 min é recusado (erro=rate_limited)"
expect_text parent "Muitos pedidos em pouco tempo" "lead: mensagem de limite na tela"
shot parent "$OUT/S19-07-lead-429.png"

# 6c) envio de lista: 5 por 10 min; o 6º recusa (só depois da validação)
TMP=$(mktemp -d)
printf '%%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%%%EOF\n' > "$TMP/lista-rapida.pdf"
SEND_429=0
for i in 1 2 3 4 5 6 7; do
  ab parent open "$BASE/enviar-lista" >/dev/null
  wait_text parent "Enviar para revisão" 20; sleep 1
  for _ in 1 2 3 4 5 6; do
    ab parent upload '#file' "$TMP/lista-rapida.pdf" >/dev/null
    ab parent get text '[data-testid=picked]' 2>/dev/null | grep -q . && break; sleep 1
  done
  ab parent select '#grade' "5º ano" >/dev/null
  ab parent check 'input[name=consent]' >/dev/null
  ab parent click 'button[type=submit]' >/dev/null
  for _ in $(seq 1 25); do
    T=$(ab parent get text body 2>/dev/null)
    grep -qi "Muitos envios em pouco tempo" <<<"$T" && break
    ab parent get url | grep -q "/enviar-lista/[0-9a-f-]\{36\}" && break; sleep 1
  done
  if ab parent get text body 2>/dev/null | grep -qi "Muitos envios em pouco tempo"; then SEND_429=$i; break; fi
done
eq "$SEND_429" "6" "envio de lista: o 6º envio em 10 min é recusado"
shot parent "$OUT/S19-08-envio-429.png"
rm -rf "$TMP"

echo "== 7) CSP de Storage: iframe/img só no caminho /storage/v1/ (N6)"
# O documento da revisão é embutido por /admin/revisao/documento/[id] (same-origin, 307 para a URL assinada em
# /storage/v1/object/sign/…). Em http local o `upgrade-insecure-requests` sobe o destino do redirect para https, que o
# Supabase local não serve (artefato do ambiente http; em produção a origem já é https). Por isso a verificação é
# direta: o caminho de Storage é aceito e qualquer outro caminho da mesma origem é bloqueado por frame-src.
SUPA=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2-)
ab admin set viewport 1280 900 >/dev/null
login admin admin@listacerta.test "/admin"
ab admin open "$BASE/admin" >/dev/null; sleep 2
RES=$(ab admin eval "(async()=>{const out={};const mk=(name,tag,src)=>new Promise(r=>{const v=[];const h=e=>v.push(e.effectiveDirective);document.addEventListener('securitypolicyviolation',h);const f=document.createElement(tag);const done=()=>{setTimeout(()=>{document.removeEventListener('securitypolicyviolation',h);out[name]=v.slice();f.remove();r()},300)};f.onload=done;f.onerror=done;f.src=src;document.body.append(f);setTimeout(done,6000)});await mk('frame_storage','iframe','$SUPA/storage/v1/object/public/x');await mk('frame_rest','iframe','$SUPA/rest/v1/');await mk('img_storage','img','$SUPA/storage/v1/object/public/x.png');await mk('img_rest','img','$SUPA/rest/v1/x.png');return JSON.stringify(out)})()" | sed 's/\\//g; s/^"//; s/"$//')
eq "$(python3 -c "import json,sys;print(json.loads(sys.argv[1])['frame_storage'])" "$RES")" "[]" "frame-src: /storage/v1/ do Supabase aceito"
has "$(python3 -c "import json,sys;print(json.loads(sys.argv[1])['frame_rest'])" "$RES")" "frame-src" "frame-src: outro caminho da mesma origem (/rest/v1/) bloqueado"
eq "$(python3 -c "import json,sys;print(json.loads(sys.argv[1])['img_storage'])" "$RES")" "[]" "img-src: /storage/v1/ do Supabase aceito"
has "$(python3 -c "import json,sys;print(json.loads(sys.argv[1])['img_rest'])" "$RES")" "img-src" "img-src: outro caminho da mesma origem (/rest/v1/) bloqueado"
shot admin "$OUT/S19-09-csp-storage.png"

echo "== 8) alerta do health-check com job morto semeado"
sql "insert into public.jobs (kind, status, idempotency_key, last_error) values ('ocr_jobs', 'dead', 'e2e-s19-dead-$RUN', 'semente E2E S19')" >/dev/null
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/cron/health-check")
eq "$CODE" "401" "health-check sem segredo: 401"
RES=$(curl -s -H "authorization: Bearer $CRON_SECRET" "$BASE/api/cron/health-check")
has "$RES" '"alerted":true' "health-check devolve alerted:true para fila morta"
N=$(sql "select count(*) from public.notifications where event_type = 'system_alert' and params->>'alert_kind' = 'dead_jobs'")
[ "${N:-0}" -ge 1 ] && ok "notificação system_alert/dead_jobs gerada para o admin ($N)" || bad "alerta" "nenhuma notificação"
KEYS=$(sql "select string_agg(distinct k, ',' order by k) from public.notifications n, jsonb_object_keys(n.params) k where n.event_type = 'system_alert'")
eq "$KEYS" "alert_count,alert_kind" "alerta sem dado pessoal (params só alert_kind/alert_count)"
ab admin open "$BASE/conta/notificacoes" >/dev/null; sleep 2
shot admin "$OUT/S19-10-alerta-admin.png"

echo "== 9) nenhum dado pessoal nos logs do servidor"
if [ -n "$SERVER_LOG" ]; then
  LOGTXT=$(cat "$SERVER_LOG")
  for needle in "@listacerta.test" "$RL_EMAIL" "11222333000181" "11444777000161" "$CRON_SECRET"; do
    lacks "$LOGTXT" "$needle" "log do servidor sem '${needle:0:12}…'"
  done
else
  echo "SKIP  log do servidor (servidor não foi aberto por este script)"
fi

echo ""
echo "== Resumo: $PASS passaram, $FAIL falharam =="
[ "$FAIL" -eq 0 ]
