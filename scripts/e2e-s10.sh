#!/usr/bin/env bash
# E2E da S10 (revisão humana do admin + revisão da própria lista do pai) com agent-browser, build de produção local da trilha 2.
# NUNCA chama o OpenRouter: provedor FALSO (FAKE_AI_SCRIPT) e portas de publicação EM MEMÓRIA (FAKE_PUBLICATION_FIXTURE),
# ambos só com APP_ENV=local. Pré-requisitos: `pnpm db:start && pnpm db:reset`; `node scripts/supa.mjs env > .env.local`
# (só neste worktree, ignorado pelo git); `pnpm build`. O script sobe/derruba só o app (porta 3002) só pelo PID gravado; o worker
# não é necessário (as decisões da S09 saem inline). Ver docs/superpowers/e2e/S10.md.
set -u
cd "$(dirname "$0")/.."
# Trava de custo: chave/modelos reais no shell poderiam gastar dinheiro de verdade. Aborta e nunca os repassa.
for v in OPENROUTER_KEY AI_MODEL_CHEAP AI_MODEL_STRONG AI_MODEL_VISION; do
  if [ -n "${!v:-}" ]; then echo "ABORTADO: $v está definida no shell; rode com um shell limpo (E2E só usa provedor falso)." >&2; exit 2; fi
done
NOAI="env -u OPENROUTER_KEY -u AI_MODEL_CHEAP -u AI_MODEL_STRONG -u AI_MODEL_VISION"
BASE=${BASE:-http://127.0.0.1:3002}
MAILPIT=${MAILPIT:-http://127.0.0.1:54524}
DB=${DB:-supabase_db_listacerta-t2}
OUT=docs/superpowers/e2e/screenshots
TMP=$(mktemp -d)
PASS=0; FAIL=0
export AGENT_BROWSER_SESSION_PREFIX=t2s10
ab() { local s=$1; shift; AGENT_BROWSER_SESSION="t2s10-$s" agent-browser "$@"; }
sql() { docker exec "$DB" psql -U postgres -At -c "$1"; }
ok() { PASS=$((PASS+1)); echo "PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL  $1  ($2)"; }
eq() { if [[ "$1" == "$2" ]]; then ok "$3"; else bad "$3" "esperava '$2'; veio '$1'"; fi; }
has() { if grep -qF -- "$2" <<<"$1"; then ok "$3"; else bad "$3" "esperava conter '$2'; veio: ${1:0:200}"; fi; }
lacks() { if grep -qF -- "$2" <<<"$1"; then bad "$3" "não devia conter '$2'"; else ok "$3"; fi; }
expect_text() { local t; t=$(ab "$1" get text body 2>/dev/null); has "$t" "$2" "$3"; }
absent_text() { local t; t=$(ab "$1" get text body 2>/dev/null); lacks "$t" "$2" "$3"; }
wait_text() { for _ in $(seq 1 "$3"); do ab "$1" get text body 2>/dev/null | grep -qF -- "$2" && return 0; sleep 1; done; return 1; }
wait_ok() { wait_text "$1" "$2" "${4:-30}" && ok "$3" || bad "$3" "esperava '$2'; veio: $(ab "$1" get text body 2>/dev/null | head -c 220)"; }
last_id() { sql "select id from public.list_submissions order by created_at desc limit 1"; }
chain() { sql "select coalesce(string_agg(kind||':'||decision, ' > ' order by created_at, case decision when 'accepted' then 0 when 'auto_publish' then 1 when 'human_review' then 1 when 'published' then 2 else 3 end),'') from public.ai_decisions where entity_id='$1'"; }
status_of() { sql "select status from public.list_submissions where id='$1'"; }
# clique/estado de botão ou link pelo texto exato (o agent-browser não tem seletor por texto estável)
btn() { ab "$1" eval "(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>x.textContent.trim()==='$2');if(!b)return 'nobtn';b.click();return 'ok'})()" | grep -q ok; }
btn_state() { ab "$1" eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='$2');return b?(b.disabled?'disabled':'enabled'):'none'})()" | tr -d '"'; }
names() { ab "$1" eval "[...document.querySelectorAll('input[aria-label^=\"Nome do item\"]')].map(i=>i.value).join('|')" | sed 's/^"//;s/"$//'; }
cookie_of() { ab "$1" eval "document.cookie" | sed 's/^"//;s/"$//'; }
http_of() { curl -s -o /dev/null -m 20 -w '%{http_code}' ${2:+-H "Cookie: $2"} "$BASE$1"; }

