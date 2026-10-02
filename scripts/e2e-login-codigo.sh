#!/usr/bin/env bash
# E2E da T2 (D-163, Go-Live Express): login por código de 6 dígitos + aviso de navegador embutido, com agent-browser.
# Cobre: user agent do WhatsApp mostra o aviso ("Abrir no navegador"/"Copiar link"); navegador comum não mostra;
# pedir link envia e-mail com botão E código ({{ .Token }}); código errado dá mensagem única (inclusive para e-mail
# inexistente, sem enumerar); código certo entra e redireciona a /conta.
# Pré-requisitos: Supabase local da trilha com os templates desta branch (supabase/templates/*.html), `.env.local`
# com `node scripts/supa.mjs env`, `pnpm build && PORT=<porta> pnpm start`. Variáveis: BASE e MAILPIT.
set -u
cd "$(dirname "$0")/.."
BASE=${BASE:-http://127.0.0.1:3003}
MAILPIT=${MAILPIT:-http://127.0.0.1:54624}
RUN=$(date +%s)
export AGENT_BROWSER_SESSION_PREFIX="t2login-$RUN"
source "$(dirname "$0")/e2e-lib.sh"

WHATSAPP_UA="Mozilla/5.0 (Linux; Android 13; SM-A546E Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/118.0.0.0 Mobile Safari/537.36 WhatsApp/2.23.20.0"
EMAIL="codigo-$RUN@listacerta.test"

for s in wa normal; do agent-browser close --session "${AGENT_BROWSER_SESSION_PREFIX}-$s" >/dev/null 2>&1; done

mail_count() { curl -s "$MAILPIT/api/v1/search?query=to:$1" | python3 -c "import sys,json;print(json.load(sys.stdin)['messages_count'])"; }
mail_text() {
  local id
  id=$(curl -s "$MAILPIT/api/v1/search?query=to:$1" | python3 -c "import sys,json;print(json.load(sys.stdin)['messages'][0]['ID'])")
  curl -s "$MAILPIT/api/v1/message/$id" | python3 -c "import sys,json;print(json.load(sys.stdin)['Text'])"
}

echo "== 1) navegador comum: sem aviso de navegador embutido"
ab normal open "$BASE/entrar" >/dev/null
wait_ok normal "Receber link por e-mail" "tela de login carrega"
absent_text normal "Você está dentro do" "sem aviso no navegador comum"

echo "== 2) user agent do WhatsApp: aviso com abrir no navegador / copiar link"
AGENT_BROWSER_USER_AGENT="$WHATSAPP_UA" ab wa open "$BASE/entrar" >/dev/null
wait_ok wa "Você está dentro do WhatsApp" "aviso de navegador embutido (WhatsApp)"
expect_text wa "Copiar link" "botão copiar link"
expect_text wa "Abrir no navegador" "botão abrir no navegador (Android)"

echo "== 3) pedir link/código (dentro do WhatsApp) e ler o e-mail"
before=$(mail_count "$EMAIL")
ab wa fill '#email' "$EMAIL" >/dev/null
ab wa press Enter >/dev/null
wait_ok wa "Verifique seu e-mail" "mensagem neutra após o envio"
wait_ok wa "Entrar com o código" "campo do código aparece na mesma tela"
for _ in $(seq 1 20); do [ "$(mail_count "$EMAIL")" -gt "$before" ] && break; sleep 1; done
TEXT=$(mail_text "$EMAIL")
CODE=$(grep -oE '\b[0-9]{6}\b' <<<"$TEXT" | head -1)
has "$TEXT" "http" "e-mail traz o link"
[[ "$CODE" =~ ^[0-9]{6}$ ]] && ok "e-mail traz código de 6 dígitos" || bad "e-mail traz código de 6 dígitos" "texto: ${TEXT:0:200}"

echo "== 4) código errado: mensagem única"
ab wa fill '#code' "000000" >/dev/null
ab wa press Enter >/dev/null
wait_ok wa "Código inválido ou expirado" "código errado recusado"
WRONG_KNOWN=$(ab wa get text body 2>/dev/null | grep -o "Código inválido ou expirado[^.]*\." | head -1)

echo "== 5) e-mail inexistente com código errado: mesma mensagem (não enumera)"
ab normal open "$BASE/entrar" >/dev/null
ab normal fill '#email' "ninguem-$RUN@listacerta.test" >/dev/null
ab normal press Enter >/dev/null
wait_ok normal "Entrar com o código" "campo do código (outro e-mail)"
ab normal fill '#code' "111111" >/dev/null
ab normal press Enter >/dev/null
wait_ok normal "Código inválido ou expirado" "mensagem igual para e-mail sem código válido"
WRONG_OTHER=$(ab normal get text body 2>/dev/null | grep -o "Código inválido ou expirado[^.]*\." | head -1)
eq "$WRONG_OTHER" "$WRONG_KNOWN" "mensagem idêntica nos dois casos"

echo "== 6) código certo entra"
ab wa fill '#code' "$CODE" >/dev/null
ab wa press Enter >/dev/null
for _ in $(seq 1 20); do ab wa get url 2>/dev/null | grep -q "/conta" && break; sleep 1; done
has "$(ab wa get url 2>/dev/null)" "/conta" "código certo redireciona a /conta"

echo ""
echo "== Resumo: $PASS passaram, $FAIL falharam =="
[ "$FAIL" -eq 0 ]
