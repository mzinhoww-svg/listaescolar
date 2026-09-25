#!/usr/bin/env bash
# E2E da S09 (motor de aprovação automática) com agent-browser, build de produção local da trilha 2.
# NUNCA chama o OpenRouter: provedor FALSO (FAKE_AI_SCRIPT) e portas de publicação EM MEMÓRIA (FAKE_PUBLICATION_FIXTURE),
# ambos só com APP_ENV=local. Pré-requisitos: `pnpm db:start && pnpm db:reset`; `node scripts/supa.mjs env > .env.local`
# (só neste worktree, ignorado pelo git); `pnpm build`. O script sobe/derruba o app (porta 3002) e o worker
# (`functions serve`) por PID. Ver docs/superpowers/e2e/S09.md (quais cenários usam qual caminho: inline, worker, varredor).
set -u
cd "$(dirname "$0")/.."
# Trava de custo: chave/modelos reais no shell poderiam gastar dinheiro de verdade. Aborta e nunca os repassa.
for v in OPENROUTER_KEY AI_MODEL_CHEAP AI_MODEL_STRONG AI_MODEL_VISION; do
  if [ -n "${!v:-}" ]; then echo "ABORTADO: $v está definida no shell; rode com um shell limpo (E2E só usa provedor falso)." >&2; exit 2; fi