# --- ids sintéticos (nenhum dado de escola real) ---
U_SCHOOL=00000000-0000-4000-8000-0000000000a3
U_ADMIN2=00000000-0000-4000-8000-0000000000a4
S_OK=aaaaaaaa-0000-4000-8000-000000000001
FIXTURE=$(python3 - <<PYEOF
import json
print(json.dumps({"schools": [{"id": "$S_OK", "verification": "verified", "municipalityEnabled": True, "linkedProfiles": ["$U_SCHOOL"], "label": {"name": "Escola Sintética (exemplo)", "inep": "51000001"}}],
  "grades": {"4º ano": "ef-4"}, "validSchoolYears": [2026, 2027, 2028]}, ensure_ascii=False))
PYEOF
)
item() { echo "{\"name\":\"$1\",\"quantity\":$2,\"unit\":\"un\",\"category\":\"$3\",\"confidence\":$4}"; }
HAND_JSON="{\"items\":[$(item "Caderno brochura (exemplo)" 2 papelaria 0.95),$(item "Lápis preto (exemplo)" null escrita 0.9),$(item "Borracha branca (exemplo)" 2 escrita 0.9)],\"overallConfidence\":0.92,\"handwritten\":true}"
HAND="{\"cheap\":[{\"json\":$HAND_JSON}],\"strong\":[{\"json\":$HAND_JSON}],\"vision\":[{\"json\":$HAND_JSON}]}"

start_app() { # fixture ("" = sem porta de publicação)
  stop_app
  if [ -n "$1" ]; then $NOAI APP_ENV=local FAKE_AI_SCRIPT="$HAND" FAKE_PUBLICATION_FIXTURE="$1" ./node_modules/.bin/next start -p 3002 >/tmp/s10-app.log 2>&1 &
  else $NOAI APP_ENV=local FAKE_AI_SCRIPT="$HAND" ./node_modules/.bin/next start -p 3002 >/tmp/s10-app.log 2>&1 &
  fi
  echo $! >/tmp/s10-app.pid
  for _ in $(seq 1 30); do curl -s -o /dev/null "$BASE/" && return 0; sleep 1; done
}
stop_app() { if [ -f /tmp/s10-app.pid ]; then kill "$(cat /tmp/s10-app.pid)" 2>/dev/null; rm -f /tmp/s10-app.pid; fi; sleep 1; }
cleanup() { stop_app; for s in s p a b o; do ab $s close >/dev/null 2>&1; done; rm -rf "$TMP"; }
trap cleanup EXIT

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
printf '%%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%%%EOF\n' > "$TMP/lista.pdf"
submit() { # sessão, série, schoolId ("" = sem)
  local s=$1 grade=$2 school=$3
  ab "$s" open "$BASE/enviar-lista" >/dev/null
  wait_text "$s" "Enviar para revisão" 20; sleep 1
  for _ in 1 2 3 4 5 6; do ab "$s" upload '#file' "$TMP/lista.pdf" >/dev/null; ab "$s" get text '[data-testid=picked]' 2>/dev/null | grep -q . && break; sleep 1; done
  ab "$s" select '#grade' "$grade" >/dev/null
  ab "$s" check 'input[name=consent]' >/dev/null
  if [ -n "$school" ]; then
    ab "$s" eval "(()=>{const i=document.createElement('input');i.type='hidden';i.name='schoolId';i.value='$school';document.querySelector('form').appendChild(i);return 'ok'})()" >/dev/null
  fi
  ab "$s" click 'button[type=submit]' >/dev/null
}
fake_routes() { sql "update public.ai_settings set routes = jsonb_build_object('cheap',jsonb_build_object('provider','fake','timeout_ms',20000),'strong',jsonb_build_object('provider','fake','timeout_ms',20000),'vision',jsonb_build_object('provider','fake','timeout_ms',20000))" >/dev/null; }
mkuser() { # id, e-mail, papel
  sql "insert into auth.users (instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current,phone_change,phone_change_token,reauthentication_token,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000','$1','authenticated','authenticated','$2',now(),'{\"provider\":\"email\",\"providers\":[\"email\"]}','{}','','','','','','','','',now(),now()) on conflict (id) do nothing; insert into auth.identities (id,user_id,provider,provider_id,identity_data,last_sign_in_at,created_at,updated_at) select gen_random_uuid(),'$1','email','$1',jsonb_build_object('sub','$1','email','$2','email_verified',true,'phone_verified',false),now(),now(),now() where not exists (select 1 from auth.identities where user_id='$1'); update public.profiles set role='$3', display_name='Sintético ($3)' where id='$1'" >/dev/null
}

