#!/usr/bin/env bash
# E2E da S24 (portal B2B, chaves, API v1, admin de parceiros) com agent-browser + curl contra o build local da
# trilha 2. Pré-requisitos: `pnpm db:reset`; seed `scripts/e2e-s24-seed.sql` no banco local (escola/lista REAL e
# DEMO publicadas em Cuiabá); `.env.local` (só neste worktree, não versionado) com `B2B_API_KEY_PEPPER` (≥32
# caracteres aleatórios), `CRON_SECRET` e as variáveis mínimas de `lib/env.ts` (`OPENROUTER_KEY`/`AI_MODEL_*`,
# não usadas por esta fatia, mas exigidas por `getServerEnv()`); `pnpm build && PORT=3002 pnpm start`. Reaproveita
# os usuários reais do seed padrão: parent@listacerta.test (dono do parceiro) e admin@listacerta.test (decide).
# Nada aqui contém segredo real; e-mails só do Mailpit local.
set -u
cd "$(dirname "$0")/.."
BASE=${BASE:-http://127.0.0.1:3002}
MAILPIT=${MAILPIT:-http://127.0.0.1:54524}
DB=${DB:-supabase_db_listacerta-t2}
OUT=docs/superpowers/e2e/screenshots
PASS=0; FAIL=0
RUN=$(date +%s)
export AGENT_BROWSER_SESSION_PREFIX=t2s24
for s in anon p a; do AGENT_BROWSER_SESSION="t2s24-$RUN-$s" agent-browser close >/dev/null 2>&1; done
ab() { local s=$1; shift; AGENT_BROWSER_SESSION="t2s24-$RUN-$s" agent-browser "$@"; }
sql() { docker exec "$DB" psql -U postgres -At -c "$1"; }
ok() { PASS=$((PASS+1)); echo "PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL  $1  ($2)"; }
# Máscara de chave (revisão de segurança independente, achado 6): nunca imprimir o texto claro numa falha de
# asserção, nem no log do CI/terminal — só o prefixo (ambiente) e os últimos 4 caracteres, como `KeyMask` no app.
mask_key() { local k=$1; [ -z "$k" ] && { echo "(vazia)"; return; }; local env; env=$(cut -d_ -f2 <<<"$k"); echo "lc_${env}_••••••••••••${k: -4}"; }
expect_text() { local t; t=$(ab "$1" get text body 2>/dev/null); if grep -qF -- "$2" <<<"$t"; then ok "$3"; else bad "$3" "esperava '$2'; veio: ${t:0:200}"; fi; }
expect_no_text() { local t; t=$(ab "$1" get text body 2>/dev/null); if grep -qF -- "$2" <<<"$t"; then bad "$3" "não deveria conter '$2'"; else ok "$3"; fi; }
wait_text() { for _ in $(seq 1 "$3"); do ab "$1" get text body 2>/dev/null | grep -qF -- "$2" && return 0; sleep 1; done; return 1; }
expect_eq() { if [ "$1" = "$2" ]; then ok "$3"; else bad "$3" "esperado '$2', veio '$1'"; fi; }
shot() { sleep 1; ab "$1" screenshot "$2" >/dev/null; }
clicktext() { # sessão, texto de <a>/<button>/<label>
  ab "$1" eval "(() => { const e = [...document.querySelectorAll('a,button,label')].find(x => (x.textContent||'').trim().startsWith('$2')); if (!e) return 'sem-elemento'; e.click(); return 'ok'; })()" >/dev/null
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
# Extrai o texto claro exibido uma vez no diálogo de chave (Copiar/Já copiei), sem nunca logar o segredo inteiro.
# `agent-browser eval` devolve string como JSON (entre aspas); tira as aspas.
read_dialog_key() { ab "$1" eval "document.querySelector('dialog code')?.textContent || ''" | sed -e 's/^"//' -e 's/"$//'; }

REAL_INEP=51900101
DEMO_INEP=51900102
REAL_LIST=$(sql "select sl.id from public.school_lists sl join public.schools s on s.id=sl.school_id where s.inep='$REAL_INEP'")
CRON_SECRET_VAL=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)

echo "== a) visitante: /parceiros (selos Em breve, docs públicas, sem SLA/e-mail inventado)"
ab anon set viewport 1280 900 >/dev/null
ab anon open "$BASE/parceiros" >/dev/null; sleep 1
# `ComingSoonBadge` usa text-transform:uppercase (CSS); innerText reflete a renderização, então o texto vem "EM BREVE".
T=$(ab anon get text body 2>/dev/null)
grep -qiF "em breve" <<<"$T" && ok "recursos de S25/S26 com selo Em breve" || bad "recursos de S25/S26 com selo Em breve" "${T:0:200}"
expect_no_text anon "Respondemos em" "sem SLA inventado"
expect_no_text anon "parceiros@listacerta.com.br" "sem e-mail de contato inventado"
expect_no_text anon "Nova conta" "B2B00 não é o Admin15"
shot anon "$OUT/S24-parceiros-visitante.png"
ab anon open "$BASE/parceiros/docs" >/dev/null; wait_text anon "GET" 10
expect_text anon "/v1/carts/match" "docs públicas listam os endpoints reais"
shot anon "$OUT/S24-parceiros-docs.png"
ab anon open "$BASE/parceiros#cadastro" >/dev/null; sleep 1
expect_text anon "Entrar para enviar" "sem login: Entrar para enviar"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/cron/b2b-maintenance")
expect_eq "$CODE" "401" "cron sem segredo: 401"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/cron/b2b-maintenance" -H "Authorization: Bearer $CRON_SECRET_VAL")
expect_eq "$CODE" "200" "cron com o segredo real: 200"

echo "== b) cadastro (login obrigatório; sem aceite não avança)"
ab p set viewport 1280 900 >/dev/null
login p parent@listacerta.test "/parceiros%23cadastro"
wait_text p "Vamos conversar" 20
ab p fill 'input[name=tradeName]' "Papelaria B2B E2E" >/dev/null
ab p fill 'input[name=legalName]' "Papelaria B2B E2E Ltda" >/dev/null
ab p fill 'input[name=cnpj]' "11.222.333/0001-81" >/dev/null
ab p fill 'input[name=contactName]' "Responsável E2E" >/dev/null
BEFORE_URL=$(ab p get url)
clicktext p "Enviar"
sleep 1
expect_eq "$(ab p get url)" "$BEFORE_URL" "sem aceite dos termos, o navegador não envia (checkbox required)"
ab p check 'input[name=termsAccepted]' >/dev/null
clicktext p "Enviar"
for _ in $(seq 1 15); do ab p get url | grep -q "/b2b" && break; sleep 1; done
[[ $(ab p get url) == *"/b2b"* ]] && ok "cadastro aceito redireciona a /b2b" || bad "redirect pós-cadastro" "$(ab p get url)"
wait_text p "Aguardando aprovação" 10
expect_text p "Aguardando aprovação" "B2B01 pendente: aguardando aprovação"
shot p "$OUT/S24-b2b-pendente.png"
PARTNER_ID=$(sql "select partner_id from public.b2b_partner_members where profile_id = '00000000-0000-4000-8000-0000000000a2'")
[ -n "$PARTNER_ID" ] && ok "parceiro criado ($PARTNER_ID)" || bad "parceiro criado" "vazio"

echo "== c) admin aprova em sandbox com limites pequenos"
ab a set viewport 1280 900 >/dev/null
login a admin@listacerta.test "/admin/parceiros"
wait_text a "Parceiros B2B" 20
expect_text a "Pendentes (1)" "fila mostra Pendentes (1)"
shot a "$OUT/S24-admin-lista.png"
ab a open "$BASE/admin/parceiros/$PARTNER_ID" >/dev/null; wait_text a "Decisão" 15
ab a click "input[name=to][value=sandbox]" >/dev/null
ab a select 'select[name=plan]' regional >/dev/null
ab a fill 'input[name=testRatePerMinute]' "3" >/dev/null
ab a fill 'input[name=testRatePerDay]' "1000" >/dev/null
ab a click 'aside button[type=submit]'
wait_text a "Decisão registrada." 15
expect_text a "Sandbox" "parceiro passou a sandbox"
shot a "$OUT/S24-admin-decisao-sandbox.png"

echo "== d) dono cria chave test (texto claro uma vez; recarregar não mostra)"
ab p open "$BASE/b2b/api" >/dev/null; wait_text p "Nova chave" 15
EN_COUNT=$(ab p eval "document.querySelectorAll('input[name=environment]').length")
expect_eq "$EN_COUNT" "1" "sandbox: só o ambiente Sandbox disponível para chave nova"
clicktext p "Nova chave"
sleep 1
clicktext p "Criar chave"
sleep 1
TESTKEY=$(read_dialog_key p)
[[ "$TESTKEY" == lc_test_* ]] && ok "chave test emitida (texto claro capturado uma vez)" || bad "criar chave test" "$(mask_key "$TESTKEY")"
shot p "$OUT/S24-b2b-nova-chave.png"
clicktext p "Já copiei"
sleep 1
ab p reload >/dev/null; sleep 1
DUMP=$(ab p eval "document.body.innerHTML")
grep -qF -- "$(echo "$TESTKEY" | cut -d_ -f4)" <<<"$DUMP" && bad "recarregar não deveria mostrar o segredo de novo" "achou" || ok "recarregar a página não mostra o texto claro de novo"

echo "== e) curl com a chave test: só a escola/lista demo; live indisponível"
BODY=$(curl -s "$BASE/v1/schools" -H "x-listacerta-key: $TESTKEY")
echo "$BODY" | grep -q "\"$DEMO_INEP\"" && echo "$BODY" | grep -qv "\"$REAL_INEP\"" && ok "chave test só lista a escola demo" || bad "escopo test" "$BODY"
echo "$BODY" | grep -q '"environment":"test"' && ok "meta.environment = test" || bad "meta.environment" "$BODY"

echo "== f) admin promove a active com limites live"
ab a open "$BASE/admin/parceiros/$PARTNER_ID" >/dev/null; wait_text a "Decisão" 15
ab a click "input[name=to][value=active]" >/dev/null
ab a select 'select[name=plan]' regional >/dev/null
ab a fill 'input[name=testRatePerMinute]' "3" >/dev/null
ab a fill 'input[name=testRatePerDay]' "1000" >/dev/null
ab a fill 'input[name=liveRatePerMinute]' "3" >/dev/null
ab a fill 'input[name=liveRatePerDay]' "1000" >/dev/null
ab a click 'aside button[type=submit]'
wait_text a "Decisão registrada." 15
expect_text a "Ativa" "parceiro passou a active"
shot a "$OUT/S24-admin-decisao-active.png"

echo "== g) dono cria chave live; curl lista dados reais; carts/match"
ab p open "$BASE/b2b/api" >/dev/null; wait_text p "Nova chave" 15
clicktext p "Nova chave"
sleep 1
clicktext p "Produção"
clicktext p "Criar chave"
sleep 1
LIVEKEY=$(read_dialog_key p)
[[ "$LIVEKEY" == lc_live_* ]] && ok "chave live emitida" || bad "criar chave live" "$(mask_key "$LIVEKEY")"
clicktext p "Já copiei"
BODY=$(curl -s "$BASE/v1/schools" -H "x-listacerta-key: $LIVEKEY")
echo "$BODY" | grep -q "\"$REAL_INEP\"" && echo "$BODY" | grep -qv "\"$DEMO_INEP\"" && ok "chave live só lista a escola real" || bad "escopo live" "$BODY"
ITEMS=$(curl -s "$BASE/v1/lists/$REAL_LIST/items" -H "x-listacerta-key: $LIVEKEY")
echo "$ITEMS" | grep -q "Caderno universitario" && ok "GET /v1/lists/{id}/items devolve os itens reais" || bad "itens da lista" "$ITEMS"
MATCH=$(curl -s -X POST "$BASE/v1/carts/match" -H "x-listacerta-key: $LIVEKEY" -H "content-type: application/json" \
  -d "{\"list_id\":\"$REAL_LIST\",\"skus\":[{\"sku\":\"SKU-CAD\",\"name\":\"Caderno Universitario 96 folhas\"},{\"sku\":\"SKU-XYZ\",\"name\":\"Produto sem relacao nenhuma\"}]}")
echo "$MATCH" | grep -q '"sku":"SKU-CAD"' && ok "carts/match casa o SKU relacionado" || bad "carts/match casado" "$MATCH"
echo "$MATCH" | grep -q "SKU-XYZ" && bad "carts/match não deveria ecoar SKU sem casamento" "ecoou" || ok "carts/match não ecoa SKU sem casamento"
for needle in email phone telefone cpf profile_id created_by; do
  echo "$BODY$ITEMS$MATCH" | grep -qi "$needle" && bad "vazamento" "achou '$needle'" || true
done
ok "corpos conferidos sem e-mail/telefone/ids internos (varredura simples)"

echo "== h) limite por minuto: estoura em 429 com Retry-After"
CODES=""
for _ in $(seq 1 6); do CODES="$CODES $(curl -s -o /dev/null -w '%{http_code}' "$BASE/v1/schools" -H "x-listacerta-key: $LIVEKEY")"; done
echo "$CODES" | grep -q 429 && ok "limite por minuto estourado: 429 apareceu (limite=3/min)" || bad "rate limit" "$CODES"
RETRY=$(curl -s -D - -o /dev/null "$BASE/v1/schools" -H "x-listacerta-key: $LIVEKEY" | grep -i "^retry-after:")
[ -n "$RETRY" ] && ok "429 vem com Retry-After ($RETRY)" || bad "Retry-After" "ausente"

echo "== i) rotação sem downtime; revogação da antiga"
ab p open "$BASE/b2b/api" >/dev/null; wait_text p "Produção" 15
clicktext p "Rotacionar"
sleep 1
clicktext p "Confirmar rotação"
sleep 1
NEWLIVEKEY=$(read_dialog_key p)
[[ "$NEWLIVEKEY" == lc_live_* && "$NEWLIVEKEY" != "$LIVEKEY" ]] && ok "rotação emitiu chave nova" || bad "rotação" "$(mask_key "$NEWLIVEKEY")"
clicktext p "Já copiei"
sleep 65 # janela do minuto vira; evita 429 residual nas checagens de status abaixo
C_OLD=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/v1/schools" -H "x-listacerta-key: $LIVEKEY")
C_NEW=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/v1/schools" -H "x-listacerta-key: $NEWLIVEKEY")
expect_eq "$C_OLD" "200" "antiga ainda 200 durante a carência"
expect_eq "$C_NEW" "200" "nova 200"
ab p reload >/dev/null; wait_text p "Produção (anterior)" 10
expect_text p "Produção (anterior)" "B2B02 mostra a chave anterior com o rótulo do design"
# a linha "Produção (anterior)" é a chave ANTIGA (ordem do SQL: mais nova primeiro); clica o botão Revogar dentro
# dela, não o primeiro da página (que seria o da chave nova).
ab p eval "(() => { const row = [...document.querySelectorAll('tr')].find(r => r.textContent.includes('Produção (anterior)')); const btn = [...row.querySelectorAll('button')].find(b => b.textContent.trim() === 'Revogar'); btn?.click(); return btn ? 'ok' : 'sem-botao'; })()" >/dev/null
sleep 1
# só o <dialog open> (modal ativo) é o da linha certa; várias linhas têm um "Revogar agora" no DOM, só um aberto.
ab p eval "(() => { const btn = [...document.querySelectorAll('dialog[open] button')].find(b => b.textContent.trim() === 'Revogar agora'); btn?.click(); return btn ? 'ok' : 'sem-botao'; })()" >/dev/null
wait_text p "Revogada" 10
C_OLD_AFTER=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/v1/schools" -H "x-listacerta-key: $LIVEKEY")
expect_eq "$C_OLD_AFTER" "401" "revogada no portal: o curl seguinte com ela é 401"
shot p "$OUT/S24-b2b-api-chaves.png"

echo "== j) B2B01/B2B02 com dado real"
ab p open "$BASE/b2b" >/dev/null; wait_text p "chamadas de API no mês" 15
CALLS=$(sql "select coalesce(sum(request_count),0) from public.b2b_usage_daily where partner_id='$PARTNER_ID'")
[ "$CALLS" != "0" ] && ok "b2b_usage_daily tem chamadas reais ($CALLS)" || bad "uso real" "zero"
expect_no_text p "carrinhos atribuídos" "sem carrinhos atribuídos (fora desta fatia)"
expect_no_text p "Proporções ilustrativas" "sem a nota de proporções ilustrativas (dado real)"
shot p "$OUT/S24-b2b-visao.png"
ab p open "$BASE/b2b/api" >/dev/null; wait_text p "Uso de hoje" 15
shot p "$OUT/S24-b2b02-uso.png"

echo "== k) admin suspende: as duas chaves 401 na hora; portal somente leitura"
ab a open "$BASE/admin/parceiros/$PARTNER_ID" >/dev/null; wait_text a "Decisão" 15
ab a click "input[name=to][value=suspended]" >/dev/null
ab a fill 'textarea[name=reason]' "Suspensão de teste do roteiro E2E" >/dev/null
ab a click 'aside button[type=submit]' >/dev/null
sleep 1
# suspender revoga chave na hora: exige confirmação (revisão final do branch S24) antes de enviar de fato.
ab a eval "(() => { const b=[...document.querySelectorAll('dialog[open] button')].find(x=>x.textContent.trim()==='Suspender agora'); b?.click(); return b?'ok':'sem-botao'; })()" >/dev/null
wait_text a "Decisão registrada." 15
expect_text a "Suspensa" "parceiro suspenso"
shot a "$OUT/S24-admin-suspenso.png"
C1=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/v1/schools" -H "x-listacerta-key: $NEWLIVEKEY")
C2=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/v1/schools" -H "x-listacerta-key: $TESTKEY")
expect_eq "$C1" "401" "suspensão: chave live (nova) 401 na hora"
expect_eq "$C2" "401" "suspensão: chave test 401 na hora"
ab p open "$BASE/b2b/api" >/dev/null; wait_text p "Conta suspensa" 15
expect_text p "Conta suspensa" "portal mostra o aviso de somente leitura"
expect_no_text p "Nova chave" "sem 'Nova chave' com a conta suspensa"
shot p "$OUT/S24-b2b-suspenso.png"

echo "== l) cobertura do teste de vazamento entre parceiros (nota)"
echo "NOTA  membro de outro parceiro -> not_found: coberto por tests/db/b2b-repository.test.ts (Task 2), não repetido aqui: o portal do dono nunca aceita um id de outro parceiro em nenhum formulário (revoke/rotate usam o keyId da própria overview)."

echo
echo "== resumo =="
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
