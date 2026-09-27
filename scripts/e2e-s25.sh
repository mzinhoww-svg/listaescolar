#!/usr/bin/env bash
# E2E da S25 (widget e webhooks) com agent-browser + curl contra o build de PRODUÇÃO local da trilha 2.
# Pré-requisitos: `pnpm db:reset` seguido de `psql < scripts/e2e-s25-seed.sql` (parceiro varejista já ativo, dono
# parent@listacerta.test; lista real publicada em Cuiabá/MT; escola com reivindicação pronta para aprovar).
# `.env.local` (só neste worktree) com CRON_SECRET; este script EXPORTA B2B_WEBHOOK_ENCRYPTION_KEY e APP_ENV=local
# na hora do build/start (nunca escreve em .env.local — variável de shell tem prioridade sobre o arquivo).
# `pnpm build && APP_ENV=local B2B_WEBHOOK_ENCRYPTION_KEY=... PORT=3002 pnpm start` (feito por este script).
set -u
cd "$(dirname "$0")/.."
BASE=${BASE:-http://127.0.0.1:3002}
DB=${DB:-supabase_db_listacerta-t2}
RECEIVER_PORT=${RECEIVER_PORT:-3905}
RECEIVER=http://127.0.0.1:$RECEIVER_PORT
SECRET_FILE=/tmp/e2e-s25-webhook-secret.txt
LOG_FILE=/tmp/e2e-s25-webhook-log.ndjson
OUT=docs/superpowers/e2e/screenshots
PASS=0; FAIL=0
RUN=$(date +%s)
export AGENT_BROWSER_SESSION_PREFIX=t2s25
for s in anon p; do AGENT_BROWSER_SESSION="t2s25-$RUN-$s" agent-browser close >/dev/null 2>&1; done
ab() { local s=$1; shift; AGENT_BROWSER_SESSION="t2s25-$RUN-$s" agent-browser "$@"; }
sql() { docker exec "$DB" psql -U postgres -At -c "$1"; }
ok() { PASS=$((PASS+1)); echo "PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL  $1  ($2)"; }
expect_text() { local t; t=$(ab "$1" get text body 2>/dev/null); if grep -qF -- "$2" <<<"$t"; then ok "$3"; else bad "$3" "esperava '$2'; veio: ${t:0:200}"; fi; }
wait_text() { for _ in $(seq 1 "$3"); do ab "$1" get text body 2>/dev/null | grep -qF -- "$2" && return 0; sleep 1; done; return 1; }
expect_eq() { if [ "$1" = "$2" ]; then ok "$3"; else bad "$3" "esperado '$2', veio '$1'"; fi; }
shot() { sleep 1; ab "$1" screenshot "$2" >/dev/null; }
clicktext() { ab "$1" eval "(() => { const e = [...document.querySelectorAll('a,button,label')].find(x => (x.textContent||'').trim().startsWith('$2')); if (!e) return 'sem-elemento'; e.click(); return 'ok'; })()" >/dev/null; }
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
MAILPIT=${MAILPIT:-http://127.0.0.1:54524}
read_dialog_or_code() { ab "$1" eval "[...document.querySelectorAll('code')].map(e => e.textContent).find(t => /^whsec_[A-Za-z0-9_-]{20,}\$/.test(t)) || ''" | sed -e 's/^"//' -e 's/"$//'; }
CRON_SECRET_VAL=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)

PARTNER_ID=$(sql "select partner_id from public.b2b_partner_members where profile_id = '00000000-0000-4000-8000-0000000000a2'")
REAL_INEP=51900201
CLAIM_SCHOOL_ID=$(sql "select id from public.schools where inep='51900202'")
CLAIM_ID=$(sql "select id from public.claims where school_id='$CLAIM_SCHOOL_ID' order by created_at desc limit 1")
LIST_ID=$(sql "select sl.id from public.school_lists sl join public.schools s on s.id=sl.school_id where s.inep='$REAL_INEP'")
echo "parceiro=$PARTNER_ID lista=$LIST_ID reivindicação=$CLAIM_ID"

# Receptor local (loopback; só funciona porque o build sobe com APP_ENV=local).
node scripts/e2e-webhook-receiver.mjs "$RECEIVER_PORT" "$SECRET_FILE" "$LOG_FILE" >/tmp/e2e-s25-receiver.log 2>&1 &
RECEIVER_PID=$!
sleep 1
trap 'kill "$RECEIVER_PID" 2>/dev/null' EXIT

echo "== a) widget (B2B04): configurar, snippet com partner_id real, pré-visualização"
ab p set viewport 1280 900 >/dev/null
login p parent@listacerta.test "/b2b/widget"
wait_text p "Widget para o seu site" 20
ab p fill 'input[placeholder="carrinho.suaempresa.com.br"]' "loja-e2e-s25.example.com" >/dev/null
CHECKED=$(ab p eval "document.querySelector('input[type=checkbox]')?.checked")
[ "$CHECKED" != "true" ] && ab p click 'input[type=checkbox]' >/dev/null
clicktext p "Salvar"
wait_text p "Configuração salva." 10
expect_text p "Configuração salva." "widget salvo"
SNIPPET=$(ab p eval "document.querySelector('pre code')?.textContent || ''")
grep -qF "$PARTNER_ID" <<<"$SNIPPET" && ok "snippet leva o partner_id real" || bad "snippet com partner_id" "$SNIPPET"
grep -qF "/widget.js" <<<"$SNIPPET" && ok "snippet aponta para /widget.js do próprio site" || bad "snippet src" "$SNIPPET"
shot p "$OUT/S25-b2b04-widget.png"

echo "== b) API pública do widget (curl): config, busca de escola, listas, itens — CORS aberto, sem cookie"
CFG=$(curl -s "$BASE/api/widget/config?partnerId=$PARTNER_ID")
echo "$CFG" | grep -q "loja-e2e-s25.example.com" && ok "config pública devolve o domínio do carrinho" || bad "config pública" "$CFG"
CORS=$(curl -s -D - -o /dev/null "$BASE/api/widget/config?partnerId=$PARTNER_ID" | grep -i "access-control-allow-origin")
[ -n "$CORS" ] && ok "CORS aberto (access-control-allow-origin)" || bad "CORS" "ausente"
SCHOOLS=$(curl -s "$BASE/api/widget/schools?partnerId=$PARTNER_ID&q=Real%20E2E")
echo "$SCHOOLS" | grep -q "$REAL_INEP" && ok "busca de escola pública devolve a escola real" || bad "busca de escola" "$SCHOOLS"
LISTS=$(curl -s "$BASE/api/widget/schools/$REAL_INEP/lists?partnerId=$PARTNER_ID")
echo "$LISTS" | grep -q "\"id\":\"$LIST_ID\"" && ok "listas da escola incluem a lista publicada" || bad "listas da escola" "$LISTS"
ITEMS=$(curl -s "$BASE/api/widget/lists/$LIST_ID/items?partnerId=$PARTNER_ID")
echo "$ITEMS" | grep -q "caderno universitario" && ok "itens da lista vêm da lista real publicada" || bad "itens da lista" "$ITEMS"
BADPARTNER=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/widget/config?partnerId=00000000-0000-4000-8000-000000000000")
expect_eq "$BADPARTNER" "404" "partnerId inexistente: 404 sem detalhe"

echo "== c) webhooks (B2B05): criar endpoint (loopback local), ver segredo uma vez, revelar, rotacionar"
ab p open "$BASE/b2b/webhooks" >/dev/null; wait_text p "Webhooks" 20
ab p fill 'input[type=url]' "$RECEIVER/hook" >/dev/null
clicktext p "Criar endpoint"
wait_text p "Copie agora" 15
SECRET1=$(read_dialog_or_code p)
[[ "$SECRET1" == whsec_* ]] && ok "endpoint criado; segredo mostrado (copie agora)" || bad "criar endpoint" "$SECRET1"
printf '%s' "$SECRET1" > "$SECRET_FILE"
shot p "$OUT/S25-b2b05-webhooks.png"
clicktext p "Já copiei"
sleep 2
ENDPOINT_ID=$(sql "select id from public.b2b_webhook_endpoints where partner_id='$PARTNER_ID' order by created_at desc limit 1")
[ -n "$ENDPOINT_ID" ] && ok "endpoint gravado no banco ($ENDPOINT_ID)" || bad "endpoint no banco" "vazio"

clicktext p "Revelar"
sleep 2
REVEALED=$(ab p eval "document.body.innerText.includes('$SECRET1') ? 'ok' : 'nao'" | tr -d '"')
expect_eq "$REVEALED" "ok" "Revelar mostra o mesmo segredo"

clicktext p "Rotacionar"
sleep 1
clicktext p "Confirmar rotação"
sleep 2
SECRET2=$(read_dialog_or_code p)
[[ "$SECRET2" == whsec_* && "$SECRET2" != "$SECRET1" ]] && ok "rotação gera um segredo novo, diferente do anterior" || bad "rotação" "$SECRET2"
printf '%s' "$SECRET2" > "$SECRET_FILE"

echo "== d) eventos reais disparam entregas: publicar (list.updated), aprovar reivindicação (school.approved)"
sql "select public.list_create_candidate_version('$LIST_ID', 'admin', null, null)" >/tmp/e2e-s25-v2.txt
V2=$(sql "select version_id from public.list_create_candidate_version('$LIST_ID', 'admin', null, null)")
sql "insert into public.list_items (version_id, position, original_name, normalized_name, category, quantity, unit, confidence, alerts) values ('$V2', 1, 'Regua 30cm', 'regua 30cm', 'papelaria', 1, 'un', 0.9, '[]'::jsonb)"
sql "select public.list_approve_version('$LIST_ID', '$V2', '00000000-0000-4000-8000-0000000000a1')"
sql "select public.list_publish_version('$LIST_ID', '$V2', '00000000-0000-4000-8000-0000000000a1')"
sql "select public.claim_decide('$CLAIM_ID', 'approved'::public.claim_status, '00000000-0000-4000-8000-0000000000a1', 'aprovado no roteiro e2e')" >/dev/null
DUE=$(sql "select count(*) from public.b2b_webhook_deliveries where partner_id='$PARTNER_ID' and status='queued'")
[ "$DUE" -ge 2 ] && ok "list.updated e school.approved entraram na fila ($DUE)" || bad "eventos enfileirados" "esperava >=2, veio $DUE"

echo "== e) despacho real: assinatura verificável pelo receptor, respostas 2xx"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/webhooks/dispatch")
expect_eq "$CODE" "401" "dispatch sem segredo: 401"
curl -s -X POST "$BASE/api/webhooks/dispatch" -H "Authorization: Bearer $CRON_SECRET_VAL" >/tmp/e2e-s25-dispatch1.json
cat /tmp/e2e-s25-dispatch1.json
sleep 1
VALID=$(grep -c '"validSignature":true' "$LOG_FILE" || true)
[ "$VALID" -ge 2 ] && ok "receptor confirma assinatura válida em pelo menos 2 entregas" || bad "assinatura no receptor" "validas=$VALID; log: $(cat "$LOG_FILE")"
SENT=$(sql "select count(*) from public.b2b_webhook_deliveries where partner_id='$PARTNER_ID' and status='sent'")
[ "$SENT" -ge 2 ] && ok "banco marca as entregas como sent" || bad "status sent no banco" "$SENT"

echo "== f) falha -> retry -> dead letter -> reenvio manual"
curl -s "$RECEIVER/control/fail-on" >/dev/null
sql "select public.list_archive('$LIST_ID', '00000000-0000-4000-8000-0000000000a1', 'arquivar para o roteiro e2e')" >/dev/null
curl -s -X POST "$BASE/api/webhooks/dispatch" -H "Authorization: Bearer $CRON_SECRET_VAL" >/dev/null
FAILED_ROW=$(sql "select id from public.b2b_webhook_deliveries where partner_id='$PARTNER_ID' and event_type='list.archived' order by created_at desc limit 1")
STATUS1=$(sql "select status::text from public.b2b_webhook_deliveries where id='$FAILED_ROW'")
[ "$STATUS1" = "failed" ] && ok "entrega com falha entra em retry (status failed, next_attempt_at no futuro)" || bad "status após 1ª falha" "$STATUS1"
sql "update public.b2b_webhook_deliveries set created_at = now() - interval '25 hours', next_attempt_at = now() where id = '$FAILED_ROW'" >/dev/null
curl -s -X POST "$BASE/api/webhooks/dispatch" -H "Authorization: Bearer $CRON_SECRET_VAL" >/dev/null
STATUS2=$(sql "select status::text from public.b2b_webhook_deliveries where id='$FAILED_ROW'")
expect_eq "$STATUS2" "dead" "24h decorridas: dead letter"
curl -s "$RECEIVER/control/fail-off" >/dev/null

ab p open "$BASE/b2b/webhooks" >/dev/null; wait_text p "Reenviar" 15
expect_text p "Reenviar" "B2B05 lista Reenviar para a entrega dead"
shot p "$OUT/S25-b2b05-dead-letter.png"
clicktext p "Reenviar"
sleep 2
RESENT_COUNT=$(sql "select count(*) from public.b2b_webhook_deliveries where partner_id='$PARTNER_ID' and event_type='list.archived'")
[ "$RESENT_COUNT" -ge 2 ] && ok "reenvio manual cria uma nova entrega (histórico original preservado)" || bad "reenvio manual" "$RESENT_COUNT linha(s)"
curl -s -X POST "$BASE/api/webhooks/dispatch" -H "Authorization: Bearer $CRON_SECRET_VAL" >/dev/null
STATUS_RESENT=$(sql "select status::text from public.b2b_webhook_deliveries where partner_id='$PARTNER_ID' and event_type='list.archived' order by created_at desc limit 1")
expect_eq "$STATUS_RESENT" "sent" "entrega reenviada é entregue com sucesso (receptor voltou a responder 200)"
shot p "$OUT/S25-b2b05-reenviado.png"

echo
echo "== resultado: $PASS passaram, $FAIL falharam =="
[ "$FAIL" -eq 0 ]