echo "== preparo: usuários sintéticos (escola, 2º admin), rotas falsas por dado, interruptor ligado por SQL só para este cenário"
mkuser "$U_SCHOOL" escola@listacerta.test school_member
mkuser "$U_ADMIN2" admin2@listacerta.test admin
fake_routes
sql "update public.ai_settings set auto_publish_enabled = true" >/dev/null
for s in s p a b o; do ab $s close >/dev/null 2>&1; done
eq "$(sql "select count(*) from public.review_versions")" "0" "preparo: nenhuma versão de revisão antes do cenário"

echo "== fase 1: app com script manuscrito (alerta crítico no seed) + fixture; 5 envios da escola e 1 do pai"
start_app "$FIXTURE"
for s in s p a b o; do ab $s set viewport 390 844 >/dev/null; done
login s escola@listacerta.test %2Fenviar-lista
login p parent@listacerta.test %2Fenviar-lista
login o outro@listacerta.test %2Fenviar-lista
login a admin@listacerta.test %2Fadmin%2Frevisao
login b admin2@listacerta.test %2Fadmin%2Frevisao
ab a set viewport 1440 900 >/dev/null; ab b set viewport 1440 900 >/dev/null
IDS=()
for n in A B C F E; do
  submit s "4º ano" "$S_OK"; wait_text s "Em revisão pela equipe" 40 || true
  IDS+=("$(last_id)")
done
A=${IDS[0]}; B=${IDS[1]}; C=${IDS[2]}; F=${IDS[3]}; E=${IDS[4]}
submit p "4º ano" ""; wait_text p "Em revisão pela equipe" 40 || true
P=$(last_id)
for id in "$A" "$B" "$C" "$F" "$E"; do :; done
eq "$(sql "select count(*) from public.list_submissions where status='human_review'")" "6" "preparo: 6 envios em human_review (S09: alerta crítico e pai)"
eq "$(sql "select reasons @> '[\"critical_alert\"]' from public.ai_decisions where entity_id='$A' and kind='publication' and decision='human_review'")" "t" "preparo: veredito da S09 tem critical_alert (escola)"
eq "$(sql "select reasons @> '[\"parent_submission\"]' from public.ai_decisions where entity_id='$P' and kind='publication' and decision='human_review'")" "t" "preparo: veredito do pai tem parent_submission"
sql "update public.ocr_jobs set result='{\"items\":[{\"name\":\"\"}]}' where submission_id='$F'" >/dev/null   # resultado inválido só para o cenário (d)
ADMIN_ID=$(sql "select id from auth.users where email='admin@listacerta.test'")

