#!/usr/bin/env bash
# E2E da S26 (campanhas de marca, insights e faturamento B2B) com agent-browser contra o build de PRODUÇÃO local
# da trilha 2. Pré-requisitos: `pnpm db:reset` seguido de `docker exec -i supabase_db_listacerta-t2 psql -U
# postgres < scripts/e2e-s26-seed.sql` (parceiro MARCA já ativo, dono parent@listacerta.test; 6 listas reais
# publicadas com categoria "papelaria" em Cuiabá/MT — para o insight ficar VISÍVEL — e 2 com categoria "uniforme"
# — para ficar SUPRIMIDO; uma campanha já aprovada com eventos reais e um extrato já gerado). `pnpm build && PORT=
# 3002 pnpm start` (feito manualmente antes deste script). Reaproveita os usuários reais do seed padrão.
set -u
cd "$(dirname "$0")/.."
BASE=${BASE:-http://127.0.0.1:3002}
MAILPIT=${MAILPIT:-http://127.0.0.1:54524}
DB=${DB:-supabase_db_listacerta-t2}
OUT=docs/superpowers/e2e/screenshots
PASS=0; FAIL=0
RUN=$(date +%s)
export AGENT_BROWSER_SESSION_PREFIX=t2s26
for s in p a; do AGENT_BROWSER_SESSION="t2s26-$RUN-$s" agent-browser close >/dev/null 2>&1; done
ab() { local s=$1; shift; AGENT_BROWSER_SESSION="t2s26-$RUN-$s" agent-browser "$@"; }
sql() { docker exec "$DB" psql -U postgres -At -c "$1"; }
ok() { PASS=$((PASS+1)); echo "PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL  $1  ($2)"; }
expect_text() { local t; t=$(ab "$1" get text body 2>/dev/null); if grep -qF -- "$2" <<<"$t"; then ok "$3"; else bad "$3" "esperava '$2'; veio: ${t:0:300}"; fi; }
refute_text() { local t; t=$(ab "$1" get text body 2>/dev/null); if grep -qF -- "$2" <<<"$t"; then bad "$3" "não devia conter '$2'"; else ok "$3"; fi; }
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

PARTNER_ID=$(sql "select partner_id from public.b2b_partner_members where profile_id = '00000000-0000-4000-8000-0000000000a2'")
echo "parceiro marca = $PARTNER_ID"
[ -n "$PARTNER_ID" ] && ok "seed: parceiro marca do dono existe" || bad "seed" "PARTNER_ID vazio — rode scripts/e2e-s26-seed.sql"

echo "== a) B2B06 · campanha semeada aparece Ativa, com o aviso de 'Sugestão patrocinada'"
ab p set viewport 1280 1000 >/dev/null
login p parent@listacerta.test "/b2b/campanhas"
wait_text p "Campanhas" 20
expect_text p "Sugestão patrocinada" "B2B06 explica o selo de patrocinado"
expect_text p "Campanha Seed E2E S26" "B2B06 lista a campanha semeada"
expect_text p "Ativa" "campanha semeada aparece Ativa (aprovada no seed)"
shot p "$OUT/S26-b2b06-campanhas.png"

echo "== b) B2B07 · criar campanha nova, enviar para aprovação"
ab p open "$BASE/b2b/campanhas/nova" >/dev/null
wait_text p "Nova campanha" 15
ab p fill 'input[name="name"]' "Campanha Roteiro E2E S26" >/dev/null
ab p fill 'input[name="productLabel"]' "Lapis de cor 24 cores" >/dev/null
ab p fill 'input[name="targetCategory"]' "papelaria" >/dev/null
ab p select 'select[name="pricingModel"]' "cpm" >/dev/null
ab p fill 'input[name="bidReais"]' "5" >/dev/null
ab p fill 'input[name="totalBudgetReais"]' "500" >/dev/null
shot p "$OUT/S26-b2b07-nova-campanha.png"
clicktext p "Criar e enviar"
sleep 2
NEW_CAMPAIGN=$(sql "select id from public.b2b_campaigns where name = 'Campanha Roteiro E2E S26' order by created_at desc limit 1")
[ -n "$NEW_CAMPAIGN" ] && ok "campanha nova gravada no banco ($NEW_CAMPAIGN)" || bad "campanha nova" "não encontrada"
STATUS_NEW=$(sql "select status::text from public.b2b_campaigns where id='$NEW_CAMPAIGN'")
expect_eq "$STATUS_NEW" "pending_review" "campanha nova entra pending_review (enviada para aprovação)"

echo "== c) Admin16 · fila de aprovação com aviso de checagem Procon por lista; aprovar"
login a admin@listacerta.test "/admin/campanhas"
wait_text a "Fila de aprovação" 20
expect_text a "Campanha Roteiro E2E S26" "Admin16 lista a campanha pendente"
expect_text a "checagem é automática, por lista" "Admin16 avisa que o bloqueio Procon é por lista, não nesta tela"
shot a "$OUT/S26-admin16-fila.png"
clicktext a "Aprovar"
sleep 2
STATUS_APPROVED=$(sql "select status::text from public.b2b_campaigns where id='$NEW_CAMPAIGN'")
expect_eq "$STATUS_APPROVED" "approved" "admin aprova pelo Admin16"
ab a screenshot "$OUT/S26-admin16-aprovada.png" >/dev/null

echo "== d) B2B08 · insights: papelaria/ef VISÍVEL (6 escolas, nomeada); uniforme/ef SUPRIMIDO (2 < k mínimo, some por inteiro)"
ab p open "$BASE/b2b/insights" >/dev/null
wait_text p "Insights" 15
ab p fill 'input[name="category"]' "papelaria" >/dev/null
ab p select 'select[name="gradeStage"]' "ef" >/dev/null
clicktext p "Buscar"
sleep 2
expect_text p "Cuiabá" "insight de papelaria/ef mostra Cuiabá nomeada"
CUIABA_COUNT=$(ab p eval "[...document.querySelectorAll('tr')].map(r=>r.textContent).find(t=>t.includes('Cuiabá'))||''")
grep -q "6" <<<"$CUIABA_COUNT" && ok "Cuiabá mostra a contagem real (6 escolas)" || bad "contagem visível" "$CUIABA_COUNT"
expect_text p "Total exibido:" "total exibido é a soma do que aparece, nunca a soma bruta"
shot p "$OUT/S26-b2b08-insights-visivel.png"

ab p fill 'input[name="category"]' "uniforme" >/dev/null
clicktext p "Buscar"
sleep 2
refute_text p "Cuiabá" "cidade pequena sozinha (2 escolas, abaixo do k mínimo) nunca aparece NOMEADA"
refute_text p "\"count\":2" "contagem crua nunca aparece na tela quando suprimida"
expect_text p "Nenhum dado disponível" "sem cidade visível nem agregado 'outras' (2 < k, sozinha, nem agregada chega a k)"
expect_text p "Existem localidades" "avisa que existe dado oculto, sem revelar quanto"
shot p "$OUT/S26-b2b08-insights-suprimido.png"

echo "== e) B2B09 · faturamento: uso de API sempre indisponível; campanha com o valor que o parceiro declarou"
ab p open "$BASE/b2b/faturamento" >/dev/null
wait_text p "Faturamento" 15
expect_text p "indisponível" "linha de uso de API aparece indisponível (sem preço inventado)"
expect_text p "Campanha Seed E2E S26" "linha da campanha aparece no extrato"
expect_text p "R\$ 3,00" "linha da campanha mostra o valor certo (1 clique x bid de R\$ 3,00)"
refute_text p "Cobrar" "não existe botão de cobrar (sem cobrança automática)"
shot p "$OUT/S26-b2b09-faturamento.png"

echo
echo "== resultado: $PASS passaram, $FAIL falharam =="
[ "$FAIL" -eq 0 ]
