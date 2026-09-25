#!/usr/bin/env bash
# E2E da S06 (reivindicação de escola) com agent-browser contra o build local da trilha 1. Só dados demonstrativos.
# Pré-requisitos: `pnpm db:reset`; `.env.local` (só neste worktree, ignorado pelo git) com `node scripts/supa.mjs env` + APP_ENV=local;
# `pnpm import:inep tests/fixtures/inep-demo.csv --demo`; `pnpm seed:demo-claims`; `pnpm build && PORT=3001 pnpm start`.
# FASE 1: servidor SEM DEMO_CLAIM_DELIVERY (métodos por token "indisponíveis"). FASE 2: reinicie com `DEMO_CLAIM_DELIVERY=1 PORT=3001 pnpm start`
# e com o log em $SERVER_LOG (o link/código de demonstração é impresso lá). Uso: PHASE=1 scripts/e2e-s06.sh ; PHASE=2 scripts/e2e-s06.sh
set -u
cd "$(dirname "$0")/.."
BASE=${BASE:-http://127.0.0.1:3001}
MAILPIT=${MAILPIT:-http://127.0.0.1:54424}
DB=${DB:-supabase_db_listacerta-t1}
SERVER_LOG=${SERVER_LOG:-/tmp/t1-s06-server.log}
PHASE=${PHASE:-1}
OUT=docs/superpowers/e2e/screenshots
PDF=tests/fixtures/claim-evidence-demo.pdf
PASS=0; FAIL=0
S=t1s06
for s in anon p a; do AGENT_BROWSER_SESSION="$S-$s" agent-browser close >/dev/null 2>&1; done
ab() { local s=$1; shift; AGENT_BROWSER_SESSION="$S-$s" agent-browser "$@"; }
sql() { docker exec "$DB" psql -U postgres -At -c "$1"; }
ok() { PASS=$((PASS+1)); echo "PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL  $1  ($2)"; }
expect_text() { local t; t=$(ab "$1" get text body 2>/dev/null); if grep -qF -- "$2" <<<"$t"; then ok "$3"; else bad "$3" "esperava '$2'; veio: ${t:0:200}"; fi; }
expect_no_text() { local t; t=$(ab "$1" get text body 2>/dev/null); if grep -qF -- "$2" <<<"$t"; then bad "$3" "não deveria conter '$2'"; else ok "$3"; fi; }
expect_eq() { if [ "$1" = "$2" ]; then ok "$3"; else bad "$3" "esperava '$2'; veio '$1'"; fi; }
wait_status() { for _ in $(seq 1 "$3"); do [ "$(cstatus "$1")" = "$2" ] && return 0; sleep 1; done; return 1; }
wait_text() { for _ in $(seq 1 "$3"); do ab "$1" get text body 2>/dev/null | grep -qF -- "$2" && return 0; sleep 1; done; return 1; }
clickbtn() { ab "$1" eval "(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('$2') && !x.disabled); if (!b) return 'sem-botao'; b.click(); return 'ok'; })()" >/dev/null; }
clicklink() { ab "$1" eval "(() => { const a = [...document.querySelectorAll('a')].find(x => x.textContent.includes('$2')); if (!a) return 'sem-link'; a.click(); return 'ok'; })()" >/dev/null; }
shot() { ab "$1" screenshot "$OUT/S06-$2.png" >/dev/null 2>&1; }
open() { ab "$1" open "$BASE$2" >/dev/null; sleep 1.5; }
uid() { sql "select id from public.claims c where school_id=(select id from public.schools where inep='$1') order by created_at desc limit 1"; }
cstatus() { sql "select status from public.claims where school_id=(select id from public.schools where inep='$1') order by created_at desc limit 1"; }
sstatus() { sql "select verification_status from public.schools where inep='$1'"; }
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
  ab "$s" open "$link" >/dev/null; sleep 2
}
fill_claim() { # sessão, nome, cargo
  ab "$1" fill '[name=claimantName]' "$2" >/dev/null
  ab "$1" fill '[name=claimantRoleTitle]' "$3" >/dev/null
  ab "$1" check '[name=privacyAck]' >/dev/null
}
add_file() { # sessão: injeta o PDF fictício por DataTransfer (o `upload` do agent-browser trava o renderer neste input)
  local b64; b64=$(base64 < "$PDF" | tr -d '\n')
  for _ in 1 2 3 4 5; do
    ab "$1" eval "(() => { const bin=atob('$b64'); const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i); const dt=new DataTransfer(); dt.items.add(new File([u],'comprovante-demo.pdf',{type:'application/pdf'})); const i=document.querySelector('input[type=file]'); i.files=dt.files; return i.files.length; })()" >/dev/null
    clickbtn "$1" "Adicionar arquivo"; sleep 2.5
    ab "$1" get text body | grep -q "Arquivos (0/5)" || return 0
  done
}
leak_check() { # sessão, rótulo [padrão]: HTML e RSC da página atual sem contato da escola nem decided_by (o telefone público do perfil é da S04)
  local html rsc pat=${3:-"demo1@exemplo|33330001|3333-0001|999990003|decided_by|actor_id|storage_path"}
  html=$(ab "$1" eval "document.documentElement.outerHTML" 2>/dev/null)
  rsc=$(ab "$1" eval "fetch(location.href,{headers:{RSC:'1'}}).then(r=>r.text())" 2>/dev/null)
  if grep -qiE "$pat" <<<"$html$rsc"; then bad "$2: sem contato da escola/decided_by no HTML e no RSC" "achou termo proibido"; else ok "$2: sem contato da escola/decided_by no HTML e no RSC"; fi
}

if [ "$PHASE" = 1 ]; then
echo "== a) anônimo"
ab anon set viewport 390 844 >/dev/null
open anon /escolas/99001001
expect_text anon "Você trabalha nesta escola?" "perfil demo mostra o bloco (estado 1) sem sessão"
expect_text anon "Demonstração" "perfil demo tem o selo Demonstração"
shot anon 01-bloco-estado1
open anon /escolas/99001001/reivindicar
expect_eq "$(ab anon get url | sed 's|.*/entrar|/entrar|;s|%2F|/|g')" "/entrar?next=/escolas/99001001/reivindicar" "anônimo em /reivindicar vai ao login"
open anon /escolas/99009999/reivindicar
expect_text anon "Escola não encontrada" "INEP inexistente = 404 da marca"

echo "== b) parent: formulário (método indisponível), documentos, envio"
ab p set viewport 1280 800 >/dev/null
login p parent@listacerta.test %2Fescolas%2F99001001%2Freivindicar
expect_text p "ENCONTRADA NO CADASTRO DO INEP" "passo Escola: rótulo INEP (maiúsculas por CSS)"
expect_no_text p "Escola verificada" "nunca diz verificada na Escola01"
expect_text p "Indisponível: Envio indisponível no momento." "e-mail indisponível sem sender"
expect_text p "Indisponível: A escola não tem celular registrado" "WhatsApp indisponível: sem celular"
expect_text p "Você entra como parent@listacerta.test" "e-mail da sessão"
shot p 02-formulario
leak_check p "formulário"
fill_claim p "Ana Demonstração" "Secretária"
ab p fill '[name=evidenceNote]' "Trabalho na secretaria desta escola fictícia." >/dev/null
clickbtn p "Continuar"; wait_text p "Adicionar arquivo" 15
expect_eq "$(cstatus 99001001)" "submitted" "claim criada em submitted"
expect_text p "Não envie documentos com dados de alunos." "aviso de dados de alunos"
clickbtn p "Enviar para análise"; sleep 2
expect_text p "Adicione ao menos um arquivo." "enviar sem arquivo fica desabilitado com motivo"
add_file p
expect_text p "comprovante" "arquivo listado" || true
expect_eq "$(sql "select count(*) from public.claim_evidence where claim_id='$(uid 99001001)'")" "1" "1 evidência no banco"
shot p 03-documentos
clickbtn p "Enviar para análise"; wait_status 99001001 awaiting_verification 15
expect_eq "$(cstatus 99001001)" "awaiting_verification" "status awaiting_verification"
expect_eq "$(sstatus 99001001)" "claimed" "escola vira claimed"
expect_text p "Decisão da equipe ListaCerta" "timeline com passo aberto"
expect_no_text p "[prazo]" "sem prazo inventado"
shot p 04-em-analise
leak_check p "status"
ab p set viewport 390 844 >/dev/null
open p /escolas/99001001
expect_text p "Reivindicação em análise" "bloco estado 3"
expect_text p "Reivindicada" "perfil com selo reivindicada"
shot p 05-bloco-estado3
leak_check p "perfil (logado)" "demo1@exemplo|decided_by|actor_id|storage_path"
open p /escolas/99001003
expect_text p "Reivindicação recusada" "bloco estado 4 (seed)"
expect_text p "Motivo: Demonstração: o documento enviado" "estado 4 traz o motivo real"
shot p 06-bloco-estado4

echo "== c) parent sem acesso ao admin; /escola ainda 403 (papel parent)"
open p /admin/reivindicacoes
expect_eq "$(ab p eval "fetch('/admin/reivindicacoes').then(r=>r.status)")" "403" "parent em /admin/reivindicacoes = HTTP 403"
expect_eq "$(ab p eval "fetch('/escola').then(r=>r.status)")" "403" "parent (papel parent) em /escola = HTTP 403 até a aprovação"

echo "== d) admin: fila, evidência assinada, aprovação"
ab a set viewport 1280 800 >/dev/null
login a admin@listacerta.test %2Fadmin%2Freivindicacoes
expect_text a "Pendentes (2)" "aba Pendentes com a contagem do banco"
expect_text a "Escola Demonstração 1" "fila lista o pedido do parent"
expect_text a "Escola sem admin" "selo sem admin"
expect_text a "Demonstração" "selo Demonstração"
shot a 07-fila-admin
leak_check a "fila"
open a "/admin/reivindicacoes/$(uid 99001001)"
expect_text a "Abrir (link de 60 s)" "evidência com link assinado"
expect_text a "Aprovar" "botão aprovar"
shot a 08-detalhe-admin
clicklink a "Abrir (link de 60 s)"; sleep 2
ab a get url | grep -q "/storage/v1/object/sign/claim-evidence/" && ok "evidência abre por URL assinada do Storage" || bad "URL assinada" "$(ab a get url)"
open a "/admin/reivindicacoes/$(uid 99001001)"
clickbtn a "Aprovar"; wait_text a "Reivindicação aprovada." 15
expect_eq "$(cstatus 99001001)" "approved" "claim approved"
expect_eq "$(sstatus 99001001)" "verified" "escola verified"
expect_eq "$(sql "select role from public.profiles where id=(select claimant_id from public.claims where id='$(uid 99001001)')")" "school_member" "parent promovido a school_member"
expect_eq "$(sql "select count(*) from public.school_members where claim_id='$(uid 99001001)' and member_role='owner'")" "1" "vínculo owner criado"
open a /admin/reivindicacoes
expect_text a "Pendentes (1)" "pendentes cai para 1"
ab a set viewport 390 844 >/dev/null
open anon /escolas/99001001
expect_text anon "Escola verificada" "perfil público mostra Escola verificada"
expect_text anon "Esta escola já tem administrador" "bloco estado 2"
[ "$(ab anon eval "document.querySelectorAll('section[data-claim-state] a').length")" = "0" ] && ok "estado 2 sem botão" || bad "estado 2 sem botão" ""
shot anon 09-verificada-estado2

echo "== e) parent vê Escola03; pedir mais evidências -> reenvio -> recusa com motivo"
ab p set viewport 1280 800 >/dev/null
open p /escola
expect_text p "Escola Demonstração 1" "Escola03 lista a escola vinculada"
expect_text p "Verificada" "Escola03 mostra a situação real"
expect_text p "Motivo: Demonstração: o documento enviado" "Escola03 mostra reivindicação recusada com motivo"
shot p 10-minhas-escolas
ab a set viewport 1280 800 >/dev/null
open a "/admin/reivindicacoes/$(uid 99001002)"
ab a fill 'form:nth-of-type(2) textarea' "x" >/dev/null 2>&1 || true
ab a eval "(() => { const f=[...document.querySelectorAll('form')].find(f=>f.querySelector('[name=to][value=insufficient_evidence]')); const t=f.querySelector('textarea'); const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; set.call(t,'Falta o cargo no documento.'); t.dispatchEvent(new Event('input',{bubbles:true})); return 'ok'; })()" >/dev/null
clickbtn a "Pedir mais evidências"; wait_text a "Mais evidências solicitadas." 15
expect_eq "$(cstatus 99001002)" "insufficient_evidence" "claim insufficient_evidence"
open p /escolas/99001002/reivindicar
expect_text p "Precisa de mais evidências" "parent vê o estado"
expect_text p "Motivo: Falta o cargo no documento." "parent vê o motivo"
shot p 11-mais-evidencias
add_file p
ab p eval "(() => { const t=document.querySelector('textarea[name=evidenceNote]'); const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; set.call(t,'Cargo: secretária, contratada em 2020 (fictício).'); t.dispatchEvent(new Event('input',{bubbles:true})); return 'ok'; })()" >/dev/null
clickbtn p "Enviar para análise"; wait_status 99001002 awaiting_verification 15
expect_eq "$(cstatus 99001002)" "awaiting_verification" "reenvio volta a awaiting_verification"
open a "/admin/reivindicacoes/$(uid 99001002)"
ab a eval "(() => { const f=[...document.querySelectorAll('form')].find(f=>f.querySelector('[name=to][value=rejected]')); const t=f.querySelector('textarea'); const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; set.call(t,'Documento sem relação com a escola (demonstração).'); t.dispatchEvent(new Event('input',{bubbles:true})); return 'ok'; })()" >/dev/null
clickbtn a "Recusar"; wait_text a "Reivindicação recusada." 15
expect_eq "$(cstatus 99001002)" "rejected" "claim rejected"
expect_eq "$(sstatus 99001002)" "registered" "escola volta a registered"
ab p set viewport 390 844 >/dev/null
open p /escolas/99001002
expect_text p "Motivo: Documento sem relação com a escola (demonstração)." "bloco estado 4 com o motivo da recusa"
echo "== resultado fase 1: $PASS ok, $FAIL falhas"
exit $FAIL
fi

echo "== FASE 2 (DEMO_CLAIM_DELIVERY=1): WhatsApp e e-mail por token de console"
ab p set viewport 1280 800 >/dev/null
ab a set viewport 1280 800 >/dev/null
login p parent@listacerta.test %2Fescolas%2F99001003%2Freivindicar%3Fnova%3D1
expect_no_text p "Indisponível: Envio indisponível" "com sender de demo o método por token fica disponível"
ab p check 'input[value=institutional_whatsapp]' >/dev/null
fill_claim p "Ana Demonstração" "Coordenadora"
clickbtn p "Continuar"; wait_text p "Enviar código para o WhatsApp da escola registrado no INEP" 15
expect_eq "$(cstatus 99001003)" "submitted" "nova claim (WhatsApp) em submitted"
clickbtn p "Enviar código"; wait_text p "Enviamos o código" 15
CODE=$(grep -o "código de reivindicação (99001003): [0-9]*" "$SERVER_LOG" | tail -1 | grep -o "[0-9]*$")
[ -n "$CODE" ] && ok "código impresso no log do servidor (demo)" || bad "código no log" "vazio"
ab p fill 'input[name=code]' "000000" >/dev/null; clickbtn p "Confirmar código"; wait_text p "Link ou código inválido" 15 && ok "código errado recusado com texto fixo" || bad "código errado" ""
ab p fill 'input[name=code]' "$CODE" >/dev/null; clickbtn p "Confirmar código"; wait_text p "Canal confirmado" 15
expect_eq "$(sql "select channel_confirmed_at is not null from public.claims where id='$(uid 99001003)'")" "t" "canal WhatsApp confirmado"
shot p 12-token-confirmado
leak_check p "token WhatsApp"
# a mesma escola (99001003 é a única demo com e-mail e celular): a equipe recusa e o parent reivindica de novo por e-mail
login a admin@listacerta.test %2Fadmin%2Freivindicacoes
expect_text a "Canal confirmado em" "fila mostra o canal WhatsApp confirmado"
shot a 14-fila-canal-confirmado
open a "/admin/reivindicacoes/$(uid 99001003)"
ab a eval "(() => { const f=[...document.querySelectorAll('form')].find(f=>f.querySelector('[name=to][value=rejected]')); const t=f.querySelector('textarea'); const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; set.call(t,'Recusa de demonstração para reiniciar pelo e-mail.'); t.dispatchEvent(new Event('input',{bubbles:true})); return 'ok'; })()" >/dev/null
clickbtn a "Recusar"; wait_status 99001003 rejected 15
expect_eq "$(cstatus 99001003)" "rejected" "equipe recusa a claim por WhatsApp"
open p "/escolas/99001003/reivindicar?nova=1"
ab p check 'input[value=institutional_email]' >/dev/null
fill_claim p "Ana Demonstração" "Secretária"
clickbtn p "Continuar"; wait_text p "Enviar link para o e-mail da escola registrado no INEP" 15
clickbtn p "Enviar link"; wait_text p "Enviamos o link" 15
LINK=$(grep -o "http[^ ]*/escolas/99001003/reivindicar/confirmar?token=[A-Za-z0-9_-]*" "$SERVER_LOG" | tail -1)
[ -n "$LINK" ] && ok "link impresso no log do servidor (demo)" || bad "link no log" "vazio"
ab p open "$LINK" >/dev/null; sleep 2
expect_text p "Confirmar e-mail da escola" "GET mostra o botão"
expect_eq "$(sql "select channel_confirmed_at is null from public.claims where id='$(uid 99001003)'")" "t" "GET do link NÃO consome o token"
shot p 13-confirmar-email
clickbtn p "Confirmar e-mail da escola"; wait_text p "Canal confirmado" 15
expect_eq "$(sql "select channel_confirmed_at is not null from public.claims where id='$(uid 99001003)'")" "t" "POST confirma o canal por e-mail"
ab p open "$LINK" >/dev/null; sleep 1.5; clickbtn p "Confirmar e-mail da escola"; wait_text p "já foi confirmado" 15 && ok "reuso do link: já confirmado" || bad "reuso do link" ""
echo "== resultado fase 2: $PASS ok, $FAIL falhas"
exit $FAIL