echo "== (a) aceite do PLAN: alerta crítico vai para revisão; admin corrige e publica"
ab a open "$BASE/admin/revisao" >/dev/null
wait_ok a "Alerta crítico no documento" "a: fila em Pendentes mostra a frase 'Alerta crítico no documento'"
QT=$(ab a get text body)
expect_text a "Pendentes (6)" "a: aba Pendentes (6)"
expect_text a "Escola Sintética (exemplo)" "a: escola pelo rótulo da fixture"
for who in "escola@listacerta.test" "parent@listacerta.test" "outro@listacerta.test" "Sintético (school_member)" "arquivo" "lista.pdf"; do lacks "$QT" "$who" "a: fila sem dado do remetente ('$who')"; done
ab a screenshot "$OUT/S10-fila.png" >/dev/null
ab a open "$BASE/admin/revisao/$A" >/dev/null
wait_ok a "Revise o que a IA leu" "a: detalhe abre com a revisão"
eq "$(ab a get attr 'iframe[title^="Documento"]' src | tr -d '"')" "/admin/revisao/documento/$A" "a: iframe aponta para a ROTA do documento"
HTML=$(ab a get html body)
lacks "$HTML" "token=" "a: HTML sem URL assinada (token)"
lacks "$HTML" "/object/sign" "a: HTML sem URL do Storage"
lacks "$HTML" "storage_path" "a: HTML sem storage_path"
ACOOK=$(cookie_of a)
DOC=$(curl -s -o /dev/null -m 20 -D "$TMP/doc.h" -w '%{http_code}' -H "Cookie: $ACOOK" "$BASE/admin/revisao/documento/$A")
eq "$DOC" "307" "a: rota do documento responde 307 (sem seguir)"
has "$(tr -d '\r' <"$TMP/doc.h" | grep -i '^location:')" "/object/sign/list-uploads/" "a: 307 para URL assinada do bucket privado"
has "$(grep -i '^cache-control:' "$TMP/doc.h")" "no-store" "a: Cache-Control no-store"
eq "$(curl -s -o /dev/null -m 20 -w '%{http_code} %{redirect_url}' "$BASE/admin/revisao/documento/$A" | sed "s|$BASE||")" "307 /entrar?next=%2Fadmin%2Frevisao%2Fdocumento%2F$A" "a: sem sessão, a rota do documento manda ao login (nunca à URL assinada)"
eq "$(btn_state a "Aprovar e publicar")" "disabled" "a: 'Aprovar e publicar' desabilitado com pendências"
expect_text a "Há item sem quantidade" "a: bloqueio em frase (item sem quantidade)"
expect_text a "Conferi o documento original" "a: confirmação do alerta crítico exigida"
ab a fill 'input[aria-label="Quantidade do item 2"]' 12 >/dev/null
ab a fill 'input[aria-label="Nome do item 1"]' "Caderno brochura 96 folhas (exemplo)" >/dev/null
expect_text a "Edição não salva" "a: edição não salva marcada"
eq "$(btn_state a "Aprovar e publicar")" "disabled" "a: aprovar bloqueado com edição não salva"
btn a "Salvar edição"
wait_ok a "Edição salva (versão 2)." "a: salvar cria a versão 2"
wait_text a "Versão 2" 20   # SEM recarregar a página: a base do editor avança para a versão salva
lacks "$(ab a get text body 2>/dev/null)" "Edição não salva" "a: depois de salvar, sem recarregar, o editor não fica 'Edição não salva'"
eq "$(btn_state a "Aprovar e publicar")" "disabled" "a: sem a confirmação do documento original, aprovar segue desabilitado"
ab a check 'input[name=acknowledged]' >/dev/null
eq "$(btn_state a "Aprovar e publicar")" "enabled" "a: com a confirmação, 'Aprovar e publicar' habilita"
ab a screenshot "$OUT/S10-detalhe.png" >/dev/null
btn a "Aprovar e publicar"
wait_ok a "Lista publicada." "a: 'Lista publicada.' (porta em memória)" 40
expect_text a "Demonstração" "a: selo 'Demonstração' na publicação pela porta em memória"
ab a screenshot "$OUT/S10-publicada.png" >/dev/null
eq "$(chain "$A")" "extraction:accepted > publication:human_review > review:edited > review:approved > review:published" "a: ai_decisions: extraction > human_review > edited > approved > published"
eq "$(sql "select count(*) from public.ai_decisions where entity_id='$A' and kind='review' and actor_id='$ADMIN_ID'")" "3" "a: as 3 linhas review têm actor_id do admin"
eq "$(sql "select count(*) from public.ai_decisions where entity_id='$A' and kind='review' and actor_id is distinct from '$ADMIN_ID'")" "0" "a: nenhuma linha review com outro ator"
eq "$(sql "select string_agg(version||':'||origin, ',' order by version) from public.review_versions where submission_id='$A'")" "1:extraction,2:admin_edit" "a: review_versions v1 (extração) e v2 (edição do admin)"
eq "$(sql "select (d.previous_version_id=(select id from public.review_versions where submission_id='$A' and version=1))::text||'/'||(d.new_version_id=(select id from public.review_versions where submission_id='$A' and version=2))::text from public.ai_decisions d where d.entity_id='$A' and d.kind='review' and d.decision='edited'")" "true/true" "a: review:edited com previous = v1 e new = v2"
eq "$(sql "select (d.new_version_id=(select id from public.review_versions where submission_id='$A' and version=2))::text from public.ai_decisions d where d.entity_id='$A' and d.kind='review' and d.decision='approved'")" "true" "a: review:approved aponta a v2"
eq "$(sql "select reasons::text from public.ai_decisions where entity_id='$A' and kind='review' and decision='approved'")" '["critical_alerts_acknowledged"]' "a: aprovação registra critical_alerts_acknowledged"
eq "$(sql "select (new_version_id is not null and previous_version_id is null)::text from public.ai_decisions where entity_id='$A' and kind='review' and decision='published'")" "true" "a: review:published traz a versão da porta (1ª publicação da lista em memória)"
eq "$(sql "select (v1.items->1->'quantity')::text||'/'||(v2.items->1->>'quantity') from public.review_versions v1, public.review_versions v2 where v1.submission_id='$A' and v1.version=1 and v2.submission_id='$A' and v2.version=2")" "null/12" "a: v1 preservada (quantidade nula) e v2 com a correção"
eq "$(status_of "$A")" "published" "a: envio published"
eq "$(sql "select count(*) from public.ai_decisions where to_jsonb(ai_decisions)::text ~* '(caderno|lápis|lapis|borracha)'")" "0" "a: nenhuma ai_decisions com texto do documento"
ab s open "$BASE/enviar-lista/$A" >/dev/null
wait_ok s "Lista publicada" "a: a escola vê 'Lista publicada' (D-071: neutro para publicação humana)"
absent_text s "Publicada automaticamente" "a: sem 'Publicada automaticamente' quando foi a equipe que publicou"

