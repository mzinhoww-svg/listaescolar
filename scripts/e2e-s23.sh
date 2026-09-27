#!/usr/bin/env bash
# E2E da S23 (comissão, repasses e inadimplência) com agent-browser contra o build local da trilha 3.
# Pré-requisitos: `pnpm db:reset`; seed `scripts/e2e-s14-seed.sql` (admin, s14a — papelaria DEMO A — e o
# responsável de teste, todos de `supabase/seed.sql`/`scripts/e2e-s14-seed.sql`); `.env.local` (só neste worktree,
# não versionado) com as variáveis de `pnpm db:env`; `pnpm build && PORT=3003 pnpm start`.
# Ruling (ledger-comercio, S23): nenhuma etapa deste roteiro move dinheiro de verdade — "confirmar Pix pela
# plataforma" é um registro declarativo (Ruling da fatia); "gerar lote"/"marcar executado" são instrução e registro,
# nunca uma transferência real. Algumas verificações usam SQL direto (idempotência de 2ª tentativa de lote, alerta
# de pagamento tardio) pelo mesmo motivo do roteiro da S22: são efeitos que a UI desta fatia não expõe um segundo
# clique para repetir (a linha pendente some da tela depois do 1º lote). Nada aqui contém chave real.
set -u
cd "$(dirname "$0")/.."
BASE=${BASE:-http://127.0.0.1:3003}
MAILPIT=${MAILPIT:-http://127.0.0.1:54624}
DB=${DB:-supabase_db_listacerta-t3}
OUT=docs/superpowers/e2e/screenshots
ADMIN_ID=00000000-0000-4000-8000-0000000000a1
OWNER_A=00000000-0000-4000-8000-0000000014a1
STATIONERY_A=00000000-0000-4000-8000-0000000014a2 # Papelaria Demo A (is_demo)
PASS=0; FAIL=0
RUN=$(date +%s)
export AGENT_BROWSER_SESSION_PREFIX=t3s23
for s in admin a; do AGENT_BROWSER_SESSION="t3s23-$RUN-$s" agent-browser close >/dev/null 2>&1; done
ab() { local s=$1; shift; AGENT_BROWSER_SESSION="t3s23-$RUN-$s" agent-browser "$@"; }
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

echo "== 0) plano de cobrança (S21, pré-condição: leads_billing_charge exige plano ativo), escola de teste e dois leads reais (não-demo) confirmados como 'Vendi' com valor"
sql_stdin <<SQL
set role service_role;
select public.billing_plan_publish('$ADMIN_ID'::uuid,
  '{"free_leads":100,"free_leads_validity_days":null,"season":{"start_month":11,"end_month":3},"tiers":[{"min_items":1,"max_items":null,"price_cents":500}],"packages":[{"amount_cents":5000}],"pass":null}'::jsonb);
SQL
PLAN_ACTIVE=$(sql "select count(*) from public.plans where status = 'active';")
[ "$PLAN_ACTIVE" = "1" ] && ok "plano de cobrança publicado (100 leads grátis, pré-condição da S21)" || bad "publicar plano" "veio $PLAN_ACTIVE"
SCHOOL_ID=$(sql "insert into public.schools (inep, name, normalized_name, network, municipality_id) select '51999901', 'Escola E2E S23', 'escola e2e s23', 'municipal', municipality_id from public.stationeries where id = '$STATIONERY_A' returning id;")
[ -n "$SCHOOL_ID" ] && ok "escola de teste criada" || bad "criar escola" "id veio vazio"
insert_lead() {
  sql "insert into public.leads (code, requester_id, list_id, stationery_id, school_name, grade_label, school_year, municipality_id, item_count, expires_at, consent_text_version, consented_at, idempotency_key, is_demo, created_at) values ('$1', null, gen_random_uuid(), '$STATIONERY_A', 'Escola E2E S23', '5º ano', 2027, (select municipality_id from public.stationeries where id = '$STATIONERY_A'), 3, now() + interval '7 days', 'e2e-s23', now(), gen_random_uuid(), false, now()) returning id;"
}
LEAD1=$(insert_lead LC-S23A1)
LEAD2=$(insert_lead LC-S23A2)
sql "set role service_role; select public.lead_transition('$LEAD1'::uuid,'converted'::public.lead_status,'$OWNER_A'::uuid,'stationery',20000::int,null);" >/dev/null
sql "set role service_role; select public.lead_transition('$LEAD2'::uuid,'converted'::public.lead_status,'$OWNER_A'::uuid,'stationery',15000::int,null);" >/dev/null
S1=$(sql "select status from public.leads where id = '$LEAD1';")
[ "$S1" = "converted" ] && ok "2 leads reais declarados 'Vendi' (R\$200,00 e R\$150,00)" || bad "declarar vendas" "status veio $S1"

echo "== 1) admin publica comissão (10%) e prazos de inadimplência (atraso >3 dias, pausa >7 dias)"
ab admin set viewport 1280 900 >/dev/null
login admin admin@listacerta.test "/admin/repasses"
wait_text admin "Repasses para escolas" 20
ab admin eval "document.querySelector('input[name=commissionPercent]').value = '10,00'" >/dev/null
ab admin eval "document.querySelector('input[name=graceDays]').value = '3'" >/dev/null
ab admin eval "document.querySelector('input[name=blockDays]').value = '7'" >/dev/null
shot admin "$OUT/S23-admin13-comissao-form.png"
ab admin eval "[...document.querySelectorAll('form')].find(f=>f.querySelector('input[name=commissionPercent]')).requestSubmit()" >/dev/null
wait_text admin "Feito." 15
COMM=$(sql "select commission_bps from public.payout_settings where status = 'active';")
[ "$COMM" = "1000" ] && ok "comissão publicada (10,00% = 1000 bps)" || bad "publicar comissão" "veio $COMM"

echo "== 2) admin configura repasse de 5% para a APM da escola"
ab admin open "$BASE/admin/repasses" >/dev/null; wait_text admin "Repasses para escolas" 15
ab admin eval "document.querySelector('select[name=schoolId]').value = '$SCHOOL_ID'" >/dev/null
ab admin eval "document.querySelector('select[name=target]').value = 'apm'" >/dev/null
ab admin eval "document.querySelector('input[name=payoutPercent]').value = '5,00'" >/dev/null
ab admin eval "document.querySelector('input[name=beneficiaryName]').value = 'APM Escola E2E S23'" >/dev/null
ab admin eval "document.querySelector('input[name=pixKey]').value = 'apm-e2e@listacerta.test'" >/dev/null
ab admin eval "document.querySelector('select[name=pixKeyKind]').value = 'email'" >/dev/null
ab admin eval "[...document.querySelectorAll('form')].find(f=>f.querySelector('select[name=target]')).requestSubmit()" >/dev/null
wait_text admin "Feito." 15
expect_text admin "APM Escola E2E S23" "repasse da escola aparece na tabela"
shot admin "$OUT/S23-admin13-escola-config.png"

echo "== 3) papelaria confirma 'Pix pela plataforma' de LC-S23A1 com a escola; LC-S23A2 sem escola"
ab a set viewport 1280 900 >/dev/null
login a s14a@listacerta.test "/papelaria/leads/LC-S23A1"
wait_text a "Lead LC-S23A1" 20
ab a eval "document.querySelector('select[name=schoolId]').value = '$SCHOOL_ID'" >/dev/null
shot a "$OUT/S23-pap03-confirmar-form.png"
ab a eval "[...document.querySelectorAll('form')].find(f=>f.querySelector('select[name=schoolId]')).requestSubmit()" >/dev/null
wait_text a "Registrado" 15
expect_text a "Confirmado" "venda 1 confirmada (com escola)"
shot a "$OUT/S23-pap03-confirmada.png"
ab a open "$BASE/papelaria/leads/LC-S23A2" >/dev/null; wait_text a "Lead LC-S23A2" 15
ab a eval "[...document.querySelectorAll('form')].find(f=>f.querySelector('select[name=schoolId]')).requestSubmit()" >/dev/null
wait_text a "Registrado" 15
expect_text a "Confirmado" "venda 2 confirmada (sem escola)"

echo "== 4) admin vê as duas vendas com comissão e o repasse pendente da APM"
ab admin open "$BASE/admin/repasses" >/dev/null; wait_text admin "Vendas confirmadas" 15
expect_text admin "LC-S23A1" "venda 1 aparece"
expect_text admin "LC-S23A2" "venda 2 aparece"
expect_text admin "10,00" "repasse pendente de R\$ 10,00 (5% de R\$ 200,00) aparece"
shot admin "$OUT/S23-admin13-vendas-repasse.png"
COMMISSION_SUM=$(sql "select coalesce(sum(amount_cents),0) from public.payout_ledger where entry_type = 'commission';")
[ "$COMMISSION_SUM" = "3500" ] && ok "comissão total = R\$ 35,00 (10% de 200 + 10% de 150)" || bad "soma da comissão" "veio $COMMISSION_SUM"

echo "== 5) admin gera o lote de pagamento da APM; pendente zera; 2ª tentativa (SQL) -> nothing_due"
ab admin eval "(() => { const f=[...document.querySelectorAll('form')].find(f=>f.querySelector('button')?.textContent.includes('Gerar lote')); f.requestSubmit(); return 'ok'; })()" >/dev/null
wait_text admin "Feito." 15
expect_text admin "Nada pendente de repasse agora." "repasse pendente zerou depois do lote"
BATCH_ID=$(sql "select id from public.payout_batches where school_id = '$SCHOOL_ID' order by created_at desc limit 1;")
[ -n "$BATCH_ID" ] && ok "lote gerado (R\$ 10,00, pendente)" || bad "gerar lote" "id veio vazio"
HINT2=$(sql_stdin <<SQL 2>&1
set role service_role;
select public.payout_batch_create('$ADMIN_ID'::uuid, '$SCHOOL_ID'::uuid, 'apm');
SQL
)
grep -qi "nothing_due\|nada pendente" <<<"$HINT2" && ok "2ª geração de lote sem novo repasse_due -> nothing_due" || bad "idempotência do lote" "veio: $HINT2"

echo "== 6) admin marca o lote como executado (registro; nenhuma transferência real acontece aqui)"
ab admin open "$BASE/admin/repasses" >/dev/null; wait_text admin "Lotes de pagamento" 15
expect_text admin "Pendente" "lote aparece como pendente antes de marcar"
ab admin eval "(() => { const f=[...document.querySelectorAll('form')].find(f=>f.querySelector('input[name=batchId]')?.value==='$BATCH_ID'); f.requestSubmit(); return 'ok'; })()" >/dev/null
wait_text admin "Feito." 15
expect_text admin "Pago" "lote marcado como pago (executado)"
shot admin "$OUT/S23-admin13-lote-executado.png"

echo "== 7) D-101: pagamento recebido numa fatura de papelaria já paga vira alerta; admin resolve"
INV_ID=$(sql "insert into public.invoices (stationery_id, kind, package_id, amount_cents, due_date, status, provider, is_demo, paid_at, paid_amount_cents, idempotency_key) values ('$STATIONERY_A','credit_package',(select id from public.plan_credit_packages where plan_id = (select id from public.plans where status='active') limit 1),1000,current_date,'paid','fake',true,now(),1000,gen_random_uuid()) returning id;")
ALERT_ID=$(sql "set role service_role; select public.billing_flag_late_payment('$INV_ID'::uuid, 'fake', 'e2e-txid-tardio', 1000);")
[ -n "$ALERT_ID" ] && ok "alerta de pagamento tardio registrado" || bad "registrar alerta" "id veio vazio"
ab admin open "$BASE/admin/repasses" >/dev/null; wait_text admin "Alertas de pagamento tardio" 15
expect_text admin "recebidos numa fatura já paga" "alerta aparece na conciliação"
shot admin "$OUT/S23-admin13-alerta.png"
ab admin eval "document.querySelector('input[name=note]').value = 'conferido, sem estorno necessário (e2e)'" >/dev/null
ab admin eval "[...document.querySelectorAll('form')].find(f=>f.querySelector('input[name=note]')).requestSubmit()" >/dev/null
wait_text admin "Feito." 15
expect_text admin "Nenhum alerta em aberto." "alerta resolvido some da fila"

echo "== 8) inadimplência: fatura vencida há mais de 7 dias pausa a papelaria (some de novas cotações)"
sql "insert into public.invoices (stationery_id, kind, package_id, amount_cents, due_date, status, provider, is_demo, idempotency_key) values ('$STATIONERY_A','credit_package',(select id from public.plan_credit_packages where plan_id = (select id from public.plans where status='active') limit 1),1000,(current_date - 10),'open','fake',true,gen_random_uuid());" >/dev/null
ab admin open "$BASE/admin/inadimplencia" >/dev/null; wait_text admin "Inadimplência" 15
expect_text admin "Papelaria Demo A" "papelaria aparece na régua de cobrança"
expect_text admin "Pausado" "status pausado (atraso > 7 dias)"
shot admin "$OUT/S23-admin14-pausado.png"
CAN_RECEIVE=$(sql "select can_receive from public.billing_can_receive_lead(array['$STATIONERY_A']::uuid[], 3);")
[ "$CAN_RECEIVE" = "f" ] && ok "billing_can_receive_lead recusa a papelaria pausada (some das candidatas do App21)" || bad "bloqueio de lead" "veio $CAN_RECEIVE"

echo "== 9) Pap07-Desempenho mostra o funil e o ticket médio da papelaria (Pix pela plataforma confirmado)"
ab a open "$BASE/papelaria/desempenho" >/dev/null; wait_text a "Desempenho" 15
expect_text a "Vendidos" "funil aparece"
expect_text a "Ticket médio" "ticket médio aparece"
expect_text a "Você declarou" "declarado × confirmado aparece"
shot a "$OUT/S23-pap07-desempenho.png"

echo
echo "RESULTADO: $PASS passaram, $FAIL falharam"
exit $((FAIL > 0))
