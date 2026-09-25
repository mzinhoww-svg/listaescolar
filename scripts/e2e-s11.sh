#!/usr/bin/env bash
# E2E da S11 (integração das trilhas e notificações) com agent-browser, build de produção local da trilha 3 (porta 3003).
# Fluxo: escola vinculada envia PDF -> leitura (IA FALSA) -> decisão de publicação -> publicação REAL (list_publish_from_pipeline) ->
# lista pública -> carrinho da lista oficial -> lead -> notificações -> central /conta/notificacoes; e o OCR ASSÍNCRONO pelo worker.
# NUNCA chama o OpenRouter (FAKE_AI_SCRIPT só com APP_ENV=local) e não toca o staging. O interruptor auto_publish_enabled nasce
# DESLIGADO (seed); o script liga no banco LOCAL e desliga ao fim. Pré-requisitos: `pnpm db:reset`, `pnpm build`, `.env.local` do worktree.
# Segredos do worker e do despachante são gerados em /tmp (fora do repositório) e apagados ao fim. Sem VAPID nem e-mail:
# os canais externos aparecem "indisponível" e nenhuma entrega externa é criada. Encerra só os processos que abriu (por PID/porta).
set -u
cd "$(dirname "$0")/.."
for v in OPENROUTER_KEY AI_MODEL_CHEAP AI_MODEL_STRONG AI_MODEL_VISION; do
  if [ -n "${!v:-}" ]; then echo "ABORTADO: $v está definida no shell; rode com um shell limpo (E2E só usa provedor falso)." >&2; exit 2; fi