echo "== (b) stale entre dois admins (dois contextos de navegador)"
ab a open "$BASE/admin/revisao/$B" >/dev/null; wait_text a "Versão 1" 20
ab b open "$BASE/admin/revisao/$B" >/dev/null; wait_text b "Versão 1" 20
ab a fill 'input[aria-label="Nome do item 1"]' "Nome do admin 1 (exemplo)" >/dev/null
btn a "Salvar edição"; wait_ok a "Edição salva (versão 2)." "b: admin 1 salva a versão 2"
ab b fill 'input[aria-label="Nome do item 1"]' "Nome do admin 2 (exemplo)" >/dev/null
btn b "Salvar edição"
wait_ok b "alterada por outra pessoa" "b: o 2º admin recebe o aviso de stale"
eq "$(names b | cut -d'|' -f1)" "Nome do admin 2 (exemplo)" "b: o rascunho do 2º admin NÃO foi apagado pelo stale"
ab b screenshot "$OUT/S10-stale.png" >/dev/null
eq "$(sql "select string_agg(version::text, ',' order by version) from public.review_versions where submission_id='$B'")" "1,2" "b: nenhuma versão perdida nem duplicada (v1, v2)"
eq "$(sql "select actor_id from public.review_versions where submission_id='$B' and version=2")" "$ADMIN_ID" "b: a v2 é do admin 1"
btn b "Recarregar a versão mais recente"
for _ in $(seq 1 15); do [ "$(names b | cut -d'|' -f1)" = "Nome do admin 1 (exemplo)" ] && break; sleep 1; done
eq "$(names b | cut -d'|' -f1)" "Nome do admin 1 (exemplo)" "b: só depois de 'Recarregar' o editor mostra a versão do outro admin"

