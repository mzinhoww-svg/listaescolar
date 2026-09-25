#!/usr/bin/env bash
# E2E da S14 (cotação por WhatsApp e funil da papelaria) com agent-browser contra o build local da trilha 3.
# Pré-requisitos: `pnpm db:reset`; seed `scripts/e2e-s14-seed.sql` no banco local; `.env.local` (só neste worktree, não versionado)
# com as variáveis de `pnpm db:env` mais DEMO_RETAILERS=1 e CRON_SECRET (arquivo $SECRET_FILE, fora do repositório);
# `pnpm build && PORT=3003 pnpm start`. Nada aqui contém chaves; e-mails só do Mailpit local; nenhum WhatsApp real é aberto com dado real.
set -u
cd "$(dirname "$0")/.."
BASE=${BASE:-http://127.0.0.1:3003}
MAILPIT=${MAILPIT:-http://127.0.0.1:54624}
DB=${DB:-supabase_db_listacerta-t3}
SECRET_FILE=${SECRET_FILE:-/tmp/s14-cron-secret}
OUT=docs/superpowers/e2e/screenshots
LIST=00000000-0000-4000-8000-00000000d3a0
PARENT_ID=00000000-0000-4000-8000-0000000000a2
PASS=0; FAIL=0
RUN=$(date +%s)
export AGENT_BROWSER_SESSION_PREFIX=t3s14
for s in anon p pa pb; do AGENT_BROWSER_SESSION="t3s14-$RUN-$s" agent-browser close >/dev/null 2>&1; done
ab() { local s=$1; shift; AGENT_BROWSER_SESSION="t3s14-$RUN-$s" agent-browser "$@"; }
sql() { docker exec "$DB" psql -U postgres -At -c "$1"; }
ok() { PASS=$((PASS+1)); echo "PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL  $1  ($2)"; }
expect_text() { local t; t=$(ab "$1" get text body 2>/dev/null); if grep -qF -- "$2" <<<"$t"; then ok "$3"; else bad "$3" "esperava '$2'; veio: ${t:0:200}"; fi; }
expect_no_text() { local t; t=$(ab "$1" get text body 2>/dev/null); if grep -qF -- "$2" <<<"$t"; then bad "$3" "não deveria conter '$2'"; else ok "$3"; fi; }
wait_text() { for _ in $(seq 1 "$3"); do ab "$1" get text body 2>/dev/null | grep -qF -- "$2" && return 0; sleep 1; done; return 1; }
expect_eq() { if [ "$1" = "$2" ]; then ok "$3"; else bad "$3" "esperado '$2', veio '$1'"; fi; }
shot() { sleep 2; ab "$1" screenshot "$2" >/dev/null; }
clicktext() { # sessão, texto de <a>/<button> (ou aria-label)
  ab "$1" eval "(() => { const e = [...document.querySelectorAll('a,button')].find(x => (x.textContent||'').includes('$2') || (x.getAttribute('aria-label')||'').includes('$2')); if (!e) return 'sem-elemento'; e.click(); return 'ok'; })()" >/dev/null
}
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
# Novo lead pelo fluxo real: consentimento (com duplo envio do MESMO formulário) -> código
create_lead() { # sessão, carrinho, texto do link da papelaria
  ab "$1" open "$BASE/cotacao/nova?carrinho=$2" >/dev/null
  wait_text "$1" "Papelarias" 15; clicktext "$1" "$3"
  wait_text "$1" "Confirmar pedido de cotação" 15; sleep 1
  ab "$1" click 'input[type=checkbox]' >/dev/null
  ab "$1" eval "(() => { const f = document.querySelector('form[aria-label^=Consentimento]'); f.requestSubmit(); f.requestSubmit(); return 'ok'; })()" >/dev/null
  for _ in $(seq 1 20); do ab "$1" get url 2>/dev/null | grep -q "/cotacao/LC-" && break; sleep 1; done
  ab "$1" get url | sed -E 's#.*/cotacao/(LC-[0-9A-Z]+).*#\1#'
}

echo "== a) anônimo e login"
ab anon set viewport 390 844 >/dev/null
ab anon open "$BASE/cotacao" >/dev/null; sleep 1
[[ $(ab anon get url) == *"/entrar?next=%2Fcotacao"* ]] && ok "anônimo em /cotacao vai ao login" || bad "anônimo em /cotacao" "$(ab anon get url)"
ab anon open "$BASE/papelaria/leads" >/dev/null; sleep 1
[[ $(ab anon get url) == *"/entrar"* ]] && ok "anônimo em /papelaria/leads vai ao login" || bad "anônimo em /papelaria/leads" "$(ab anon get url)"

echo "== b) responsável: carrinho, opções de papelarias, consentimento"
ab p set viewport 390 844 >/dev/null
login p parent@listacerta.test "/carrinho/novo?lista=$LIST"
wait_text p "Comparar opções" 20; sleep 1
clicktext p "Comparar opções"
for _ in $(seq 1 20); do ab p get url | grep -q "/carrinho/[0-9a-f-]\{36\}" && break; sleep 1; done
CART=$(ab p get url | sed -E 's#.*/carrinho/([0-9a-f-]{36}).*#\1#')
[ -n "$CART" ] && ok "carrinho demo criado ($CART)" || bad "carrinho" "sem id"
expect_text p "Pedir cotação a papelarias" "opção local do carrinho tem o link de cotação"
shot p "$OUT/S14-carrinho-link.png"
ab p open "$BASE/cotacao/nova" >/dev/null; sleep 1
expect_text p "Nenhum carrinho escolhido" "sem carrinho: estado vazio"
ab p open "$BASE/cotacao/nova?carrinho=$CART" >/dev/null; wait_text p "Papelaria Demo A" 15
expect_text p "Papelaria Demo A" "App21 lista a papelaria A"
expect_text p "Papelaria Demo B" "App21 lista a papelaria B"
expect_text p "Estimativa pelo catálogo da papelaria: R$ 73,60" "estimativa da A = 4x12,90 + 12x1,50 + 2x2,00 = 73,60 (cola em falta e tesoura sem preço ficam de fora)"
expect_text p "3 de 5 itens com preço" "cobertura do catálogo dita"
expect_no_text p "km" "sem distância inventada"
expect_no_text p "Parceira da escola" "sem selo inventado"
shot p "$OUT/S14-app21-papelarias.png"
ab p open "$BASE/cotacao/nova?carrinho=$CART&entrega=1" >/dev/null; wait_text p "Papelaria Demo A" 15
expect_no_text p "Papelaria Demo B" "filtro Entrega tira a B (só retirada)"
ab p open "$BASE/cotacao/nova?carrinho=$CART" >/dev/null; wait_text p "Papelaria Demo A" 15
clicktext p "Pedir pelo WhatsApp a Papelaria Demo A"
wait_text p "Confirmar pedido de cotação" 15; sleep 1
expect_text p "o bairro informado" "consentimento cita o bairro"
expect_text p "Código: LC-XXXX" "prévia da mensagem com código provisório"
DIS=$(ab p eval "document.querySelector('form[aria-label^=Consentimento] button[type=submit]').disabled")
expect_eq "$DIS" "true" "botão desabilitado sem aceite"
CHK=$(ab p eval "document.querySelector('input[type=checkbox]').checked")
expect_eq "$CHK" "false" "checkbox nasce desmarcado"
shot p "$OUT/S14-app21-consentimento.png"
# força o envio sem o aceite (remove o disabled): o servidor recusa
ab p eval "(() => { const f = document.querySelector('form[aria-label^=Consentimento]'); const b = f.querySelector('button[type=submit]'); b.disabled = false; b.click(); return 'ok'; })()" >/dev/null
wait_text p "consentimento" 10
expect_text p "Para pedir a cotação é preciso marcar o consentimento." "sem aceite o servidor recusa (?erro=consent_required)"
expect_eq "$(sql "select count(*) from public.leads")" "0" "nenhum lead criado sem aceite"
LEAD1=$(create_lead p "$CART" "Pedir pelo WhatsApp a Papelaria Demo A")
[[ "$LEAD1" == LC-* ]] && ok "lead criado com aceite: $LEAD1" || bad "criar lead" "$LEAD1"
expect_eq "$(sql "select count(*) from public.leads")" "1" "duplo envio do mesmo formulário: 1 lead só"
expect_eq "$(sql "select count(*) from public.consents where purpose='lead_whatsapp_quote'")" "1" "1 consentimento gravado"
expect_eq "$(sql "select consent_text_version from public.leads")" "lead-whatsapp-2026-09b" "versão do texto de consentimento gravada pelo servidor"

echo "== c) App09: confirmação, prévia, WhatsApp"
expect_text p "$LEAD1" "App09 mostra o código"
expect_text p "Escola Demonstração" "escola"
expect_text p "5º ano · 2027" "série e ano"
expect_text p "Papelaria Demo A" "papelaria"
expect_text p "Demonstração" "selo Demonstração"
expect_text p "Valor informado pela papelaria" "linha de valor"
expect_text p "indisponível" "valor indisponível até a papelaria informar"
expect_text p "Lista: $BASE/papelaria/leads/$LEAD1" "prévia com link da lista"
expect_no_text p "parent@listacerta.test" "prévia sem e-mail do responsável"
shot p "$OUT/S14-app09-confirmacao.png"
# a navegação para o wa.me é ABORTADA no navegador (nenhum WhatsApp real é aberto); a URL vem do log de requisições
ab p network route "**wa.me**" --abort >/dev/null
ab p network requests --clear >/dev/null
clicktext p "Abrir WhatsApp"
for _ in $(seq 1 15); do ab p network requests --filter wa.me 2>/dev/null | grep -q "wa.me" && break; sleep 1; done
WA=$(ab p network requests --filter wa.me 2>/dev/null | grep -oE 'https://wa\.me/[^ "]+' | head -1)
ab p network unroute >/dev/null
[[ "$WA" == https://wa.me/5565999991234\?text=* ]] && ok "abriu https://wa.me/<número da papelaria A>?text=..." || bad "wa.me" "$WA"
DEC=$(python3 - "$WA" <<'PY'
import sys, urllib.parse
u = urllib.parse.urlparse(sys.argv[1]); print(urllib.parse.parse_qs(u.query).get("text", [""])[0])
PY
)
echo "---- mensagem decodificada ----"; echo "$DEC"; echo "-------------------------------"
grep -q "Código: $LEAD1" <<<"$DEC" && grep -q "Escola: Escola Demonstração" <<<"$DEC" && grep -q "Série: 5º ano (2027)" <<<"$DEC" && grep -q "Lista: $BASE/papelaria/leads/$LEAD1" <<<"$DEC" && ok "mensagem: código, escola, série, ano e link" || bad "mensagem" "$DEC"
grep -qiE "parent@|@listacerta|Aluno|telefone|cpf" <<<"$DEC" && bad "mensagem sem dado pessoal" "achou dado pessoal" || ok "mensagem sem nome, e-mail nem telefone do responsável"
expect_eq "$(sql "select count(*) from public.lead_events where event_type='whatsapp_opened'")" "1" "whatsapp_opened registrado ANTES do redirecionamento"
ab p set viewport 390 844 >/dev/null
ab p open "$BASE/cotacao" >/dev/null; wait_text p "Minhas cotações" 15
expect_text p "Papelaria Demo A" "App08: cotação da A"
expect_text p "Novo" "App08: status Novo"
expect_text p "Valor: ainda não informado" "App08: sem valor inventado"
shot p "$OUT/S14-app08-cotacoes.png"

echo "== d) papelaria A: painel, detalhe, transições"
ab pa set viewport 1280 800 >/dev/null
login pa s14a@listacerta.test "/papelaria/leads"
wait_text pa "Leads da lista escolar" 20
expect_text pa "$LEAD1" "painel lista o lead"
expect_text pa "Novos (1)" "aba Novos com 1"
expect_no_text pa "Nenhum lead ainda" "sem estado vazio quando há lead"
expect_text pa "Demonstração" "selo Demonstração"
expect_eq "$(sql "select status from public.leads where code='$LEAD1'")" "received" "antes de abrir: received"
shot pa "$OUT/S14-pap02-leads.png"
clicktext pa "Abrir $LEAD1"
wait_text pa "Registrar resultado" 20
expect_eq "$(sql "select status from public.leads where code='$LEAD1'")" "viewed" "abrir o detalhe marca viewed"
expect_text pa "Você abriu a lista" "linha do tempo: evento de abertura"
expect_text pa "Lead enviado pelo responsável" "linha do tempo: lead enviado"
expect_text pa "identificado pelo código" "responsável identificado só pelo código"
expect_text pa "R$ 73,60" "subtotal pelo catálogo"
expect_text pa "3 de 5 itens com preço" "subtotal parcial dito"
expect_text pa "Em falta" "estoque informado (cola em falta)"
shot pa "$OUT/S14-pap03-detalhe.png"
# PII: HTML e RSC da papelaria não têm nome/e-mail/telefone/requester_id/cart_id
for kind in html rsc; do
  if [ $kind = html ]; then F="fetch(location.href).then(r=>r.text())"; else F="fetch(location.href,{headers:{RSC:'1'}}).then(r=>r.text())"; fi
  DUMP=$(ab pa eval "$F")
  LEAK=""
  for needle in "parent@listacerta.test" "$PARENT_ID" "$CART" "requester_id" "requesterId" "cart_id" "cartId" "999991234"; do
    grep -qF -- "$needle" <<<"$DUMP" && LEAK="$LEAK [$needle]"
  done
  [ -z "$LEAK" ] && ok "detalhe ($kind) sem e-mail/requester_id/cart_id do responsável" || bad "detalhe ($kind) vazou" "$LEAK"
done
DUMPL=$(ab pa eval "fetch('$BASE/papelaria/leads').then(r=>r.text())")
LEAK=""; for needle in "parent@listacerta.test" "$PARENT_ID" "$CART" "requester_id" "cart_id"; do grep -qF -- "$needle" <<<"$DUMPL" && LEAK="$LEAK [$needle]"; done
[ -z "$LEAK" ] && ok "lista (html) sem dado do responsável" || bad "lista vazou" "$LEAK"
# orçamento com valor, depois "Vendi" com valor
ab pa fill 'input[aria-label="Valor do orçamento (opcional)"]' "120,50" >/dev/null
clicktext pa "Orçamento enviado"
wait_text pa "Cotação enviada · R\$ 120,50" 15
expect_eq "$(sql "select status||'/'||quoted_total_cents from public.leads where code='$LEAD1'")" "quote_sent/12050" "orçamento com valor: quote_sent, R\$ 120,50 em centavos"
expect_text pa "Cotação enviada · R\$ 120,50" "linha do tempo com o valor"
ab p open "$BASE/cotacao" >/dev/null; wait_text p "Minhas cotações" 15
expect_text p "Valor informado: R\$ 120,50" "solicitante vê o valor SÓ agora que a papelaria informou"
expect_text p "Cotação enviada" "solicitante vê o status"
shot p "$OUT/S14-app08-cotacao-orcada.png"
ab pa fill 'input[aria-label="Valor da venda (opcional)"]' "150,00" >/dev/null
clicktext pa "Vendi"
wait_text pa "Lead encerrado: sem novas ações." 15
expect_eq "$(sql "select status||'/'||declared_sale_cents from public.leads where code='$LEAD1'")" "converted/15000" "Vendi: converted (declarada), R\$ 150,00"
expect_text pa "Vendido (declarado)" "UI diz venda declarada"
expect_text pa "Lead encerrado: sem novas ações." "lead terminal fica bloqueado"
shot pa "$OUT/S14-pap03-vendido.png"
ab pa open "$BASE/papelaria/leads?aba=sold" >/dev/null; wait_text pa "Leads da lista escolar" 15
expect_text pa "$LEAD1" "aba Vendidos lista o lead"
expect_text pa "R$ 150,00" "KPI do mês mostra o valor declarado"
shot pa "$OUT/S14-pap02-vendidos.png"
ab pa open "$BASE/papelaria/leads?aba=new" >/dev/null; wait_text pa "Leads da lista escolar" 15
expect_text pa "Nenhum lead ainda" "aba Novos vazia depois do atendimento"
shot pa "$OUT/S14-pap02-vazio.png"

echo "== e) 404 idêntico: outra papelaria e código inexistente"
ab pb set viewport 1280 800 >/dev/null
login pb s14b@listacerta.test "/papelaria/leads"
wait_text pb "Leads da lista escolar" 20
expect_text pb "Nenhum lead ainda" "B não vê o lead da A"
ab pb open "$BASE/papelaria/leads/$LEAD1" >/dev/null; sleep 2
T_FOREIGN=$(ab pb get text body)
ab pb open "$BASE/papelaria/leads/LC-ZZZZ" >/dev/null; sleep 2
T_MISSING=$(ab pb get text body)
grep -qF "Esta página não está na lista" <<<"$T_FOREIGN" && ok "código alheio: 404" || bad "alheio" "${T_FOREIGN:0:150}"
[ "$T_FOREIGN" = "$T_MISSING" ] && ok "404 do código alheio idêntico ao do inexistente" || bad "404 idêntico" "textos diferem"
shot pb "$OUT/S14-pap03-404.png"
expect_eq "$(sql "select status from public.leads where code='$LEAD1'")" "converted" "B não alterou o lead da A"
grep -qF "$LEAD1" <<<"$T_FOREIGN" && bad "404 não repete o código" "eco" || ok "404 não ecoa o código"

echo "== f) responsável: expirar (cron) e cancelar"
LEAD2=$(create_lead p "$CART" "Pedir pelo WhatsApp a Papelaria Demo B")
[[ "$LEAD2" == LC-* ]] && ok "segundo lead (para a B): $LEAD2" || bad "lead 2" "$LEAD2"
sql "update public.leads set created_at = now() - interval '8 days', expires_at = now() - interval '1 day' where code='$LEAD2'" >/dev/null
SECRET=$(cat "$SECRET_FILE")
expect_eq "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/cron/leads-expire")" "401" "cron sem segredo: 401"
expect_eq "$(curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer errado-errado-errado' "$BASE/api/cron/leads-expire")" "401" "cron com segredo errado: 401"
CRON=$(curl -s -w ' %{http_code}' -H "Authorization: Bearer $SECRET" "$BASE/api/cron/leads-expire")
grep -q " 200$" <<<"$CRON" && ok "cron com segredo: 200 ($CRON)" || bad "cron" "$CRON"
expect_eq "$(sql "select status from public.leads where code='$LEAD2'")" "expired" "cron expirou o lead vencido"
expect_eq "$(sql "select count(*) from public.lead_events where event_type='expired'")" "1" "evento expired registrado"
ab p open "$BASE/cotacao/$LEAD2" >/dev/null; wait_text p "Este pedido está encerrado." 15
expect_text p "Expirado" "App09 do lead expirado: status e sem botão de WhatsApp"
expect_no_text p "Abrir WhatsApp" "sem Abrir WhatsApp em lead encerrado"
shot p "$OUT/S14-app09-expirado.png"
ab pb open "$BASE/papelaria/leads?aba=closed" >/dev/null; wait_text pb "Leads da lista escolar" 15
expect_text pb "$LEAD2" "B vê o lead expirado em Encerrados"
LEAD3=$(create_lead p "$CART" "Pedir pelo WhatsApp a Papelaria Demo A")
[[ "$LEAD3" == LC-* ]] && ok "terceiro lead (para a A): $LEAD3" || bad "lead 3" "$LEAD3"
clicktext p "Cancelar pedido"
wait_text p "Pedido cancelado." 15
expect_eq "$(sql "select status from public.leads where code='$LEAD3'")" "cancelled" "responsável cancelou"
shot p "$OUT/S14-app09-cancelado.png"
ab pa open "$BASE/papelaria/leads/$LEAD3" >/dev/null; wait_text pa "Lead encerrado" 15
expect_text pa "Pedido cancelado" "papelaria vê o cancelamento na linha do tempo"

echo "== g) mobile da papelaria (Pap02m/Pap03m)"
ab pa set viewport 390 844 >/dev/null
ab pa open "$BASE/papelaria/leads" >/dev/null; wait_text pa "Leads da lista escolar" 15
shot pa "$OUT/S14-pap02m-leads.png"
ab pa open "$BASE/papelaria/leads/$LEAD1" >/dev/null; wait_text pa "Lead $LEAD1" 15
shot pa "$OUT/S14-pap03m-detalhe.png"

echo; echo "RESULTADO: $PASS OK, $FAIL falhas"
[ "$FAIL" -eq 0 ]