done
NOAI="env -u OPENROUTER_KEY -u AI_MODEL_CHEAP -u AI_MODEL_STRONG -u AI_MODEL_VISION"
BASE=${BASE:-http://127.0.0.1:3003}
MAILPIT=${MAILPIT:-http://127.0.0.1:54624}
WORKER=${WORKER:-http://127.0.0.1:54621/functions/v1/ocr-worker}
SECRET_FILE=${SECRET_FILE:-/tmp/s11-worker-secret}
DISPATCH_SECRET_FILE=${DISPATCH_SECRET_FILE:-/tmp/s11-dispatch-secret}
DB=${DB:-supabase_db_listacerta-t3}
EDGE=${EDGE:-supabase_edge_runtime_listacerta-t3}
OUT=docs/superpowers/e2e/screenshots
TMP=$(mktemp -d)
PASS=0; FAIL=0
RUN=$(date +%s)
export AGENT_BROWSER_SESSION_PREFIX=t3s11
ab() { local s=$1; shift; AGENT_BROWSER_SESSION="t3s11-$RUN-$s" agent-browser "$@"; }
sql() { docker exec "$DB" psql -U postgres -At -c "$1"; }
sql_err() { docker exec "$DB" psql -U postgres -At -c "$1" 2>&1 >/dev/null | head -c 300; } # só o erro (stderr) da consulta
# Conta linhas visíveis a um perfil pela RLS real (papel `authenticated` + claims do JWT), como o PostgREST faria.
sql_as() { docker exec "$DB" psql -U postgres -At -c "begin" -c "set local role authenticated" -c "select set_config('request.jwt.claims', '{\"sub\":\"$1\",\"role\":\"authenticated\"}', true)" -c "$2" -c "rollback" 2>/dev/null | sed -n '4p'; }
ok() { PASS=$((PASS+1)); echo "PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL  $1  ($2)"; }
eq() { if [[ "$1" == "$2" ]]; then ok "$3"; else bad "$3" "esperava '$2'; veio '$1'"; fi; }
expect_text() { local t; t=$(ab "$1" get text body 2>/dev/null); if grep -qF -- "$2" <<<"$t"; then ok "$3"; else bad "$3" "esperava '$2'; veio: ${t:0:200}"; fi; }
expect_no_text() { local t; t=$(ab "$1" get text body 2>/dev/null); if grep -qF -- "$2" <<<"$t"; then bad "$3" "não deveria conter '$2'"; else ok "$3"; fi; }
wait_text() { for _ in $(seq 1 "$3"); do ab "$1" get text body 2>/dev/null | grep -qF -- "$2" && return 0; sleep 1; done; return 1; }
wait_sql() { for _ in $(seq 1 "$3"); do [ "$(sql "$1")" = "$2" ] && return 0; sleep 1; done; return 1; }
shot() { sleep 2; ab "$1" screenshot "$2" >/dev/null; }
clicktext() { ab "$1" eval "(() => { const e = [...document.querySelectorAll('a,button')].find(x => (x.textContent||'').includes('$2') || (x.getAttribute('aria-label')||'').includes('$2')); if (!e) return 'sem-elemento'; e.click(); return 'ok'; })()" >/dev/null; }

SCHOOL=aaaaaaaa-0000-4000-8000-000000001101
INEP=51991101
ESCOLA=00000000-0000-4000-8000-0000000011a1
STAT_OWNER=00000000-0000-4000-8000-0000000011a2
item() { echo "{\"name\":\"$1\",\"quantity\":$2,\"unit\":\"un\",\"category\":\"$3\",\"confidence\":$4}"; }
GOOD_JSON="{\"items\":[$(item "Caderno brochura (exemplo)" 2 papelaria 0.95),$(item "Lápis preto (exemplo)" 12 escrita 0.9),$(item "Borracha branca (exemplo)" 2 escrita 0.9)],\"overallConfidence\":0.92}"
GOOD="{\"cheap\":[{\"json\":$GOOD_JSON}],\"strong\":[{\"json\":$GOOD_JSON}],\"vision\":[{\"json\":$GOOD_JSON}]}"
SLOW="{\"cheap\":[{\"delayMs\":13000,\"json\":$GOOD_JSON}],\"strong\":[{\"json\":$GOOD_JSON}],\"vision\":[{\"delayMs\":13000,\"json\":$GOOD_JSON}]}"

start_app() { # script falso. SEM FAKE_PUBLICATION_FIXTURE: as portas de publicação são as REAIS
  stop_app
  [ -s "$DISPATCH_SECRET_FILE" ] || openssl rand -hex 16 >"$DISPATCH_SECRET_FILE"
  $NOAI APP_ENV=local FAKE_AI_SCRIPT="$1" NOTIFICATIONS_DISPATCH_SECRET="$(cat "$DISPATCH_SECRET_FILE")" PORT=3003 ./node_modules/.bin/next start -p 3003 >/tmp/s11-app.log 2>&1 &
  echo $! >/tmp/s11-app.pid
  for _ in $(seq 1 30); do curl -s -o /dev/null "$BASE/" && return 0; sleep 1; done
}
stop_app() { [ -f /tmp/s11-app.pid ] && kill "$(cat /tmp/s11-app.pid)" 2>/dev/null; sleep 1; local p; p=$(lsof -ti tcp:3003 -sTCP:LISTEN); [ -n "$p" ] && kill "$p" 2>/dev/null; sleep 1; }
start_worker() {
  openssl rand -hex 16 >"$SECRET_FILE"
  printf 'WORKER_SHARED_SECRET=%s\nAPP_ENV=local\nFAKE_AI_SCRIPT=%s\n' "$(cat "$SECRET_FILE")" "$GOOD" >/tmp/s11-worker.env
  pnpm exec supabase --workdir .track-workdir functions serve ocr-worker --no-verify-jwt --env-file /tmp/s11-worker.env >/tmp/s11-worker.log 2>&1 &
  echo $! >/tmp/s11-worker.pid
  for _ in $(seq 1 60); do grep -q "Serving" /tmp/s11-worker.log 2>/dev/null && return 0; sleep 1; done
}
stop_worker() { [ -f /tmp/s11-worker.pid ] && kill "$(cat /tmp/s11-worker.pid)" 2>/dev/null; sleep 1; docker stop "$EDGE" >/dev/null 2>&1; }
tick() { curl -s -m 110 -X POST -H "x-worker-secret: $(cat "$SECRET_FILE")" "$WORKER"; echo; }
cleanup() { sql "update public.ai_settings set auto_publish_enabled = false" >/dev/null 2>&1; stop_app; stop_worker; for s in e p st; do ab $s close >/dev/null 2>&1; done; rm -rf "$TMP" "$SECRET_FILE" "$DISPATCH_SECRET_FILE" /tmp/s11-worker.env; }
trap cleanup EXIT

login() { # sessão, e-mail, next. Sessão já autenticada: /entrar redireciona direto para `next` (Ruling da S27) e nada é preenchido.
  local s=$1 email=$2 next=$3 before after id link
  before=$(curl -s "$MAILPIT/api/v1/search?query=to:$email" | python3 -c "import sys,json;print(json.load(sys.stdin)['messages_count'])")
  ab "$s" open "$BASE/entrar?next=$next" >/dev/null; sleep 1
  if ! ab "$s" get url 2>/dev/null | grep -q "/entrar"; then return 0; fi
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
upload_school() { # sessão, série
  ab "$1" open "$BASE/escola/listas/nova?escola=$SCHOOL" >/dev/null
  wait_text "$1" "Enviar para revisão" 20; sleep 1
  for _ in 1 2 3 4 5 6; do ab "$1" upload '#file' "$TMP/lista.pdf" >/dev/null; ab "$1" get text '[data-testid=picked]' 2>/dev/null | grep -q . && break; sleep 1; done
  ab "$1" select '#grade' "$2" >/dev/null
  ab "$1" select '#schoolYear' "2027" >/dev/null
  ab "$1" check 'input[name=consent]' >/dev/null
  # `requestSubmit()` dispara o mesmo evento submit (o onSubmit/clientCheck do React roda); o `click` do agent-browser no botão
  # não chegou ao formulário numa das execuções (o mesmo motivo do consentimento da S14).
  ab "$1" eval "document.querySelector('form').requestSubmit()" >/dev/null
}
last_id() { sql "select id from public.list_submissions order by created_at desc limit 1"; }

echo "== preparo: seed local, interruptor LIGADO no banco local (default é desligado), IA falsa"
docker exec -i "$DB" psql -U postgres -q <scripts/e2e-s11-seed.sql >/dev/null
eq "$(sql "select auto_publish_enabled from public.ai_settings")" "f" "seed: auto_publish_enabled nasce DESLIGADO"
sql "update public.ai_settings set auto_publish_enabled = true" >/dev/null
sql "delete from public.notifications" >/dev/null
for s in e p st; do ab $s close >/dev/null 2>&1; ab $s set viewport 1280 800 >/dev/null 2>&1; done

echo "== 1) app com IA falsa e portas de publicação REAIS"
start_app "$GOOD"
login e s11escola@listacerta.test %2Fescola%2Flistas%2Fnova
echo "== 2) escola vinculada envia o PDF (escola pré-selecionada) -> leitura -> publicação automática"
upload_school e "4º ano"
wait_sql "select status from public.list_submissions order by created_at desc limit 1" "published" 60 && ok "2a: envio chegou a published" || bad "2a" "$(sql "select status from public.list_submissions order by created_at desc limit 1")"
SUB=$(last_id)
eq "$(sql "select source||'|'||(school_id='$SCHOOL')::text from public.list_submissions where id='$SUB'")" "school|true" "2b: envio da ESCOLA com a escola vinculada (D-002)"
eq "$(sql "select string_agg(kind||':'||decision, ' > ' order by created_at, case decision when 'accepted' then 0 when 'auto_publish' then 1 else 2 end) from public.ai_decisions where entity_id='$SUB'")" "extraction:accepted > publication:auto_publish > publication:published" "2c: cadeia de decisões registrada"
eq "$(sql "select v.status||'|'||(v.publication_key='$SUB')::text||'|'||(v.approved_by=public.system_profile_id())::text||'|'||v.item_count from public.list_versions v join public.school_lists l on l.id=v.list_id where l.school_id='$SCHOOL' order by v.created_at desc limit 1")" "published|true|true|3" "2d: versão REAL publicada pelo perfil system (chave = envio, 3 itens)"
eq "$(sql "select actor_id is null from public.ai_decisions where entity_id='$SUB' and decision='published'")" "t" "2e: publicação automática sem ator humano"
shot e "$OUT/S11-escola-enviada.png"
V1=$(sql "select v.id from public.list_versions v join public.school_lists l on l.id=v.list_id where l.school_id='$SCHOOL' and v.publication_key='$SUB'")
upload_school e "4º ano"
# espera o SEGUNDO envio existir (o primeiro ainda está `published` e satisfaria a espera por status) e só então o seu status
wait_sql "select count(*) from public.list_submissions" "2" 30
SUB2=$(last_id)
[ -n "$SUB2" ] && [ "$SUB2" != "$SUB" ] && wait_sql "select status from public.list_submissions where id='$SUB2'" "published" 60 && ok "2f: segundo envio da mesma série também publicado" || bad "2f" "sub2='$SUB2' status='$(sql "select status from public.list_submissions where id='${SUB2:-$SUB}'")'"
eq "$(sql "select string_agg(v.status::text, ',' order by v.created_at)||'|'||(select (publication_previous_id='$V1')::text from public.list_versions where publication_key='$SUB2') from public.list_versions v join public.school_lists l on l.id=v.list_id join public.grades g on g.id=l.grade_id where l.school_id='$SCHOOL' and g.slug='ef-4'")" "superseded,published|true" "2g: nova versão publicada, anterior superseded, previous = 1ª versão (uma só lista por escola x série x ano)"
eq "$(sql_err "select public.submissions_create(gen_random_uuid(), '$STAT_OWNER', 'school', '$SCHOOL', '4º ano', 2027, 'x/y.pdf', 'y.pdf', 'application/pdf', 10, true, 'lista', 'v1')" | grep -o 'school_not_linked')" "school_not_linked" "2h: perfil sem vínculo em school_members não envia como escola (D-002, 42501 school_not_linked)"
eq "$(sql "select count(*) from public.list_submissions where submitted_by='$STAT_OWNER'")" "0" "2i: envio recusado não deixou linha"

echo "== 3) lista pública (anônimo)"
ab p open "$BASE/escolas/$INEP/ef-4?ano=2027" >/dev/null
wait_text p "Caderno brochura (exemplo)" 20 && ok "3a: lista pública mostra os itens" || bad "3a" "$(ab p get text body | head -c 200)"
expect_no_text p "Me avise" "3b: lista publicada não oferece 'Me avise'"
shot p "$OUT/S11-lista-publica.png"
ab p open "$BASE/escolas/$INEP/ef-5?ano=2027" >/dev/null
wait_text p "Me avise" 20 && ok "3c: série sem lista publicada oferece 'Me avise' (App24)" || bad "3c" "$(ab p get text body | head -c 200)"
expect_text p "indisponível no momento" "3d: WhatsApp e e-mail 'indisponível no momento'"
clicktext p "Me avise"; sleep 2
ab p get url | grep -q "/entrar?next=%2Fescolas%2F$INEP%2Fef-5" && ok "3e: 'Me avise' sem login leva ao /entrar com next da lista" || bad "3e" "$(ab p get url)"
eq "$(sql "select count(*) from public.list_watches")" "0" "3f: nada gravado sem login"

echo "== 4) responsável: 'Me avise' -> carrinho da lista OFICIAL -> lead"
login p parent@listacerta.test "%2Fescolas%2F$INEP%2Fef-5%3Fano%3D2027"
wait_text p "Me avise" 20; clicktext p "Me avise"
wait_text p "Você será avisado aqui no app" 15 && ok "4a: acompanhamento criado" || bad "4a" "$(ab p get text body | head -c 200)"
eq "$(sql "select count(*) from public.list_watches w join public.grades g on g.id=w.grade_id where g.slug='ef-5' and w.school_year=2027")" "1" "4a2: list_watches gravado"
VERSION=$(sql "select v.id from public.list_versions v join public.school_lists l on l.id=v.list_id join public.grades g on g.id=l.grade_id where l.school_id='$SCHOOL' and g.slug='ef-4' and v.status='published'")
ab p open "$BASE/carrinho/novo?lista=$VERSION" >/dev/null
wait_text p "Comparar opções" 20; expect_text p "Lista oficial publicada" "4b: origem oficial dita na tela"
clicktext p "Comparar opções"
for _ in $(seq 1 20); do ab p get url | grep -q "/carrinho/[0-9a-f-]\{36\}" && break; sleep 1; done
CART=$(ab p get url | sed -E 's#.*/carrinho/([0-9a-f-]{36}).*#\1#')
eq "$(sql "select list_kind||'|'||is_demo::text from public.carts where id='$CART'")" "official|false" "4c: carrinho real (list_kind official, is_demo false)"
ab p open "$BASE/cotacao/nova?carrinho=$CART" >/dev/null
wait_text p "Papelaria S11" 20 && ok "4d: papelaria do município da ESCOLA listada" || bad "4d" "$(ab p get text body | head -c 200)"
clicktext p "Pedir pelo WhatsApp a Papelaria S11"
wait_text p "Confirmar pedido de cotação" 15; sleep 1
ab p click 'input[type=checkbox]' >/dev/null
ab p eval "document.querySelector('form[aria-label^=Consentimento]').requestSubmit()" >/dev/null
for _ in $(seq 1 20); do ab p get url 2>/dev/null | grep -q "/cotacao/LC-" && break; sleep 1; done
LEAD=$(ab p get url | sed -E 's#.*/cotacao/(LC-[0-9A-Z]+).*#\1#')
[[ "$LEAD" == LC-* ]] && ok "4e: lead criado ($LEAD)" || bad "4e" "$LEAD"
eq "$(sql "select school_name||'|'||grade_label||'|'||school_year||'|'||list_kind from public.leads where code='$LEAD'")" "Escola Sintética S11|4º ano|2027|official" "4f: lead com escola, série, ano e origem REAIS"

echo "== 5) notificações do lead e da publicação"
eq "$(sql "select recipient_id from public.notifications where event_type='lead_received'")" "$STAT_OWNER" "5a: lead_received só para o membro da papelaria"
eq "$(sql "select params::text from public.notifications where event_type='lead_received'")" "{\"lead_code\": \"$LEAD\"}" "5b: params do lead_received = só o código (sem escola, aluno ou responsável)"
sql "update public.leads set status='quote_sent' where code='$LEAD'" >/dev/null
eq "$(sql "select count(*) from public.notifications where event_type='lead_quote_sent'")" "1" "5c: lead_quote_sent para o solicitante"
eq "$(sql "select count(*) from public.notifications where event_type='submission_published' and recipient_id='$ESCOLA'")" "2" "5d: submission_published para a escola remetente (um por envio publicado: 2a e 2f)"
eq "$(sql "select count(*) from public.notifications where event_type='submission_published' and recipient_id<>'$ESCOLA'")" "0" "5e: submission_published só para quem enviou"

echo "== 6) central /conta/notificacoes"
ab e open "$BASE/conta/notificacoes" >/dev/null
wait_text e "Sua lista foi publicada" 20 && ok "6a: escola vê 'Sua lista foi publicada'" || bad "6a" "$(ab e get text body | head -c 250)"
expect_text e "Nova" "6b: não lida destacada por texto"
shot e "$OUT/S11-central-escola.png"
clicktext e "Marcar como lida"; sleep 2
eq "$(sql "select count(*) filter (where read_at is null)||'|'||count(*) filter (where read_at is not null) from public.notifications where recipient_id='$ESCOLA'")" "1|1" "6c: 'Marcar como lida' marca só aquela (função do servidor; 2 -> 1 não lida)"
clicktext e "Marcar todas como lidas"; sleep 2
eq "$(sql "select count(*) from public.notifications where recipient_id='$ESCOLA' and read_at is null")" "0" "6c2: 'Marcar todas como lidas' zera as não lidas da escola"
eq "$(sql "select count(*) from public.notifications where recipient_id<>'$ESCOLA' and read_at is not null")" "0" "6c3: marcar as da escola não tocou as dos outros perfis"
ab p open "$BASE/conta/notificacoes" >/dev/null
wait_text p "Sua cotação chegou" 20 && ok "6d: responsável vê 'Sua cotação chegou'" || bad "6d" "$(ab p get text body | head -c 250)"
expect_text p "Listas que você acompanha" "6e: acompanhamentos listados"
expect_text p "indisponível" "6f: preferências mostram canal indisponível (sem VAPID/e-mail neste ambiente)"
shot p "$OUT/S11-central-responsavel.png"
login st s11papelaria@listacerta.test %2Fconta%2Fnotificacoes
wait_text st "Novo pedido de cotação" 20 && ok "6g: papelaria vê 'Novo pedido de cotação'" || bad "6g" "$(ab st get text body | head -c 250)"
expect_no_text st "Escola Sintética" "6h: notificação da papelaria sem dado da escola nem do aluno"
expect_no_text st "parent@listacerta.test" "6i: sem e-mail do responsável"

echo "== 7) OCR ASSÍNCRONO pelo worker -> notificação aparece na central"
start_app "$SLOW"
start_worker
login e s11escola@listacerta.test %2Fescola%2Flistas%2Fnova
upload_school e "5º ano"
wait_sql "select status from public.list_submissions order by created_at desc limit 1" "processing_async" 40 && ok "7a: leitura estourou o orçamento e foi para 'processing_async'" || bad "7a" "$(sql "select status from public.list_submissions order by created_at desc limit 1")"
ASYNC=$(last_id)
eq "$(sql "select count(*) from public.notifications where event_key like 'submission_ready:$ASYNC'")" "0" "7b: nada foi notificado antes de o fato acontecer"
tick | head -c 300
wait_sql "select status from public.list_submissions where id='$ASYNC'" "published" 90 && ok "7c: worker leu, decidiu e publicou (portas reais no worker)" || bad "7c" "$(sql "select status from public.list_submissions where id='$ASYNC'")"
eq "$(sql "select count(*) from public.notifications where event_key='submission_ready:$ASYNC' and recipient_id='$ESCOLA'")" "1" "7d: submission_ready gerado no fato (OCR assíncrono concluído)"
ab e open "$BASE/conta/notificacoes" >/dev/null
wait_text e "Sua lista foi lida" 20 && ok "7e: central mostra 'Sua lista foi lida'" || bad "7e" "$(ab e get text body | head -c 250)"
shot e "$OUT/S11-central-async.png"
V5=$(sql "select v.id from public.list_versions v join public.school_lists l on l.id=v.list_id join public.grades g on g.id=l.grade_id where l.school_id='$SCHOOL' and g.slug='ef-5' and v.status='published'")
eq "$(sql "select count(*) from public.notifications n where n.event_type='list_published' and not exists (select 1 from public.list_watches w join public.grades g on g.id=w.grade_id where w.profile_id=n.recipient_id and w.school_id='$SCHOOL' and g.slug='ef-5' and w.school_year=2027)")" "0" "7f: list_published só para quem acompanha a (escola, série, ano): nem a escola remetente nem a papelaria"
eq "$(sql "select count(*)||'|'||string_agg(recipient_id::text, ',') from public.notifications where event_key='list_published:$V5'")" "1|00000000-0000-4000-8000-0000000000a2" "7g: o responsável que pediu 'Me avise' no 5º ano recebeu list_published da versão publicada (uma só vez)"

echo "== 8) privacidade (RLS por JWT, canais externos), despachante e interruptor"
eq "$(sql "select count(*) from public.notifications where params::text ~* '(@|aluno|estudante|responsavel|telefone)'")" "0" "8a: nenhuma notificação com dado pessoal"
eq "$(sql "select count(*) from public.notifications where params ?| array['submitter','requester','email','phone','student','child','nickname']")" "0" "8a2: params só com chaves da lista fechada"
PARENT=00000000-0000-4000-8000-0000000000a2
eq "$(sql_as "$PARENT" "select count(*)||'|'||count(*) filter (where recipient_id<>'$PARENT') from public.notifications")" "$(sql "select count(*) from public.notifications where recipient_id='$PARENT'")|0" "8b: RLS: o responsável lê só as próprias notificações (papel authenticated + JWT)"
eq "$(sql_as "$STAT_OWNER" "select count(*)||'|'||count(*) filter (where recipient_id<>'$STAT_OWNER') from public.notifications")" "1|0" "8c: RLS: a papelaria lê só a sua (o lead_received)"
eq "$(sql_as "$ESCOLA" "select count(*) from public.list_watches")" "0" "8d: RLS: a escola não enxerga os acompanhamentos do responsável"
eq "$(sql "select count(*) from public.notification_deliveries where channel in ('email','web_push')")" "0" "8e: nenhuma entrega externa criada (e-mail desligado no banco, sem assinatura push)"
eq "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/notifications/dispatch")" "401" "8f: despachante sem segredo: 401"
eq "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $(openssl rand -hex 16)" "$BASE/api/notifications/dispatch")" "401" "8g: despachante com segredo errado: 401"
DISP=$(curl -s -X POST -H "Authorization: Bearer $(cat "$DISPATCH_SECRET_FILE")" "$BASE/api/notifications/dispatch")
grep -q '"expiredTokens"' <<<"$DISP" && grep -q '"dispatch"' <<<"$DISP" && grep -q '"purged"' <<<"$DISP" && ok "8h: despachante com o segredo: ciclo roda (expira tokens, despacha, expurga) sem nada a enviar ($DISP)" || bad "8h" "$DISP"
eq "$(sql "select count(*) from public.notifications")" "$(sql "select count(*) from public.notifications where created_at > now() - interval '1 hour'")" "8i: o expurgo não apagou notificação recente"
sql "update public.ai_settings set auto_publish_enabled = false" >/dev/null
eq "$(sql "select auto_publish_enabled from public.ai_settings")" "f" "8j: interruptor desligado ao fim (o seed permanece desligado)"

echo "== PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