echo "== (c) recusa por motivo de lista fechada; nome hostil vira texto"
HOST='<img src=x onerror=alert(1)>'
ab a open "$BASE/admin/revisao/$C" >/dev/null; wait_text a "Versão 1" 20
ab a fill 'input[aria-label="Nome do item 1"]' "$HOST" >/dev/null
btn a "Salvar edição"; wait_ok a "Edição salva (versão 2)." "c: salva nome hostil"
ab a open "$BASE/admin/revisao/$C" >/dev/null; wait_text a "Versão 2" 20
eq "$(names a | cut -d'|' -f1)" "$HOST" "c: o nome hostil volta como TEXTO no campo"
eq "$(ab a eval "document.querySelectorAll('tbody img, tbody script').length" | tr -d '"')" "0" "c: nenhum nó img/script na tabela de itens"
eq "$(btn_state a "Recusar")" "disabled" "c: 'Recusar' desabilitado sem motivo"
ab a select 'select[name=reason]' illegible_document >/dev/null
btn a "Recusar"
wait_ok a "Lista recusada." "c: recusa com motivo da lista fechada"
eq "$(sql "select reasons::text||'|'||justification from public.ai_decisions where entity_id='$C' and kind='review' and decision='rejected'")" '["illegible_document"]|illegible_document' "c: review:rejected com o código do motivo"
eq "$(status_of "$C")" "rejected" "c: envio rejected"
ab a open "$BASE/admin/revisao?aba=recusadas" >/dev/null
wait_ok a "Recusadas (1)" "c: aba Recusadas com 1"
ab s open "$BASE/enviar-lista/$C" >/dev/null
wait_ok s "A equipe não publicou esta lista como oficial." "c: a escola vê o aviso de recusa (sem código de motivo)"
absent_text s "illegible_document" "c: nenhum código de motivo na tela da escola"
absent_text s "sua cópia" "c: envio de escola não fala em cópia"

echo "== (d) resultado inválido: versão 1 vazia -> recusa"
ab a open "$BASE/admin/revisao/$F" >/dev/null
wait_ok a "Não foi possível ler os itens desta lista: recuse ou digite os itens." "d: explica a versão 1 vazia"
expect_text a "A lista precisa ter ao menos um item." "d: aprovação bloqueada por lista sem itens"
eq "$(sql "select items::text from public.review_versions where submission_id='$F' and version=1")" "[]" "d: versão 1 nasceu vazia"
ab a select 'select[name=reason]' illegible_document >/dev/null
btn a "Recusar"; wait_ok a "Lista recusada." "d: recusa do envio ilegível"