done
NOAI="env -u OPENROUTER_KEY -u AI_MODEL_CHEAP -u AI_MODEL_STRONG -u AI_MODEL_VISION"
BASE=${BASE:-http://127.0.0.1:3002}
MAILPIT=${MAILPIT:-http://127.0.0.1:54524}
WORKER=${WORKER:-http://127.0.0.1:54521/functions/v1/ocr-worker}
SECRET_FILE=${SECRET_FILE:-/tmp/s09-worker-secret}
DB=${DB:-supabase_db_listacerta-t2}
EDGE=${EDGE:-supabase_edge_runtime_listacerta-t2}
OUT=docs/superpowers/e2e/screenshots
TMP=$(mktemp -d)
PASS=0; FAIL=0
export AGENT_BROWSER_SESSION_PREFIX=t2s09
ab() { local s=$1; shift; AGENT_BROWSER_SESSION="t2s09-$s" agent-browser "$@"; }
sql() { docker exec "$DB" psql -U postgres -At -c "$1"; }
ok() { PASS=$((PASS+1)); echo "PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL  $1  ($2)"; }
eq() { if [[ "$1" == "$2" ]]; then ok "$3"; else bad "$3" "esperava '$2'; veio '$1'"; fi; }
expect_text() { local t; t=$(ab "$1" get text body 2>/dev/null); if grep -qF -- "$2" <<<"$t"; then ok "$3"; else bad "$3" "esperava '$2'; veio: ${t:0:200}"; fi; }
wait_text() { for _ in $(seq 1 "$3"); do ab "$1" get text body 2>/dev/null | grep -qF -- "$2" && return 0; sleep 1; done; return 1; }
last_id() { sql "select id from public.list_submissions order by created_at desc limit 1"; }
chain() { sql "select coalesce(string_agg(kind||':'||decision, ' > ' order by created_at, case decision when 'accepted' then 0 when 'auto_publish' then 1 when 'human_review' then 1 when 'published' then 2 else 3 end),'') from public.ai_decisions where entity_id='$1'"; }
pubchain() { sql "select coalesce(string_agg(decision, ' > ' order by created_at, case decision when 'auto_publish' then 1 when 'human_review' then 1 when 'published' then 2 else 3 end),'') from public.ai_decisions where entity_id='$1' and kind='publication'"; }
verdict() { sql "select d.decision||'|'||coalesce(d.justification,'')||'|'||coalesce((select string_agg(r,',' order by o) from jsonb_array_elements_text(d.reasons) with ordinality t(r,o)),'') from public.ai_decisions d where d.entity_id='$1' and d.kind='publication' and d.decision in ('auto_publish','human_review')"; }
status_of() { sql "select status from public.list_submissions where id='$1'"; }
published_row() { sql "select coalesce(previous_version_id::text,'-')||'|'||coalesce(new_version_id::text,'-') from public.ai_decisions where entity_id='$1' and kind='publication' and decision='published'"; }
count_kind() { sql "select count(*) from public.ai_decisions where entity_id='$1' and kind='publication' and decision='$2'"; }

# --- ids sintéticos (nenhum dado de escola real) ---
U_SCHOOL=00000000-0000-4000-8000-0000000000a3
S_OK=aaaaaaaa-0000-4000-8000-000000000001        # verificada, município habilitado, remetente vinculado
S_REG=aaaaaaaa-0000-4000-8000-000000000002       # apenas registrada
S_SUSP=aaaaaaaa-0000-4000-8000-000000000003      # suspensa
S_OFF=aaaaaaaa-0000-4000-8000-000000000004       # município não habilitado
S_UNLINK=aaaaaaaa-0000-4000-8000-000000000006    # verificada, remetente sem vínculo
S_GHOST=aaaaaaaa-0000-4000-8000-0000000000ff     # fora da fixture
FIXTURE=$(python3 - <<EOF
import json
def s(i, v, m=True, linked=True): return {"id": i, "verification": v, "municipalityEnabled": m, "linkedProfiles": ["$U_SCHOOL"] if linked else []}
print(json.dumps({"schools": [s("$S_OK","verified"), s("$S_REG","registered"), s("$S_SUSP","suspended"), s("$S_OFF","verified",False), s("$S_UNLINK","verified",True,False)],
  "grades": {"4º ano": "ef-4"}, "validSchoolYears": [2026, 2027]}, ensure_ascii=False))
EOF
)

# --- scripts falsos sintéticos (sem nada de escola real; nenhum item com "sala", que sinaliza uso coletivo) ---
item() { echo "{\"name\":\"$1\",\"quantity\":$2,\"unit\":\"un\",\"category\":\"$3\",\"confidence\":$4$5}"; }
I1=$(item "Caderno brochura (exemplo)" 2 papelaria 0.95 "")
I2=$(item "Lápis preto (exemplo)" 12 escrita 0.9 "")
I3=$(item "Borracha branca (exemplo)" 2 escrita 0.9 "")
GOOD_JSON="{\"items\":[$I1,$I2,$I3],\"overallConfidence\":0.92}"
HAND_JSON="{\"items\":[$I1,$I2,$I3],\"overallConfidence\":0.92,\"handwritten\":true}"
BRAND_JSON="{\"items\":[$(item "Caderno brochura (exemplo)" 2 papelaria 0.95 ',"flags":["marca"]'),$I2,$I3],\"overallConfidence\":0.92}"
script_of() { echo "{\"cheap\":[{\"json\":$1}],\"strong\":[{\"json\":$1}],\"vision\":[{\"json\":$1}]}"; }
GOOD=$(script_of "$GOOD_JSON"); HAND=$(script_of "$HAND_JSON"); BRAND=$(script_of "$BRAND_JSON")
SLOW="{\"cheap\":[{\"delayMs\":13000,\"json\":$GOOD_JSON}],\"strong\":[{\"json\":$GOOD_JSON}],\"vision\":[{\"delayMs\":13000,\"json\":$GOOD_JSON}]}"

start_app() { # script falso; fixture ("" = sem porta de publicação)
  stop_app
  if [ -n "$2" ]; then
    $NOAI APP_ENV=local FAKE_AI_SCRIPT="$1" FAKE_PUBLICATION_FIXTURE="$2" ./node_modules/.bin/next start -p 3002 >/tmp/s09-app.log 2>&1 &
  else
    $NOAI APP_ENV=local FAKE_AI_SCRIPT="$1" ./node_modules/.bin/next start -p 3002 >/tmp/s09-app.log 2>&1 &
  fi
  echo $! >/tmp/s09-app.pid
  for _ in $(seq 1 30); do curl -s -o /dev/null "$BASE/" && return 0; sleep 1; done
}
stop_app() { [ -f /tmp/s09-app.pid ] && kill "$(cat /tmp/s09-app.pid)" 2>/dev/null; sleep 1; local p; p=$(lsof -ti tcp:3002 -sTCP:LISTEN); [ -n "$p" ] && kill "$p" 2>/dev/null; sleep 1; }
start_worker() { # mesmas variáveis do app (script rápido + fixture); processo Deno DISTINTO do app
  openssl rand -hex 16 >"$SECRET_FILE"
  printf 'WORKER_SHARED_SECRET=%s\nAPP_ENV=local\nFAKE_AI_SCRIPT=%s\nFAKE_PUBLICATION_FIXTURE=%s\n' "$(cat "$SECRET_FILE")" "$GOOD" "$FIXTURE" >/tmp/s09-worker.env
  pnpm exec supabase --workdir .track-workdir functions serve ocr-worker --no-verify-jwt --env-file /tmp/s09-worker.env >/tmp/s09-worker.log 2>&1 &
  echo $! >/tmp/s09-worker.pid
  for _ in $(seq 1 60); do grep -q "Serving" /tmp/s09-worker.log 2>/dev/null && return 0; sleep 1; done
}
stop_worker() { [ -f /tmp/s09-worker.pid ] && kill "$(cat /tmp/s09-worker.pid)" 2>/dev/null; sleep 1; docker stop "$EDGE" >/dev/null 2>&1; }
tick() { curl -s -m 110 -X POST -H "x-worker-secret: $(cat "$SECRET_FILE")" "$WORKER"; echo; }
cleanup() { stop_app; stop_worker; for s in s p; do ab $s close >/dev/null 2>&1; done; rm -rf "$TMP"; }
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
# Envia como `s` (s = escola, com schoolId injetado no formulário: a tela ainda não tem seletor de escola; p = pai, sem escola).
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
# clona um envio decidido como envio novo em review_needed, com o mesmo resultado de extração (caminhos varredor e corrida)
clone_pending() { # id de origem
  local id; id=$(sql "with n as (select gen_random_uuid() id) insert into public.list_submissions (id, submitted_by, source, school_id, grade, school_year, storage_path, file_name, mime_type, size_bytes, consent_id, status, is_demo) select n.id, s.submitted_by, s.source, s.school_id, s.grade, s.school_year, s.submitted_by||'/'||n.id||'/lista.pdf', s.file_name, s.mime_type, s.size_bytes, s.consent_id, 'submitted', false from public.list_submissions s, n where s.id='$1' returning id" | head -1)
  sql "with j as (insert into public.jobs (kind, idempotency_key, submission_id, status) values ('ocr_jobs','e2e-s09-$id','$id','succeeded') returning id) insert into public.ocr_jobs (job_id, submission_id, result) select j.id, '$id', (select result from public.ocr_jobs where submission_id='$1' limit 1) from j" >/dev/null
  sql "update public.list_submissions set status='review_needed' where id='$id'" >/dev/null
  echo "$id"
}
fake_routes() { sql "update public.ai_settings set routes = jsonb_build_object('cheap',jsonb_build_object('provider','fake','timeout_ms',20000),'strong',jsonb_build_object('provider','fake','timeout_ms',20000),'vision',jsonb_build_object('provider','fake','timeout_ms',20000))" >/dev/null; }

echo "== preparo: usuário de escola sintético, rotas falsas por dado, interruptor ligado por SQL (default é desligado)"
sql "insert into auth.users (instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current,phone_change,phone_change_token,reauthentication_token,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000','$U_SCHOOL','authenticated','authenticated','escola@listacerta.test',now(),'{\"provider\":\"email\",\"providers\":[\"email\"]}','{}','','','','','','','','',now(),now()) on conflict (id) do nothing; insert into auth.identities (id,user_id,provider,provider_id,identity_data,last_sign_in_at,created_at,updated_at) select gen_random_uuid(),'$U_SCHOOL','email','$U_SCHOOL',jsonb_build_object('sub','$U_SCHOOL','email','escola@listacerta.test','email_verified',true,'phone_verified',false),now(),now(),now() where not exists (select 1 from auth.identities where user_id='$U_SCHOOL'); update public.profiles set role='school_member', display_name='Escola Local' where id='$U_SCHOOL'" >/dev/null
fake_routes
eq "$(sql "select auto_publish_enabled from public.ai_settings")" "f" "seed: auto_publish_enabled nasce DESLIGADO (falha fechada)"
sql "update public.ai_settings set auto_publish_enabled = true" >/dev/null
for s in s p; do ab $s close >/dev/null 2>&1; done

echo "== fase 1: app com script bom + fixture (decisão INLINE na Server Action)"
start_app "$GOOD" "$FIXTURE"
ab s set viewport 390 844 >/dev/null; ab p set viewport 390 844 >/dev/null
login s escola@listacerta.test %2Fenviar-lista
login p parent@listacerta.test %2Fenviar-lista

echo "== (a) escola envia lista boa -> publicada automaticamente (porta em memória)"
submit s "4º ano" "$S_OK"
wait_text s "Publicada automaticamente" 40 && ok "a1: tela 'Publicada automaticamente'" || bad "a1 tela" "$(ab s get text body | head -c 200)"
expect_text s "Demonstração" "a1: selo 'Demonstração' (publicação da porta em memória)"
ab s screenshot "$OUT/S09-publicada.png" >/dev/null
A1=$(last_id)
eq "$(chain "$A1")" "extraction:accepted > publication:auto_publish > publication:published" "a1: ai_decisions extraction:accepted > auto_publish > published"
eq "$(verdict "$A1")" "auto_publish|rules_passed|" "a1: veredito auto_publish, rules_passed, sem motivos"
eq "$(status_of "$A1")" "published" "a1: envio published"
IFS='|' read -r PREV1 NEW1 <<<"$(published_row "$A1")"
eq "$PREV1" "-" "a1: previous_version_id nulo (1ª publicação da lista)"
[[ "$NEW1" != "-" ]] && ok "a1: new_version_id registrado" || bad "a1 new_version_id" "$NEW1"
eq "$(sql "select actor_id is null from public.ai_decisions where entity_id='$A1' and kind='publication' and decision='published'")" "t" "a1: ator = sistema (actor_id nulo)"
submit s "4º ano" "$S_OK"
wait_text s "Publicada automaticamente" 40 && ok "a2: 2º envio igual também publicado" || bad "a2 tela" ""
A2=$(last_id)
IFS='|' read -r PREV2 NEW2 <<<"$(published_row "$A2")"
eq "$PREV2" "$NEW1" "a2: previous_version_id = versão publicada antes"
[[ "$NEW2" != "-" && "$NEW2" != "$NEW1" ]] && ok "a2: nova versão distinta" || bad "a2 nova versão" "$NEW2"

echo "== (d) pai envia -> nunca publica sozinho"
submit p "4º ano" ""
wait_text p "Em revisão pela equipe" 40 && ok "d: tela 'Em revisão pela equipe' para o pai (sem códigos)" || bad "d tela" "$(ab p get text body | head -c 200)"
ab p screenshot "$OUT/S09-em-revisao.png" >/dev/null
D1=$(last_id)
V=$(verdict "$D1"); echo "     veredito do pai: $V"
eq "$V" "human_review|missing_school|missing_school,parent_submission,submitter_not_linked" "d: human_review com parent_submission (e a escola ausente) em reasons"
eq "$(count_kind "$D1" published)" "0" "d: nenhuma publicação"
if ab p get text body | grep -qE "parent_submission|missing_school|critical_alert"; then bad "d: códigos na tela do pai" ""; else ok "d: tela do pai não mostra códigos de motivo"; fi

echo "== escola: um motivo isolado por variação da fixture (mesmo script bom)"
one() { # rótulo, série, escola, veredito esperado
  submit s "$2" "$3"; wait_text s "Em revisão pela equipe" 40 || true
  local id; id=$(last_id)
  eq "$(verdict "$id")" "$4" "$1"
  eq "$(count_kind "$id" published)" "0" "$1: porta nunca chamada (sem linha published)"
}
one "escola só registrada -> school_not_verified" "4º ano" "$S_REG" "human_review|school_not_verified|school_not_verified"
one "escola suspensa -> school_suspended" "4º ano" "$S_SUSP" "human_review|school_suspended|school_suspended"
one "município desabilitado -> municipality_not_enabled" "4º ano" "$S_OFF" "human_review|municipality_not_enabled|municipality_not_enabled"
one "escola fora do contexto -> school_not_found" "4º ano" "$S_GHOST" "human_review|school_not_found|school_not_found,submitter_not_linked"
one "remetente sem vínculo -> submitter_not_linked" "4º ano" "$S_UNLINK" "human_review|submitter_not_linked|submitter_not_linked"
one "série que não vira slug ('Educação infantil') -> grade_unresolved" "Educação infantil" "$S_OK" "human_review|grade_unresolved|grade_unresolved"

echo "== (e) interruptor desligado por SQL, sem deploy"
sql "update public.ai_settings set auto_publish_enabled = false" >/dev/null
sleep 32   # cache de 30 s das settings no processo do app
submit s "4º ano" "$S_OK"
wait_text s "Em revisão pela equipe" 40 && ok "e: tela 'Em revisão pela equipe'" || bad "e tela" ""
ab s screenshot "$OUT/S09-interruptor-desligado.png" >/dev/null
E1=$(last_id)
eq "$(verdict "$E1")" "human_review|auto_publish_disabled|auto_publish_disabled" "e: human_review auto_publish_disabled (só esse motivo)"
sql "update public.ai_settings set auto_publish_enabled = true" >/dev/null

echo "== fase 2: (f) app SEM FAKE_PUBLICATION_FIXTURE -> falha fechada, registrada"
start_app "$GOOD" ""
sleep 1
submit s "4º ano" "$S_OK"
wait_text s "Em revisão pela equipe" 40 && ok "f: tela 'Em revisão pela equipe'" || bad "f tela" ""
expect_text s "Lista lida" "f: itens seguem visíveis (leitura não depende da publicação)"
F1=$(last_id)
eq "$(verdict "$F1")" "human_review|publisher_unavailable|publisher_unavailable,context_unavailable" "f: publisher_unavailable + context_unavailable"
eq "$(count_kind "$F1" published)" "0" "f: nenhuma publicação sem porta"
if ab s get text body | grep -qF "Demonstração"; then bad "f: selo indevido" ""; else ok "f: sem selo 'Demonstração' (nada foi publicado)"; fi

echo "== fase 3: (b) manuscrito (alerta crítico no seed)"
start_app "$HAND" "$FIXTURE"
sleep 1
submit s "4º ano" "$S_OK"
wait_text s "Em revisão pela equipe" 40 && ok "b: tela 'Em revisão pela equipe'" || bad "b tela" ""
B1=$(last_id)
eq "$(verdict "$B1")" "human_review|critical_alert|critical_alert" "b: human_review critical_alert"
eq "$(count_kind "$B1" published)" "0" "b: nenhuma publicação"

echo "== fase 4: (c) item com marca/especificação restritiva"
start_app "$BRAND" "$FIXTURE"
sleep 1
submit s "4º ano" "$S_OK"
wait_text s "Em revisão pela equipe" 40 && ok "c: tela 'Em revisão pela equipe'" || bad "c tela" ""
C1=$(last_id)
eq "$(verdict "$C1")" "human_review|item_flagged|item_flagged" "c: human_review item_flagged (alerta de item, mesmo não crítico)"
eq "$(count_kind "$C1" published)" "0" "c: nenhuma publicação"

echo "== fase 5: (g) envio lento (13 s > 10 s) -> WORKER decide (memória do worker, processo distinto do app)"
start_app "$SLOW" "$FIXTURE"
start_worker
submit s "4º ano" "$S_OK"
wait_text s "Continuar aguardando" 40 && ok "g: estado assíncrono após estourar 10 s" || bad "g assíncrono" "$(ab s get text body | head -c 200)"
G1=$(last_id)
eq "$(pubchain "$G1")" "" "g: app não decidiu (sem linha de publicação antes do worker)"
tick | head -c 300
wait_text s "Publicada automaticamente" 90 && ok "g: worker decidiu e o painel mudou sozinho para 'Publicada automaticamente'" || bad "g worker" "$(ab s get text body | head -c 200)"
eq "$(chain "$G1")" "extraction:failed > extraction:accepted > publication:auto_publish > publication:published" "g: cadeia do envio pelo worker"
IFS='|' read -r PREVG NEWG <<<"$(published_row "$G1")"
eq "$PREVG" "-" "g: previous_version_id nulo na memória do worker (1ª publicação DELE)"
tick >/dev/null; tick >/dev/null
eq "$(count_kind "$G1" auto_publish)/$(count_kind "$G1" published)" "1/1" "g: reexecução do worker/varredor não duplica veredito nem publicação"
eq "$(status_of "$G1")" "published" "g: envio segue published"

echo "== (h) disparo simultâneo do mesmo veredito por RPC direta -> uma linha"
H1=$(clone_pending "$A1")
VJ='{"decision":"human_review","justification":"critical_alert","reasons":["critical_alert"],"pipeline_version":"s09.1","alerts":[]}'
docker exec "$DB" psql -U postgres -At -c "select public.publication_record_verdict('$H1','$VJ')" >"$TMP/h1a" &
P1=$!
docker exec "$DB" psql -U postgres -At -c "select public.publication_record_verdict('$H1','$VJ')" >"$TMP/h1b" &
P2=$!
wait $P1 $P2
eq "$(cat "$TMP/h1a" "$TMP/h1b" | sort | tr '\n' ' ')" "already_decided recorded " "h1: um 'recorded' e um 'already_decided'"
eq "$(sql "select count(*) from public.ai_decisions where entity_id='$H1' and kind='publication'")" "1" "h1: uma linha de veredito"
eq "$(status_of "$H1")" "human_review" "h1: envio human_review"

echo "== (h2) varredor: envio pendente sem decisão inline + dois ticks simultâneos -> um veredito, uma publicação"
H2=$(clone_pending "$A1")
sleep 32   # idade mínima do varredor: 30 s
tick >"$TMP/t1" & P1=$!
tick >"$TMP/t2" & P2=$!
wait $P1 $P2
eq "$(count_kind "$H2" auto_publish)/$(count_kind "$H2" human_review)/$(count_kind "$H2" published)" "1/0/1" "h2: um veredito auto_publish e uma publicação (varredor)"
IFS='|' read -r PREVH NEWH <<<"$(published_row "$H2")"
eq "$PREVH" "$NEWG" "h2: previous_version_id = versão que o WORKER publicou antes (memória do worker persiste entre ticks)"
eq "$(status_of "$H2")" "published" "h2: envio published"

echo "== interruptor desligado DEPOIS de approved: o varredor reavalia e falha fechado"
H3=$(clone_pending "$A1")
AJ='{"decision":"auto_publish","justification":"rules_passed","reasons":[],"pipeline_version":"s09.1","alerts":[]}'
eq "$(sql "select public.publication_record_verdict('$H3','$AJ')")" "recorded" "off: veredito auto_publish gravado (envio approved)"
eq "$(status_of "$H3")" "approved" "off: envio approved, ainda sem publicação"
sql "update public.ai_settings set auto_publish_enabled = false" >/dev/null
sleep 33   # idade mínima 30 s e cache de settings do worker
tick | head -c 300
eq "$(pubchain "$H3")" "auto_publish > publish_failed" "off: auto_publish > publish_failed (a porta nunca foi chamada)"
eq "$(sql "select justification from public.ai_decisions where entity_id='$H3' and decision='publish_failed'")" "auto_publish_disabled" "off: publish_failed com auto_publish_disabled"
eq "$(status_of "$H3")" "human_review" "off: envio volta a human_review"
sql "update public.ai_settings set auto_publish_enabled = true" >/dev/null

echo "== privacidade: nenhuma linha de ai_decisions com texto do documento"
eq "$(sql "select count(*) from public.ai_decisions where to_jsonb(ai_decisions)::text ~* '(caderno|lápis|lapis|borracha)'")" "0" "ai_decisions sem conteúdo do documento"
eq "$(sql "select count(*) from public.ai_decisions where kind='publication' and decision='published' and actor_id is not null")" "0" "toda publicação automática tem actor_id nulo (sistema)"

echo "== PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
