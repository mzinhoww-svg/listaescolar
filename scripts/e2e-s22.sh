#!/usr/bin/env bash
# E2E da S22 (atribuição, conversão e contestação) com agent-browser contra o build local da trilha 3.
# Pré-requisitos: `pnpm db:reset`; seed `scripts/e2e-s14-seed.sql` no banco local (admin, s14a — papelaria DEMO — e
# s14b, e o responsável de teste, todos de `supabase/seed.sql`/`scripts/e2e-s14-seed.sql`); `.env.local` (só neste
# worktree, não versionado) com as variáveis de `pnpm db:env` mais DEMO_RETAILERS=1; `pnpm build && PORT=3003 pnpm start`.
# Ruling (ledger-comercio, S22): este roteiro NÃO repete a publicação de plano/recarga pela UI (já coberto e
# documentado em `e2e/S21.md`); o plano e a carteira da papelaria A saem por SQL direto (mesmo padrão das fixtures
# de `tests/db/billing-fixtures.ts`), para focar o roteiro nas telas NOVAS da S22. Nada aqui contém chave real.
set -u
cd "$(dirname "$0")/.."
BASE=${BASE:-http://127.0.0.1:3003}
MAILPIT=${MAILPIT:-http://127.0.0.1:54624}
DB=${DB:-supabase_db_listacerta-t3}
OUT=docs/superpowers/e2e/screenshots
ADMIN_ID=00000000-0000-4000-8000-0000000000a1
PARENT_ID=00000000-0000-4000-8000-0000000000a2
OWNER_A=00000000-0000-4000-8000-0000000014a1
STATIONERY_A=00000000-0000-4000-8000-0000000014a2 # Papelaria Demo A (is_demo)
PASS=0; FAIL=0
RUN=$(date +%s)
export AGENT_BROWSER_SESSION_PREFIX=t3s22
for s in admin a parent; do AGENT_BROWSER_SESSION="t3s22-$RUN-$s" agent-browser close >/dev/null 2>&1; done
ab() { local s=$1; shift; AGENT_BROWSER_SESSION="t3s22-$RUN-$s" agent-browser "$@"; }
sql() { docker exec "$DB" psql -U postgres -Atq -c "$1"; }
sql_stdin() { docker exec -i "$DB" psql -U postgres -At -v ON_ERROR_STOP=1; }
ok() { PASS=$((PASS+1)); echo "PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL  $1  ($2)"; }
expect_text() { local t; t=$(ab "$1" get text body 2>/dev/null); if grep -qiF -- "$2" <<<"$t"; then ok "$3"; else bad "$3" "esperava '$2'; veio: ${t:0:200}"; fi; }
wait_text() { for _ in $(seq 1 "$3"); do ab "$1" get text body 2>/dev/null | grep -qF -- "$2" && return 0; sleep 1; done; return 1; }
shot() { sleep 1; ab "$1" screenshot "$2" >/dev/null; }
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

echo "== 0) plano (0 grátis, faixa única R\$5,00) e carteira da papelaria A com R\$50,00 (SQL direto, Ruling acima)"
sql_stdin <<SQL
set role service_role;
select public.billing_plan_publish('$ADMIN_ID'::uuid,
  '{"free_leads":0,"free_leads_validity_days":null,"season":{"start_month":11,"end_month":3},"tiers":[{"min_items":1,"max_items":null,"price_cents":500}],"packages":[{"amount_cents":5000}],"pass":null}'::jsonb);
select public.billing_ensure_wallet('$STATIONERY_A'::uuid);
select public.billing_create_package_invoice('$OWNER_A'::uuid, '$STATIONERY_A'::uuid,
  (select id from public.plan_credit_packages where plan_id = (select id from public.plans where status = 'active') limit 1),
  'demo', gen_random_uuid(), 'e2e-s22') as invoice_id \gset
select public.billing_confirm_invoice_payment(:'invoice_id'::uuid, 'demo', 'e2e-s22-ref',
  (select amount_cents from public.invoices where id = :'invoice_id'::uuid), now());
SQL
BAL0=$(sql "select coalesce(sum(amount_cents),0) from public.credit_ledger e join public.stationery_wallets w on w.id = e.wallet_id where w.stationery_id = '$STATIONERY_A';")
[ "$BAL0" = "5000" ] && ok "carteira recarregada (R\$ 50,00)" || bad "recarga" "saldo veio $BAL0"

echo "== 1) dois leads reais (R\$5,00 cada): um para confirmação/avaliação, outro para contestação"
insert_lead() {
  sql "insert into public.leads (code, requester_id, list_id, stationery_id, school_name, grade_label, school_year, municipality_id, item_count, expires_at, consent_text_version, consented_at, idempotency_key, is_demo, created_at) values ('$1', '$PARENT_ID', gen_random_uuid(), '$STATIONERY_A', 'Escola E2E S22', '5º ano', 2027, (select municipality_id from public.stationeries where id = '$STATIONERY_A'), 3, now() + interval '7 days', 'e2e-s22', now(), gen_random_uuid(), true, $2) returning id;"
}
LEAD_CONFIRM=$(insert_lead LC-E2E1 "now()")
LEAD_DISPUTE=$(insert_lead LC-E2E2 "now()")
LEAD_OLD=$(insert_lead LC-E2E3 "now() - interval '4 days'")
if [ -n "$LEAD_CONFIRM" ] && [ -n "$LEAD_DISPUTE" ] && [ -n "$LEAD_OLD" ]; then ok "3 leads inseridos (débito de R\$5,00 cada via gatilho da S21)"; else bad "inserir leads" "algum id veio vazio"; fi
BAL1=$(sql "select coalesce(sum(amount_cents),0) from public.credit_ledger e join public.stationery_wallets w on w.id = e.wallet_id where w.stationery_id = '$STATIONERY_A';")
[ "$BAL1" = "3500" ] && ok "saldo após os 3 débitos: R\$ 35,00" || bad "saldo pós-débito" "veio $BAL1"

echo "== 2) pai confirma 'Comprei aqui' em /conta/compras (App22)"
ab parent set viewport 420 900 >/dev/null
login parent parent@listacerta.test "/conta/compras"
wait_text parent "Suas compras" 20
expect_text parent "LC-E2E1" "pedido do lead de confirmação aparece"
shot parent "$OUT/S22-app22-lista.png"
ab parent eval "(() => { const li=[...document.querySelectorAll('li')].find(x=>x.textContent.includes('LC-E2E1')); const f=[...li.querySelectorAll('form')].find(f=>f.querySelector('input[name=answer]')?.value==='bought_here'); f.requestSubmit(); return 'ok'; })()" >/dev/null
wait_text parent "Registrado" 15
expect_text parent "Você disse: comprei aqui" "confirmação registrada"

echo "== 3) papelaria declara 'Vendi' no mesmo lead (Pap03) -> 2 sinais"
ab a set viewport 1280 800 >/dev/null
login a s14a@listacerta.test "/papelaria/leads/LC-E2E1"
wait_text a "Lead LC-E2E1" 20
ab a eval "(() => { const f=[...document.querySelectorAll('dialog form')].find(f=>f.querySelector('button[type=submit]')?.textContent.trim()==='Registrar venda'); f.requestSubmit(); return 'ok'; })()" >/dev/null
wait_text a "Registrado" 15
expect_text a "Registrado" "venda declarada"
shot a "$OUT/S22-pap03-vendi.png"

echo "== 4) admin vê a auditoria confirmada, sem divergência (Admin11)"
ab admin set viewport 1280 800 >/dev/null
login admin admin@listacerta.test "/admin/auditoria"
wait_text admin "Auditoria de conversão" 20
expect_text admin "LC-E2E1" "lead aparece na auditoria"
expect_text admin "Confirmada" "2 sinais -> confirmada"
shot admin "$OUT/S22-admin11-auditoria.png"

echo "== 5) papelaria contesta LC-E2E2 dentro do prazo (Pap03, motivo 'número errado')"
ab a open "$BASE/papelaria/leads/LC-E2E2" >/dev/null; wait_text a "Lead LC-E2E2" 15
expect_text a "Você pode contestar até" "prazo de 72h visível"
ab a eval "document.querySelector('form[aria-label=\"Contestar pedido\"] select[name=reason]').value = 'wrong_number'" >/dev/null
ab a eval "document.querySelector('form[aria-label=\"Contestar pedido\"] textarea[name=detail]').value = 'número do WhatsApp não existe'" >/dev/null
shot a "$OUT/S22-pap03-contestar-form.png"
ab a eval "document.querySelector('form[aria-label=\"Contestar pedido\"]').requestSubmit()" >/dev/null
wait_text a "aguardando análise" 15
expect_text a "aguardando análise" "contestação registrada, aguardando"

echo "== 6) lead antigo (>72h) não pode mais ser contestado"
ab a open "$BASE/papelaria/leads/LC-E2E3" >/dev/null; wait_text a "Lead LC-E2E3" 15
expect_text a "Prazo de contestação encerrado" "prazo de 72h vencido bloqueia a contestação"
shot a "$OUT/S22-pap03-prazo-encerrado.png"

echo "== 7) admin aceita a contestação (Admin12) -> crédito devolvido; 2ª tentativa não duplica o estorno"
DISPUTE_ID=$(sql "select id from public.lead_disputes where lead_id = '$LEAD_DISPUTE';")
ab admin open "$BASE/admin/contestacoes" >/dev/null; wait_text admin "Contestações" 15
expect_text admin "LC-E2E2" "contestação aparece na fila de abertas"
expect_text admin "Número errado" "motivo aparece"
shot admin "$OUT/S22-admin12-fila.png"
ab admin eval "(() => { const f=[...document.querySelectorAll('form')].find(f=>f.querySelector('input[name=disputeId]')?.value==='$DISPUTE_ID' && f.querySelector('input[name=decision]')?.value==='accepted'); f.requestSubmit(); return 'ok'; })()" >/dev/null
wait_text admin "Aceita, crédito devolvido" 15
expect_text admin "Aceita, crédito devolvido" "disputa resolvida some da fila e aparece no histórico"
shot admin "$OUT/S22-admin12-resolvida.png"
sql "set role service_role; select public.lead_dispute_resolve('$DISPUTE_ID'::uuid, '$ADMIN_ID'::uuid, 'admin', 'accepted', 'repetição e2e');" >/dev/null
REVERSALS=$(sql "select count(*) from public.credit_ledger where reverses_entry_id = (select e.id from public.credit_ledger e where e.lead_id = '$LEAD_DISPUTE' and e.entry_type = 'lead_debit');")
[ "$REVERSALS" = "1" ] && ok "idempotente: 1 único estorno mesmo chamando resolve 2x" || bad "idempotência do estorno" "vieram $REVERSALS reversals"

echo "== 8) extrato da papelaria mostra o Estorno e o saldo voltou (Pap06)"
ab a open "$BASE/papelaria/creditos" >/dev/null; wait_text a "cada lead entregue debita" 15
expect_text a "Estorno" "extrato mostra a linha de estorno"
BAL2=$(sql "select coalesce(sum(amount_cents),0) from public.credit_ledger e join public.stationery_wallets w on w.id = e.wallet_id where w.stationery_id = '$STATIONERY_A';")
[ "$BAL2" = "4000" ] && ok "saldo voltou para R\$ 40,00 (35,00 + 5,00 estornados)" || bad "saldo pós-estorno" "veio $BAL2"
shot a "$OUT/S22-pap06-extrato-estorno.png"

echo "== 9) pai avalia a papelaria (App23) e a avaliação aparece no perfil público (Pap08)"
ab parent open "$BASE/conta/compras" >/dev/null; wait_text parent "Suas compras" 15
expect_text parent "Como foi o atendimento" "formulário de avaliação aparece (lead confirmado)"
ab parent eval "(() => { const li=[...document.querySelectorAll('li')].find(x=>x.textContent.includes('LC-E2E1')); li.querySelector('input[name=rating][value=\"5\"]').checked = true; li.querySelector('input[name=tags]').checked = true; li.querySelector('textarea[name=comment]').value = 'Atendimento rápido e honesto'; li.querySelector('form:has(textarea)').requestSubmit(); return 'ok'; })()" >/dev/null
wait_text parent "Avaliação enviada" 15
expect_text parent "Avaliação enviada" "avaliação registrada"
SLUG=$(sql "select slug from public.stationeries where id = '$STATIONERY_A';")
ab parent open "$BASE/papelarias/$SLUG" >/dev/null; wait_text parent "Avaliações" 15
expect_text parent "Atendimento rápido e honesto" "comentário aparece no perfil público"
expect_text parent "[5.0]" "nota entre colchetes (Ruling SPEC-2, sem ícone de terceiro)"
shot parent "$OUT/S22-pap08-avaliacao.png"

echo
echo "RESULTADO: $PASS passaram, $FAIL falharam"
exit $((FAIL > 0))