echo "== (f) fluxo do pai: edita a PRÓPRIA cópia; a cópia nunca chega à revisão"
ab p open "$BASE/enviar-lista/$P" >/dev/null
wait_ok p "Revisar meus itens" "f: o pai vê 'Revisar meus itens' no andamento"
expect_text p "Em revisão pela equipe" "f: estado 'Em revisão pela equipe'"
ab p open "$BASE/enviar-lista/$P/revisar" >/dev/null
wait_ok p "Não escreva o nome da criança nos itens." "f: tela da cópia com o aviso de menor"
expect_text p "Estas mudanças valem só para você" "f: aviso de que a mudança vale só para o pai"
eq "$(names p)" "Caderno brochura (exemplo)|Lápis preto (exemplo)|Borracha branca (exemplo)" "f: cópia abre com os itens da extração"
eq "$(btn_state p "Salvar minha lista")" "enabled" "f: 'Salvar minha lista' (e não 'Enviar para revisão')"
eq "$(btn_state p "Enviar para revisão")" "none" "f: não existe 'Enviar para revisão' na tela do pai"
COPY=$(sql "select id from public.parent_list_copies where submission_id='$P'")
[[ -n "$COPY" ]] && ok "f: cópia criada para o dono" || bad "f: cópia" "vazia"
ab p fill 'input[aria-label="Quantidade do item 2"]' 5 >/dev/null
ab p fill 'input[aria-label="Nome do item 1"]' "Meu caderno editado (exemplo)" >/dev/null
ab p screenshot "$OUT/S10-pai-revisar.png" >/dev/null
btn p "Salvar minha lista"
wait_ok p "Lista salva." "f: salvar a cópia"
LINK=$(ab p eval "[...document.querySelectorAll('a')].find(a=>a.textContent.trim()==='Montar carrinho com esta lista')?.getAttribute('href')||'none'" | tr -d '"')
eq "$LINK" "/carrinho/novo?lista=$COPY" "f: 'Montar carrinho' aponta para /carrinho/novo?lista=<copyId>"
eq "$(sql "select (items->0->>'name')||'|'||(items->1->>'quantity')||'|'||version from public.parent_list_copies where id='$COPY'")" "Meu caderno editado (exemplo)|5|2" "f: SQL: cópia com os itens editados e versão 2"
ab p fill 'input[aria-label="Nome do item 2"]' "$HOST" >/dev/null
btn p "Salvar minha lista"
for _ in $(seq 1 20); do [ "$(sql "select version from public.parent_list_copies where id='$COPY'")" = "3" ] && break; sleep 1; done
ab p open "$BASE/enviar-lista/$P/revisar" >/dev/null; wait_text p "Salvar minha lista" 20
eq "$(names p | cut -d'|' -f2)" "$HOST" "f: nome hostil da cópia volta como TEXTO"
eq "$(ab p eval "document.querySelectorAll('li img, li script').length" | tr -d '"')" "0" "f: nenhum nó img/script nas linhas da cópia"
eq "$(sql "select count(*) from public.review_versions where submission_id='$P'")" "0" "f: a cópia não criou versão de revisão"
eq "$(sql "select count(*) from public.ai_decisions where entity_id='$P' and kind='review'")" "0" "f: a cópia não gerou ai_decisions de revisão"
eq "$(status_of "$P")" "human_review" "f: envio do pai continua em human_review"
ab p open "$BASE/carrinho/novo?lista=$COPY" >/dev/null
CART=$(ab p get text body); if grep -qE "Lista não encontrada|Listas indisponíveis" <<<"$CART"; then ok "f: carrinho mostra o estado honesto até a S11"; else bad "f: carrinho" "${CART:0:200}"; fi
ab a open "$BASE/admin/revisao/$P" >/dev/null
wait_text a "Versão 1" 20
eq "$(names a)" "Caderno brochura (exemplo)|Lápis preto (exemplo)|Borracha branca (exemplo)" "f: o admin vê os itens da EXTRAÇÃO, não os do pai"
QA=$(ab a get text body); lacks "$QA" "Meu caderno editado" "f: nada da cópia do pai na revisão do admin"
ab a select 'select[name=reason]' duplicate_submission >/dev/null
btn a "Recusar"; wait_ok a "Lista recusada." "f: admin recusa o envio do pai"
ab p open "$BASE/enviar-lista/$P" >/dev/null
wait_ok p "A equipe não publicou esta lista como oficial. Você ainda pode usar sua cópia para montar o carrinho." "f: recusado com resultado: aviso e a cópia continua utilizável"
expect_text p "Revisar meus itens" "f: link para a cópia segue disponível após a recusa"
eq "$(sql "select count(*) from public.parent_list_copies where id='$COPY'")" "1" "f: a cópia permanece"

echo "== (g) segurança"
for who in p s; do
  ab $who open "$BASE/admin/revisao" >/dev/null; sleep 1
  expect_text $who "Você não tem acesso a esta página" "g: '$who' em /admin/revisao recebe a página 403"
done
# o proxy nega /admin/* a não-admin com 403 ANTES da rota (o 404 da própria rota é coberto em tests/review/document-route.test.ts)
for who in p s; do
  C=$(http_of "/admin/revisao/documento/$A" "$(cookie_of $who)")
  if [[ "$C" == "403" || "$C" == "404" ]]; then ok "g: '$who' na rota do documento é negado ($C)"; else bad "g: '$who' na rota do documento" "veio $C"; fi
