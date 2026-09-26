#!/usr/bin/env bash
# E2E da S21 (cobrança: grátis, créditos e passe) com agent-browser contra o build local da trilha 3.
# Pré-requisitos: `pnpm db:reset`; seed `scripts/e2e-s14-seed.sql` no banco local (dá o admin, dois donos de
# papelaria — s14a é `is_demo`, s14b não — e o responsável de teste); `.env.local` (só neste worktree, não
# versionado) com as variáveis de `pnpm db:env` mais DEMO_RETAILERS=1 e CRON_SECRET; `pnpm build && PORT=3003 pnpm start`.
# Nada aqui contém chaves reais; PAYMENTS_PIX_ENABLED fica ausente (webhook/cron testados só pelo curl, sem flag).
set -u
cd "$(dirname "$0")/.."
BASE=${BASE:-http://127.0.0.1:3003}
MAILPIT=${MAILPIT:-http://127.0.0.1:54624}
DB=${DB:-supabase_db_listacerta-t3}
OUT=docs/superpowers/e2e/screenshots
STATIONERY_A=00000000-0000-4000-8000-0000000014a2 # Papelaria Demo A (is_demo)
STATIONERY_B=00000000-0000-4000-8000-0000000014b2 # Papelaria Demo B (não demo)
PASS=0; FAIL=0
RUN=$(date +%s)
export AGENT_BROWSER_SESSION_PREFIX=t3s21
for s in admin a b; do AGENT_BROWSER_SESSION="t3s21-$RUN-$s" agent-browser close >/dev/null 2>&1; done
ab() { local s=$1; shift; AGENT_BROWSER_SESSION="t3s21-$RUN-$s" agent-browser "$@"; }
sql() { docker exec "$DB" psql -U postgres -At -c "$1"; }
ok() { PASS=$((PASS+1)); echo "PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL  $1  ($2)"; }
expect_text() { local t; t=$(ab "$1" get text body 2>/dev/null); if grep -qiF -- "$2" <<<"$t"; then ok "$3"; else bad "$3" "esperava '$2'; veio: ${t:0:200}"; fi; }
expect_no_text() { local t; t=$(ab "$1" get text body 2>/dev/null); if grep -qiF -- "$2" <<<"$t"; then bad "$3" "não deveria conter '$2'"; else ok "$3"; fi; }
wait_text() { for _ in $(seq 1 "$3"); do ab "$1" get text body 2>/dev/null | grep -qF -- "$2" && return 0; sleep 1; done; return 1; }
shot() { sleep 1; ab "$1" screenshot "$2" >/dev/null; }
clicktext() { ab "$1" eval "(() => { const e = [...document.querySelectorAll('a,button')].find(x => (x.textContent||'').includes('$2')); if (!e) return 'sem-elemento'; e.click(); return 'ok'; })()" >/dev/null; }
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

echo "== a) admin publica o plano em /admin/planos"
ab admin set viewport 1280 800 >/dev/null
login admin admin@listacerta.test "/admin/planos"
wait_text admin "Planos e preços" 20
ab admin fill 'input[name="freeLeads"]' "1" >/dev/null
ab admin fill 'input[name="tiers.0.minItems"]' "1" >/dev/null
ab admin fill 'input[name="tiers.0.maxItems"]' "20" >/dev/null
ab admin fill 'input[name="tiers.0.priceCents"]' "5,00" >/dev/null
ab admin fill 'input[name="tiers.1.minItems"]' "21" >/dev/null
ab admin fill 'input[name="tiers.1.priceCents"]' "9,00" >/dev/null
ab admin fill 'input[name="packages.0.amountCents"]' "50,00" >/dev/null
ab admin check 'input[name="passEnabled"]' >/dev/null
ab admin fill 'input[name="passPriceCents"]' "300,00" >/dev/null
ab admin fill 'input[name="passIncludedLeads"]' "40" >/dev/null
ab admin fill 'input[name="passMaxInstallments"]' "3" >/dev/null
shot admin "$OUT/S21-admin-planos-form.png"
ab admin eval "document.querySelector('form').requestSubmit()" >/dev/null
wait_text admin "Plano publicado" 15
expect_text admin "Plano publicado" "admin publica o plano com sucesso"
expect_text admin "v1" "histórico mostra a versão 1"

echo "== b) papelaria demo A (leads grátis, saldo, compra de pacote, simulação de pagamento)"
ab a set viewport 1280 800 >/dev/null
login a s14a@listacerta.test "/papelaria/creditos"
wait_text a "cada lead entregue debita" 20
shot a "$OUT/S21-pap06-inicial.png"
expect_text a "Saldo" "Pap06 mostra o cartão Saldo"
expect_text a "1 a 20 itens" "faixa de preço aparece"
expect_no_text a "Mais usado" "sem 'Mais usado' inventado"
expect_no_text a "destaque na lista" "sem 'destaque' inventado"
ab a eval "(() => { const f = [...document.querySelectorAll('form')].find(f => f.querySelector('input[name=packageId]')); f.querySelector('input[name=termsAccepted]').checked = true; f.requestSubmit(); return 'ok'; })()" >/dev/null
wait_text a "Pacote de crédito" 15
shot a "$OUT/S21-fatura-pacote.png"
clicktext a "Simular pagamento (demonstração)"
wait_text a "Pagamento confirmado" 15
expect_text a "Pagamento confirmado" "confirmação da fatura demo"
ab a open "$BASE/papelaria/creditos" >/dev/null; wait_text a "cada lead entregue debita" 15
expect_text a "50,00" "saldo após a recarga de R\$ 50,00"

echo "== c) 1º lead consome o grátis; o 2º debita a faixa certa (inserção direta, mesmo caminho da Task 1/2)"
insert_lead() { # código, item_count
  sql "insert into public.leads (code, requester_id, list_id, stationery_id, school_name, grade_label, school_year, municipality_id, item_count, expires_at, consent_text_version, consented_at, idempotency_key, is_demo) values ('$1', '00000000-0000-4000-8000-0000000000a2', gen_random_uuid(), '$STATIONERY_A', 'Escola E2E S21', '5º ano', 2027, (select municipality_id from public.stationeries where id = '$STATIONERY_A'), $2, now() + interval '7 days', 'e2e-s21', now(), gen_random_uuid(), true) returning id;"
}
LEAD1=$(insert_lead LC-E2E1 2)
if [ -n "$LEAD1" ]; then ok "1º lead inserido ($LEAD1), gatilho de cobrança rodou"; else bad "inserir 1º lead" "sem id devolvido"; fi
LEAD2=$(insert_lead LC-E2E2 2)
if [ -n "$LEAD2" ]; then ok "2º lead inserido ($LEAD2), gatilho de cobrança rodou"; else bad "inserir 2º lead" "sem id devolvido"; fi
ab a open "$BASE/papelaria/creditos" >/dev/null; wait_text a "cada lead entregue debita" 15
expect_text a "Lead grátis" "1º lead consumiu o grátis (sem faixa aberta ainda)"
expect_text a "Lead LC-E2E2 · Escola E2E S21" "2º lead debita a faixa certa, com a escola (sem dado do responsável)"
expect_text a "45,00" "saldo após o débito de R\$ 5,00 (faixa 1-20 itens)"
ab a scroll down 700 >/dev/null
shot a "$OUT/S21-extrato-debito.png"
ab a open "$BASE/papelaria/leads" >/dev/null; wait_text a "Saldo" 15
expect_text a "Saldo" "Pap02 ganha o KPI Saldo"

echo "== d) membro de outra papelaria não acessa a fatura da A"
ab b set viewport 1280 800 >/dev/null
login b s14b@listacerta.test "/papelaria/creditos"
wait_text b "Créditos e plano" 15
INV_ID=$(sql "select id from public.invoices where stationery_id = '$STATIONERY_A' limit 1;")
ab b open "$BASE/papelaria/creditos/faturas/$INV_ID" >/dev/null; sleep 1
expect_text b "404" "fatura de outra papelaria devolve 404"

echo "== e) webhook e cron sem a flag/segredo"
w=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/billing/pix/webhook/x" -d '{}')
[ "$w" = "404" ] && ok "webhook Pix sem PAYMENTS_PIX_ENABLED: 404" || bad "webhook Pix" "esperado 404, veio $w"
c=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/cron/billing-reconcile")
[ "$c" = "401" ] && ok "cron de reconciliação sem segredo certo: 401" || bad "cron reconciliação" "esperado 401, veio $c"

echo
echo "RESULTADO: $PASS passaram, $FAIL falharam"
exit $((FAIL > 0))
