#!/usr/bin/env bash
# E2E da S07 (envio de lista) com agent-browser contra o build local da trilha 2.
# Pré-requisitos: `pnpm db:start && pnpm db:reset`; `.env.local` (só neste worktree) com as variáveis de `pnpm db:env`
# mais DEMO_PIPELINE=1, ALLOW_DEMO_IN_PRODUCTION=1 (build de produção local) e WORKER_SHARED_SECRET;
# `pnpm build && PORT=3002 pnpm start`; worker servido como em supabase/functions/ocr-worker/README.md
# (DEMO_SLOW_MS=6000). Segredo do worker em $SECRET_FILE (fora do repositório). Nada aqui contém chaves.
set -u
cd "$(dirname "$0")/.."
BASE=${BASE:-http://127.0.0.1:3002}
MAILPIT=${MAILPIT:-http://127.0.0.1:54524}
WORKER=${WORKER:-http://127.0.0.1:54521/functions/v1/ocr-worker}
SECRET_FILE=${SECRET_FILE:-/tmp/s07-worker-secret}
DB=${DB:-supabase_db_listacerta-t2}
OUT=docs/superpowers/e2e/screenshots
TMP=$(mktemp -d)
PASS=0; FAIL=0
export AGENT_BROWSER_SESSION_PREFIX=s07

for s in anon p o a dbg; do AGENT_BROWSER_SESSION="s07-$s" agent-browser close >/dev/null 2>&1; done   # sessões limpas (sem login anterior)
ab() { local s=$1; shift; AGENT_BROWSER_SESSION="s07-$s" agent-browser "$@"; }
sql() { docker exec "$DB" psql -U postgres -At -c "$1"; }
ok() { PASS=$((PASS+1)); echo "PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL  $1  ($2)"; }
expect_text() { # sessão, texto, descrição
  local t; t=$(ab "$1" get text body 2>/dev/null)
  if grep -qF -- "$2" <<<"$t"; then ok "$3"; else bad "$3" "esperava '$2'; veio: ${t:0:160}"; fi
}
expect_no_text() {
  local t; t=$(ab "$1" get text body 2>/dev/null)
  if grep -qF -- "$2" <<<"$t"; then bad "$3" "não deveria conter '$2'"; else ok "$3"; fi
}
wait_text() { # sessão, texto, segundos
  for _ in $(seq 1 "$3"); do ab "$1" get text body 2>/dev/null | grep -qF -- "$2" && return 0; sleep 1; done; return 1
}
last_id() { sql "select id from public.list_submissions order by created_at desc limit 1"; }

login() { # sessão, e-mail, next
  local s=$1 email=$2 next=$3 before after id link
  before=$(curl -s "$MAILPIT/api/v1/search?query=to:$email" | python3 -c "import sys,json;print(json.load(sys.stdin)['messages_count'])")
  ab "$s" open "$BASE/entrar?next=$next" >/dev/null
  ab "$s" fill '#email' "$email" >/dev/null
  ab "$s" press Enter >/dev/null   # (o primeiro button[type=submit] da página é o do Google)
  for _ in $(seq 1 20); do
    after=$(curl -s "$MAILPIT/api/v1/search?query=to:$email" | python3 -c "import sys,json;print(json.load(sys.stdin)['messages_count'])")
    [ "$after" -gt "$before" ] && break; sleep 1
  done
  id=$(curl -s "$MAILPIT/api/v1/search?query=to:$email" | python3 -c "import sys,json;print(json.load(sys.stdin)['messages'][0]['ID'])")
  link=$(curl -s "$MAILPIT/api/v1/message/$id" | python3 -c "import sys,json,re;print(re.findall(r'https?://[^\s\"<>]+', json.load(sys.stdin)['Text'])[0])")
  ab "$s" open "$link" >/dev/null
}

# --- arquivos de teste (gerados aqui) ---
printf '%%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%%%EOF\n' > "$TMP/lista-rapida.pdf"
cp "$TMP/lista-rapida.pdf" "$TMP/lista-lento.pdf"
cp "$TMP/lista-rapida.pdf" "$TMP/lista-falha.pdf"
{ printf '\211PNG\r\n\032\n'; head -c 400 /dev/zero; } > "$TMP/mentira.pdf"   # PNG com nome .pdf: Content-Type mentiroso
head -c 200 /dev/urandom > "$TMP/vazio-teste.bin"; : > "$TMP/zero.pdf"

fill_form() { # sessão, arquivo, grade
  wait_text "$1" "Enviar para revisão" 20   # espera sair do loading.tsx
  sleep 1
  for _ in 1 2 3 4 5 6; do   # o upload feito antes da hidratação se perde: repete até o nome aparecer
    ab "$1" upload '#file' "$2" >/dev/null
    ab "$1" get text '[data-testid=picked]' 2>/dev/null | grep -q . && break; sleep 1
  done
  ab "$1" select '#grade' "$3" >/dev/null
}
clickbtn() { # sessão, texto do botão (o seletor text= do agent-browser não achou botões de Server Action)
  ab "$1" eval "(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('$2')); if (!b) return 'sem-botao'; b.click(); return 'ok'; })()" >/dev/null
}
send() { ab "$1" click 'button[type=submit]' >/dev/null; }

echo "== a) anônimo em /enviar-lista e /escola/listas/nova"
ab anon set viewport 390 844 >/dev/null
ab anon open "$BASE/enviar-lista" >/dev/null
[[ $(ab anon get url) == *"/entrar?next=%2Fenviar-lista"* ]] && ok "anônimo em /enviar-lista vai ao login" || bad "anônimo redireciona" "$(ab anon get url)"
[[ $(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/submissions/5b1d4c2e-7d1a-4f0e-9a52-0c3f5e9a1b11/status") == 401 ]] && ok "anônimo na rota de status: 401" || bad "rota de status anônima" ""

echo "== b) parent: formulário (App15/App06)"
ab p set viewport 390 844 >/dev/null
login p parent@listacerta.test %2Fenviar-lista
[[ $(ab p get url) == "$BASE/enviar-lista" ]] && ok "parent logado chega em /enviar-lista" || bad "parent em /enviar-lista" "$(ab p get url)"
wait_text p "Enviar para revisão" 20; ab p screenshot "$OUT/S07-enviar-lista.png" >/dev/null
expect_text p "Sua lista passa por revisão antes de aparecer para outras famílias." "aviso de revisão visível"
expect_text p "Tirar foto" "botão Tirar foto"
[[ $(ab p get attr 'input[capture]' capture) == environment ]] && ok "input de foto usa capture=environment" || bad "capture" ""

echo "== c) sem consentimento -> bloqueado"
fill_form p "$TMP/lista-rapida.pdf" "5º ano"
send p; sleep 1
expect_text p "Marque o consentimento para enviar a lista." "sem consentimento: mensagem de bloqueio"
[[ -z $(sql "select id from public.list_submissions") ]] && ok "nada gravado sem consentimento" || bad "gravou sem consentimento" ""
[[ $(sql "select count(*) from public.consents") == 0 ]] && ok "nenhum consentimento gravado" || bad "consents" ""
ab p screenshot "$OUT/S07-sem-consentimento.png" >/dev/null

echo "== d) arquivo com Content-Type mentiroso (MZ como .pdf) -> erro do servidor"
ab p reload >/dev/null; fill_form p "$TMP/mentira.pdf" "5º ano"; ab p check 'input[name=consent]' >/dev/null
send p; wait_text p "não confere com o tipo" 15 && ok "assinatura divergente recusada com mensagem" || bad "arquivo mentiroso" "$(ab p get text body | head -c 200)"
[[ -z $(sql "select id from public.list_submissions") ]] && ok "arquivo inválido não grava envio" || bad "gravou envio inválido" ""
ab p screenshot "$OUT/S07-arquivo-invalido.png" >/dev/null

echo "== e) arquivo vazio (0 bytes) -> bloqueado no navegador"
ab p reload >/dev/null; fill_form p "$TMP/zero.pdf" "5º ano"; ab p check 'input[name=consent]' >/dev/null
send p; sleep 1; expect_text p "O arquivo está vazio" "0 bytes recusado"

echo "== f) envio rápido -> review_needed"
ab p reload >/dev/null; fill_form p "$TMP/lista-rapida.pdf" "5º ano"; ab p check 'input[name=consent]' >/dev/null
send p
wait_text p "Lista lida" 20 && ok "resultado rápido: 'Lista lida'" || bad "resultado rápido" "$(ab p get text body | head -c 200)"
expect_text p "Caderno (item de demonstração)" "itens do resumo vêm do resultado"
expect_text p "Demonstração" "selo Demonstração"
ab p screenshot "$OUT/S07-resultado.png" >/dev/null
FAST=$(last_id)
[[ $(sql "select status||'/'||is_demo from public.list_submissions where id='$FAST'") == "review_needed/true" ]] && ok "banco: review_needed e is_demo" || bad "estado no banco" ""
[[ $(sql "select count(*) from public.consents where purpose='list_upload' and revoked_at is null") == 1 ]] && ok "consentimento gravado (list_upload)" || bad "consent" ""

echo "== g) envio lento -> processing_async; worker conclui; painel muda sozinho"
ab p open "$BASE/enviar-lista" >/dev/null; fill_form p "$TMP/lista-lento.pdf" "5º ano"; ab p check 'input[name=consent]' >/dev/null
send p
wait_text p "Continuar aguardando" 40 && ok "estado assíncrono com 'continuar aguardando'" || bad "assíncrono" "$(ab p get text body | head -c 200)"
ab p screenshot "$OUT/S07-assincrono.png" >/dev/null
SLOW=$(last_id)
[[ $(sql "select status from public.list_submissions where id='$SLOW'") == processing_async ]] && ok "banco: processing_async" || bad "estado assíncrono no banco" "$(sql "select status from public.list_submissions where id='$SLOW'")"
[[ $(sql "select count(*) from public.jobs where submission_id='$SLOW'") == 1 ]] && ok "exatamente 1 job para o envio" || bad "jobs" ""
expect_text p "Ativar notificação do navegador" "opção de notificação do navegador"
clickbtn p "Continuar aguardando"; sleep 1
expect_text p "Seguimos aguardando" "continuar aguardando responde"
clickbtn p "Ativar notificação do navegador"; sleep 2
[[ $(sql "select notify_channel from public.jobs where submission_id='$SLOW'") == browser ]] && ok "notify_channel=browser registrado" || bad "notify browser" "$(sql "select notify_channel from public.jobs where submission_id='$SLOW'")"
ab p select '#notify-channel' whatsapp >/dev/null
ab p fill 'input[name=target]' "abc" >/dev/null
clickbtn p "Avisar por este canal"; sleep 2
expect_text p "Informe um WhatsApp com DDD." "destino inválido recusado (Zod)"
ab p select '#notify-channel' email >/dev/null
ab p fill 'input[name=target]' "pai@exemplo.com" >/dev/null
clickbtn p "Avisar por este canal"; sleep 2
[[ $(sql "select notify_channel||'/'||notify_target from public.jobs where submission_id='$SLOW'") == "email/pai@exemplo.com" ]] && ok "canal e-mail e notify_target gravados" || bad "notify email" ""
# o agendador (pg_cron) não roda no local: faz o papel dele
curl -s -m 60 -X POST -H "x-worker-secret: $(cat "$SECRET_FILE")" "$WORKER" | head -c 200; echo
wait_text p "Lista lida" 90 && ok "painel mudou sozinho para 'Lista lida' (polling)" || bad "polling" "$(ab p get text body | head -c 200)"
ab p screenshot "$OUT/S07-assincrono-pronto.png" >/dev/null
[[ $(sql "select status from public.list_submissions where id='$SLOW'") == review_needed ]] && ok "banco: review_needed após o worker" || bad "estado final" ""
[[ $(sql "select count(*) from public.ocr_jobs where submission_id='$SLOW'") == 1 ]] && ok "um único resultado (ocr_jobs)" || bad "ocr_jobs duplicado" ""

echo "== h) outro usuário não acessa o status (404)"
ab o set viewport 390 844 >/dev/null
login o outro@listacerta.test %2Fenviar-lista
CODE=$(ab o eval "fetch('/api/submissions/$SLOW/status').then(r=>r.status)" | tr -dc '0-9')
[[ $CODE == 404 ]] && ok "status de envio alheio: 404" || bad "status alheio" "$CODE"
CODE=$(ab p eval "fetch('/api/submissions/$SLOW/status').then(r=>r.status)" | tr -dc '0-9')
[[ $CODE == 200 ]] && ok "dono lê o próprio status: 200" || bad "status do dono" "$CODE"
ab o open "$BASE/enviar-lista/$SLOW" >/dev/null
expect_text o "Esta página não está na lista" "painel de envio alheio: 404 da marca"
ab o screenshot "$OUT/S07-status-alheio-404.png" >/dev/null

echo "== i) falha do pipeline -> erro"
ab p open "$BASE/enviar-lista" >/dev/null; fill_form p "$TMP/lista-falha.pdf" "5º ano"; ab p check 'input[name=consent]' >/dev/null
send p
wait_text p "Não foi possível ler este arquivo" 30 && ok "falha do pipeline mostra erro" || bad "falha" "$(ab p get text body | head -c 200)"
ab p screenshot "$OUT/S07-erro.png" >/dev/null
FAILID=$(last_id)
[[ $(sql "select status from public.list_submissions where id='$FAILID'") == rejected ]] && ok "banco: rejected" || bad "estado rejected" ""

echo "== j) escola (desktop 1280x800): parent bloqueado, admin envia"
[[ $(ab p eval "fetch('/escola/listas/nova?escola=5b1d4c2e-7d1a-4f0e-9a52-0c3f5e9a1b11').then(r=>r.status)" | tr -dc '0-9') == 403 ]] && ok "parent em /escola/listas/nova: 403" || bad "parent na área da escola" ""
ab a set viewport 1280 800 >/dev/null
login a admin@listacerta.test %2Fescola%2Flistas%2Fnova%3Fescola%3D5b1d4c2e-7d1a-4f0e-9a52-0c3f5e9a1b11
ab a open "$BASE/escola/listas/nova?escola=5b1d4c2e-7d1a-4f0e-9a52-0c3f5e9a1b11" >/dev/null
expect_text a "Enviar PDF da lista" "Escola08: título"
expect_text a "Para a leitura sair certa" "Escola08: dicas"
ab a screenshot "$OUT/S07-escola-upload.png" >/dev/null
ab a open "$BASE/escola/listas/nova" >/dev/null
expect_text a "Esta página não está na lista" "sem ?escola válido: 404"
ab a open "$BASE/escola/listas/nova?escola=5b1d4c2e-7d1a-4f0e-9a52-0c3f5e9a1b11" >/dev/null
fill_form a "$TMP/lista-rapida.pdf" "5º ano"; ab a check 'input[name=consent]' >/dev/null
ab a screenshot "$OUT/S07-escola-arquivo.png" >/dev/null
send a
wait_text a "Lista lida" 20 && ok "escola: envio conclui" || bad "envio da escola" "$(ab a get text body | head -c 200)"
[[ $(sql "select source||'/'||(school_id is not null) from public.list_submissions order by created_at desc limit 1") == "school/true" ]] && ok "banco: origem school com school_id" || bad "origem school" ""

echo "== k) sem pipeline configurado (servidor reiniciado com DEMO_PIPELINE=0 e sem WORKER_SHARED_SECRET: ninguém processa)"
pkill -f next-server; sleep 2
( DEMO_PIPELINE=0 WORKER_SHARED_SECRET= PORT=3002 nohup pnpm start > /tmp/s07-next-nopipe.log 2>&1 & ); sleep 6
ab p open "$BASE/enviar-lista" >/dev/null; fill_form p "$TMP/lista-rapida.pdf" "5º ano"; ab p check 'input[name=consent]' >/dev/null
send p
wait_text p "Leitura automática indisponível no momento" 30 && ok "sem pipeline: 'leitura automática indisponível no momento'" || bad "sem pipeline" "$(ab p get text body | head -c 200)"
expect_no_text p "Caderno" "sem pipeline: nenhum item inventado"
ab p screenshot "$OUT/S07-indisponivel.png" >/dev/null
NOPIPE=$(last_id)
[[ $(sql "select status||'/'||is_demo from public.list_submissions where id='$NOPIPE'") == "processing_async/false" ]] && ok "banco: processing_async, sem is_demo" || bad "estado sem pipeline" ""
[[ $(sql "select count(*) from public.ocr_jobs where submission_id='$NOPIPE'") == 0 ]] && ok "nenhum resultado inventado (ocr_jobs vazio)" || bad "ocr_jobs sem pipeline" ""

echo; echo "RESULTADO: $PASS ok, $FAIL falhas"
for s in anon p o a; do AGENT_BROWSER_SESSION="s07-$s" agent-browser close >/dev/null 2>&1; done
rm -rf "$TMP"
[ "$FAIL" -eq 0 ]