done
eq "$(http_of "/enviar-lista/$P/revisar" "$(cookie_of o)")" "404" "g: outro pai em /enviar-lista/<id>/revisar = 404"
eq "$(http_of "/enviar-lista/$A/revisar" "$(cookie_of s)")" "404" "g: school_member no envio de escola = 404"
eq "$(http_of "/enviar-lista/$P/revisar" "$ACOOK")" "404" "g: admin na cópia do pai = 404"
eq "$(http_of "/enviar-lista/$P/revisar")" "307" "g: sem sessão, a tela do pai redireciona ao login"

echo "== (h) A11y: snapshot com rótulos de todos os campos e botões"
ab a open "$BASE/admin/revisao/$E" >/dev/null; wait_text a "Versão 1" 20
SNAP=$(ab a snapshot)
for l in "Nome do item 1" "Quantidade do item 1" "Categoria do item 1" "Remover item 1" "Série" "Ano letivo" "Salvar edição" "Adicionar item" "Motivo da recusa"; do has "$SNAP" "$l" "h: snapshot do admin traz '$l'"; done
ab p open "$BASE/enviar-lista/$P/revisar" >/dev/null; wait_text p "Salvar minha lista" 20
SNAPP=$(ab p snapshot)
for l in "Nome do item 1" "Quantidade do item 1" "Remover item 1" "Adicionar item" "Salvar minha lista"; do has "$SNAPP" "$l" "h: snapshot do pai traz '$l'"; done

echo "== (e) sem porta de publicação: aprovar fica 'indisponível' e o aviso persiste"
start_app ""
sleep 1
ab a open "$BASE/admin/revisao/$E" >/dev/null; wait_text a "Versão 1" 20
expect_text a "Escola não identificada neste ambiente" "e: sem porta, escola não identificada (nada inventado)"
ab a fill 'input[aria-label="Quantidade do item 2"]' 12 >/dev/null
btn a "Salvar edição"; wait_ok a "Edição salva (versão 2)." "e: salva a correção"
ab a open "$BASE/admin/revisao/$E" >/dev/null; wait_text a "Versão 2" 20
ab a check 'input[name=acknowledged]' >/dev/null
btn a "Aprovar e publicar"
wait_ok a "Publicação indisponível neste ambiente até a integração" "e: 'Publicação indisponível neste ambiente até a integração'"
sleep 2
expect_text a "Publicação indisponível neste ambiente até a integração" "e: o aviso PERSISTE depois de o envio virar approved"
ab a open "$BASE/admin/revisao/$E" >/dev/null; wait_text a "Versão 2" 20
expect_text a "Publicação indisponível neste ambiente até a integração" "e: o aviso fixo também aparece ao reabrir o detalhe (somente leitura)"
eq "$(btn_state a "Publicar")" "disabled" "e: 'Publicar' desabilitado sem porta"
ab a screenshot "$OUT/S10-sem-porta.png" >/dev/null
eq "$(status_of "$E")" "approved" "e: envio approved (nada publicado)"
eq "$(chain "$E")" "extraction:accepted > publication:human_review > review:edited > review:approved" "e: cadeia termina em review:approved, sem published"
ab a open "$BASE/admin/revisao?aba=aprovadas" >/dev/null
wait_ok a "Aguardando publicação" "e: aba Aprovadas mostra 'Aguardando publicação'"

echo "== fim: privacidade e isolamento"
eq "$(sql "select count(*) from public.ai_decisions where kind='review' and actor_id is null")" "0" "toda linha review tem ator"
eq "$(sql "select count(*) from public.ai_decisions where to_jsonb(ai_decisions)::text ~* '(caderno|lápis|lapis|borracha|meu caderno)'")" "0" "ai_decisions sem conteúdo de itens"
eq "$(sql "select count(*) from public.ai_decisions where entity_id='$P' and kind='review' and decision <> 'rejected'")" "0" "envio do pai: só a recusa do admin em review (a cópia não escreve nada)"

echo "== PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
