#!/usr/bin/env bash
# E2E da S17 (LGPD e dados demonstrativos) com agent-browser contra o build de produção local da trilha 2.
# Pré-requisitos: `pnpm db:reset`; `.env.local` (só neste worktree, não versionado); `pnpm build && PORT=3002
# pnpm start`. Reaproveita o responsável real do seed padrão (parent@listacerta.test) para os cenários que NÃO
# destroem a conta (consentimentos, exportação, validação da exclusão); cria um e-mail novo e descartável só para
# o cenário de exclusão de conta de fato (nunca apaga o parent@listacerta.test compartilhado com outras fatias).
set -u
cd "$(dirname "$0")/.."
BASE=${BASE:-http://127.0.0.1:3002}
MAILPIT=${MAILPIT:-http://127.0.0.1:54524}
DB=${DB:-supabase_db_listacerta-t2}
OUT=docs/superpowers/e2e/screenshots
PASS=0; FAIL=0
RUN=$(date +%s)
export AGENT_BROWSER_SESSION_PREFIX=t2s17
for s in p n; do AGENT_BROWSER_SESSION="t2s17-$RUN-$s" agent-browser close >/dev/null 2>&1; done
ab() { local s=$1; shift; AGENT_BROWSER_SESSION="t2s17-$RUN-$s" agent-browser "$@"; }
sql() { docker exec "$DB" psql -U postgres -Atq -c "$1"; }
ok() { PASS=$((PASS+1)); echo "PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL  $1  ($2)"; }
expect_text() { local t; t=$(ab "$1" get text body 2>/dev/null); if grep -qiF -- "$2" <<<"$t"; then ok "$3"; else bad "$3" "esperava '$2'; veio: ${t:0:200}"; fi; }
expect_no_text() { local t; t=$(ab "$1" get text body 2>/dev/null); if grep -qiF -- "$2" <<<"$t"; then bad "$3" "não deveria conter '$2'"; else ok "$3"; fi; }
shot() { sleep 1; ab "$1" screenshot "$2" >/dev/null; }
login() { # sessão, e-mail, next (já com %2F etc.)
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
set_confirmation() { # sessão, texto
  ab "$1" eval "(() => { function sn(el,p,v){Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),p).set.call(el,v);} const n=document.querySelector('#confirmation'); sn(n,'value','$2'); n.dispatchEvent(new Event('input',{bubbles:true})); return 'ok'; })()" >/dev/null
}
submit_form() { ab "$1" eval "document.querySelector('form').requestSubmit(); 'ok'" >/dev/null; }
fetch_export() { ab "$1" eval "fetch('/api/conta/exportar').then((r) => r.text())"; }

echo "== 1) parent@listacerta.test: login e /conta mostra o link de privacidade"
login p parent@listacerta.test "%2Fconta"
sleep 2
shot p "$OUT/S17-01-conta.png"
expect_text p "Privacidade e dados" "1a: /conta mostra o link para a página de privacidade"

echo "== 2) /conta/privacidade: consentimento (fixture SQL), exportação, exclusão com confirmação errada"
ab p open "$BASE/conta/privacidade" >/dev/null
sleep 1
shot p "$OUT/S17-02-privacidade.png"
expect_text p "Seus consentimentos" "2a: seção de consentimentos presente"
expect_text p "Envio de lista escolar" "2b: consentimento fixture (list_upload) listado"
expect_text p "Excluir sua conta" "2c: seção de exclusão presente"
expect_text p "Exportar seus dados" "2d: seção de exportação presente"

echo "== 2e) revogar o consentimento fixture"
ab p find text "Revogar" click >/dev/null
sleep 2
expect_text p "Revogado em" "2e: consentimento aparece revogado após o clique"
REVOKED=$(sql "select count(*) from public.consents where profile_id = '00000000-0000-4000-8000-0000000000a2' and purpose = 'list_upload' and revoked_at is not null;")
[ "$REVOKED" = "1" ] && ok "2f: revoked_at gravado no banco" || bad "2f: revoked_at gravado no banco" "contagem=$REVOKED"

echo "== 2f-bis) consentimento contratual (billing_terms) nunca mostra Revogar"
sql "insert into public.consents (profile_id, purpose, text_version) values ('00000000-0000-4000-8000-0000000000a2', 'billing_terms', 'e2e-s17') on conflict do nothing;" >/dev/null
ab p open "$BASE/conta/privacidade" >/dev/null
sleep 1
expect_text p "Termos de cobrança" "2f-1: consentimento contratual listado"
expect_text p "Aceite contratual: para revogar, encerre o contrato correspondente." "2f-2: sem botão Revogar para finalidade contratual"

echo "== 2g) exportação: JSON só com os próprios dados"
EXPORT_JSON=$(fetch_export p)
if grep -q 'perfil' <<<"$EXPORT_JSON" && grep -q '00000000-0000-4000-8000-0000000000a2' <<<"$EXPORT_JSON"; then
  ok "2g: exportação contém o próprio perfil"
else
  bad "2g: exportação contém o próprio perfil" "${EXPORT_JSON:0:200}"
fi
if grep -q '0000000000a3' <<<"$EXPORT_JSON"; then
  bad "2h: exportação não vaza dado de outro perfil" "encontrou id de outro perfil"
else
  ok "2h: exportação não vaza dado de outro perfil"
fi

echo "== 2i) exclusão de conta: confirmação errada não apaga nada"
ab p open "$BASE/conta/privacidade" >/dev/null
sleep 1
set_confirmation p "sim"
submit_form p
sleep 2
shot p "$OUT/S17-03-confirmacao-errada.png"
expect_text p 'Digite' "2i: confirmação errada mostra a mensagem de erro"
STILL_HERE=$(sql "select count(*) from public.profiles where id = '00000000-0000-4000-8000-0000000000a2';")
[ "$STILL_HERE" = "1" ] && ok "2j: parent@listacerta.test não foi excluído" || bad "2j: parent@listacerta.test não foi excluído" "count=$STILL_HERE"

echo "== 3) /privacidade (pública): placeholders certos, sem afirmar conformidade"
ab p open "$BASE/privacidade" >/dev/null
sleep 1
shot p "$OUT/S17-04-privacidade-publica.png"
expect_text p "Versão preliminar" "3a: aviso de versão preliminar presente"
expect_text p "[a definir: razão social]" "3b: razão social ainda placeholder (humano/jurídico)"
expect_text p "excluir sua conta" "3c: texto novo do prazo de retenção menciona a exclusão de conta"
expect_no_text p "[a definir: prazo de retenção]" "3d: prazo de retenção já preenchido pela S17 (não é mais placeholder)"

echo "== 4) exclusão de conta de verdade, com e-mail novo e descartável"
NEWMAIL="s17-e2e-$RUN@teste.invalid"
login n "$NEWMAIL" "%2Fconta%2Fprivacidade"
sleep 2
shot n "$OUT/S17-05-conta-nova.png"
NEWID=$(sql "select id::text from auth.users where email = '$NEWMAIL';")
if [ -n "$NEWID" ]; then ok "4a: conta nova criada pelo link mágico"; else bad "4a: conta nova criada pelo link mágico" "sem id"; fi
ab n open "$BASE/conta/privacidade" >/dev/null
sleep 1

echo "== 4a-bis) sessão velha (login há mais de 15 min): recusa excluir, mesmo com confirmação certa"
sql "update auth.users set last_sign_in_at = now() - interval '20 minutes' where id = '$NEWID';" >/dev/null
set_confirmation n "excluir"
submit_form n
sleep 2
shot n "$OUT/S17-05b-sessao-velha.png"
expect_text n "sessão precisa ser recente" "4a-bis: sessão velha recusa a exclusão"
STILL_NEW=$(sql "select count(*) from auth.users where id = '$NEWID';")
[ "$STILL_NEW" = "1" ] && ok "4a-ter: conta nova não foi excluída com sessão velha" || bad "4a-ter: conta nova não foi excluída com sessão velha" "count=$STILL_NEW"
sql "update auth.users set last_sign_in_at = now() where id = '$NEWID';" >/dev/null

set_confirmation n "excluir"
submit_form n
sleep 3
shot n "$OUT/S17-06-pos-exclusao.png"
expect_text n "Entrar" "4b: depois de excluir, sai da sessão e volta para /entrar"
GONE=$(sql "select count(*) from auth.users where email = '$NEWMAIL';")
[ "$GONE" = "0" ] && ok "4c: auth.users e profiles apagados de verdade" || bad "4c: auth.users e profiles apagados de verdade" "count=$GONE"

echo
echo "== Resultado: $PASS PASS, $FAIL FAIL =="
for s in p n; do AGENT_BROWSER_SESSION="t2s17-$RUN-$s" agent-browser close >/dev/null 2>&1; done
[ "$FAIL" -eq 0 ]
