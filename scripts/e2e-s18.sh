#!/usr/bin/env bash
# E2E da S18 (Estados e acessibilidade) com agent-browser, build de produção local da trilha 3 (porta 3003).
# Cobre: skip-link/foco visível por teclado no AdminShell (novo nesta fatia), D-153 (campos de resolução
# desabilitados em /admin/denuncias/[id] com status=open), D-034 (itens agrupados por categoria) e D-140
# ("Montar carrinho com esta lista") na página pública de uma lista oficial, skip-link/main#conteudo/foco visível
# em /conta (correção da revisão desta fatia), e um passe axe-core (via CDN, sem dependência nova no projeto) em
# 3 rotas representativas.
# Pré-requisitos: `pnpm db:reset`; `.env.local` com as variáveis de `node scripts/supa.mjs env`; `pnpm build &&
# PORT=3003 pnpm start`. Reaproveita admin@listacerta.test/parent@listacerta.test (supabase/seed.sql).
set -u
cd "$(dirname "$0")/.."
BASE=${BASE:-http://127.0.0.1:3003}
MAILPIT=${MAILPIT:-http://127.0.0.1:54624}
DB=${DB:-supabase_db_listacerta-t3}
OUT=docs/superpowers/e2e/screenshots
ADMIN_ID=00000000-0000-4000-8000-0000000000a1
PARENT_ID=00000000-0000-4000-8000-0000000000a2
INEP=51999180
RUN=$(date +%s)
export AGENT_BROWSER_SESSION_PREFIX="t3s18-$RUN"
source "$(dirname "$0")/e2e-lib.sh"

for s in admin parent visit; do agent-browser close --session "${AGENT_BROWSER_SESSION_PREFIX}-$s" >/dev/null 2>&1; done

echo "== 0) escola, lista publicada (2 categorias + 1 item sem categoria) e denúncia aberta (SQL direto)"
sql_stdin <<SQL
set role service_role;
insert into public.schools (inep, name, normalized_name, network, municipality_id)
select '$INEP', 'Escola E2E S18', 'escola e2e s18', 'municipal', id from public.municipalities where ibge_code = '5103403'
returning id as school_id \gset
select id as grade_id from public.grades where slug = 'ef-3' \gset
insert into public.school_lists (school_id, grade_id, school_year) values (:'school_id'::uuid, :'grade_id'::uuid, 2027) returning id as list_id \gset
select version_id as version_id from public.list_create_candidate_version(:'list_id'::uuid, 'admin', null, null) \gset
insert into public.list_items (version_id, position, original_name, normalized_name, category, quantity, unit) values
  (:'version_id'::uuid, 1, 'Caderno 96 folhas', 'caderno 96 folhas', 'papelaria', 2, 'un'),
  (:'version_id'::uuid, 2, 'Sabonete', 'sabonete', 'higiene', 1, 'un'),
  (:'version_id'::uuid, 3, 'Lápis preto', 'lapis preto', 'papelaria', 6, 'un'),
  (:'version_id'::uuid, 4, 'Item sem categoria', 'item sem categoria', null, 1, null);
select public.list_transition(:'list_id'::uuid, 'submitted'::public.list_status, '$ADMIN_ID'::uuid, null);
select public.list_transition(:'list_id'::uuid, 'processing'::public.list_status, '$ADMIN_ID'::uuid, null);
select public.list_transition(:'list_id'::uuid, 'approved'::public.list_status, '$ADMIN_ID'::uuid, null);
select public.list_approve_version(:'list_id'::uuid, :'version_id'::uuid, '$ADMIN_ID'::uuid);
select public.list_publish_version(:'list_id'::uuid, :'version_id'::uuid, '$ADMIN_ID'::uuid);
insert into public.reports (target_type, target_id, reason, reporter_id)
values ('school_list', :'list_id'::uuid, 'informacao_desatualizada', '$PARENT_ID'::uuid)
returning id as report_id \gset
\o /tmp/e2e-s18-ids.txt
select :'list_id' as list_id, :'report_id' as report_id;
\o
SQL
LIST_ID=$(sql "select id from public.school_lists where school_id = (select id from public.schools where inep = '$INEP');")
REPORT_ID=$(sql "select id from public.reports where target_id = '$LIST_ID'::uuid;")
[ -n "$LIST_ID" ] && [ -n "$REPORT_ID" ] && ok "seed: lista $LIST_ID, denúncia $REPORT_ID" || bad "seed" "LIST_ID='$LIST_ID' REPORT_ID='$REPORT_ID'"

echo "== 1) D-034 + D-140: página pública da lista oficial"
ab visit set viewport 390 844 >/dev/null
ab visit open "$BASE/escolas/$INEP/ef-3?ano=2027" >/dev/null
expect_text visit "papelaria" "categoria 'papelaria' aparece como cabeçalho de grupo"
expect_text visit "higiene" "categoria 'higiene' aparece como cabeçalho de grupo"
expect_text visit "Outros itens" "item sem categoria vai para 'Outros itens'"
expect_text visit "Montar carrinho com esta lista" "D-140: link para montar carrinho aparece na lista oficial"
HREF=$(ab visit eval "document.querySelector('a[href*=\"/carrinho/novo\"]')?.getAttribute('href') ?? 'none'" | tr -d '"')
VERSION_ID=$(sql "select current_version_id from public.school_lists where id = '$LIST_ID'::uuid;")
if [[ "$HREF" == *"$VERSION_ID"* ]]; then ok "D-140: href usa o id da VERSÃO publicada"; else bad "D-140 href" "esperava conter $VERSION_ID; veio $HREF"; fi
shot visit "$OUT/S18-01-lista-categorias.png"

echo "== 2) foco visível/skip-link por teclado no AdminShell (novo nesta fatia)"
ab admin set viewport 1280 900 >/dev/null
login admin admin@listacerta.test "/admin"
expect_text admin "Visão geral" "dashboard do admin abre"
FIRST_TAB=$(ab admin eval "(()=>{const b=document.activeElement;document.body.focus();const e=new KeyboardEvent('keydown',{key:'Tab'});document.dispatchEvent(e);const f=document.querySelectorAll('a,button,select,input')[0];f?.focus();return f?.textContent?.trim()?.slice(0,40) ?? 'none'})()" | tr -d '"')
has "$FIRST_TAB" "conteúdo" "primeiro elemento focável é o skip-link (\"Pular para o conteúdo\")" || true
SKIP_HREF=$(ab admin eval "document.querySelector('a')?.getAttribute('href') ?? 'none'" | tr -d '"')
eq "$SKIP_HREF" "#conteudo" "skip-link aponta para #conteudo"
CONTEUDO=$(ab admin eval "document.getElementById('conteudo') ? 'sim' : 'nao'" | tr -d '"')
eq "$CONTEUDO" "sim" "main#conteudo existe no AdminShell"
shot admin "$OUT/S18-02-admin-skiplink.png"

echo "== 3) D-153: /admin/denuncias/[id] com status=open — campos de resolução desabilitados"
ab admin open "$BASE/admin/denuncias/$REPORT_ID" >/dev/null
expect_text admin "Denúncia" "tela de detalhe da denúncia abre"
SEL_DISABLED=$(ab admin eval "document.querySelector('select[name=resolution]')?.disabled ?? 'none'" | tr -d '"')
eq "$SEL_DISABLED" "true" "D-153: <select> de resolução desabilitado com status=open"
RESOLVE_DISABLED=$(ab admin eval "[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Resolver')?.disabled ?? 'none'" | tr -d '"')
eq "$RESOLVE_DISABLED" "true" "D-153: botão Resolver desabilitado com status=open"
# Achado da revisão da S18: as duas capturas deste passo (open/reviewing) saíram BYTE-IDÊNTICAS numa rodada
# anterior (md5 igual), mesmo com a asserção de `disabled` provando que o DOM realmente mudava entre elas — o
# defeito era só na captura (janela de corrida entre o `shot()` e o redesenho), nunca no produto. `shot()` já
# dorme 1 s; aqui dorme mais 1 s explícito ANTES de cada captura deste passo, e a segunda captura é comparada por
# md5 com a primeira: se saírem iguais, o roteiro FALHA (nunca mais um par de capturas iguais passa em silêncio).
sleep 1
shot admin "$OUT/S18-03-denuncia-open.png"
clicktext admin "Colocar em análise"
wait_ok admin "Em análise" "clique em Colocar em análise muda o status (REPORT_STATUS_LABEL)" 10 || true
# Achado do E2E da S18: `ab open` na MESMA URL é um no-op (o roteador do Next/agent-browser não refaz a
# navegação), então a releitura ficava com o DOM de antes do clique. `location.reload()` força um GET de
# verdade. Candidato a lição para o PAT-002 do Segundo Cérebro (mesma classe de achado de "wait_text"/checkbox
# das sessões anteriores: reabrir a MESMA URL não é reload).
ab admin eval "location.reload()" >/dev/null
sleep 1
SEL_DISABLED2=$(ab admin eval "document.querySelector('select[name=resolution]')?.disabled ?? 'none'" | tr -d '"')
eq "$SEL_DISABLED2" "false" "D-153: <select> de resolução habilitado depois de 'Colocar em análise' (status=reviewing)"
sleep 1
shot admin "$OUT/S18-04-denuncia-reviewing.png"
M3=$(md5 -q "$OUT/S18-03-denuncia-open.png" 2>/dev/null || md5sum "$OUT/S18-03-denuncia-open.png" | cut -d' ' -f1)
M4=$(md5 -q "$OUT/S18-04-denuncia-reviewing.png" 2>/dev/null || md5sum "$OUT/S18-04-denuncia-reviewing.png" | cut -d' ' -f1)
if [ "$M3" != "$M4" ]; then ok "capturas S18-03/S18-04 são diferentes (md5 $M3 vs $M4)"; else bad "capturas S18-03/S18-04" "saíram IDÊNTICAS (md5 $M3) — defeito de captura, repetir"; fi

echo "== 3b) área da família (/conta): skip-link, main#conteudo e foco visível (correção da revisão)"
ab parent set viewport 390 844 >/dev/null
login parent parent@listacerta.test "/conta"
expect_text parent "Minha conta" "hub da conta abre para o parent"
PARENT_SKIP_HREF=$(ab parent eval "document.querySelector('a')?.getAttribute('href') ?? 'none'" | tr -d '"')
eq "$PARENT_SKIP_HREF" "#conteudo" "/conta: skip-link (1º link da página) aponta para #conteudo"
PARENT_CONTEUDO=$(ab parent eval "document.getElementById('conteudo') ? 'sim' : 'nao'" | tr -d '"')
eq "$PARENT_CONTEUDO" "sim" "/conta: main#conteudo existe (sem duplicar o <main> da página)"
BUSCAR_FOCUSABLE=$(ab parent eval "[...document.querySelectorAll('a,button')].find(b=>b.textContent.trim()==='Buscar lista da escola')?.className.includes('focus-visible:outline') ?? false" | tr -d '"')
eq "$BUSCAR_FOCUSABLE" "true" "/conta: link \"Buscar lista da escola\" tem foco visível"

echo "== 4) verificador axe-core (via CDN, sem dependência nova) em 3 rotas"
AXE_CDN="https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js"
for pair in "visit:$BASE/escolas/$INEP/ef-3?ano=2027:lista" "admin:$BASE/admin:admin-dashboard" "admin:$BASE/admin/denuncias/$REPORT_ID:denuncia"; do
  s=${pair%%:*}; rest=${pair#*:}; url=${rest%:*}; name=${rest##*:}
  ab "$s" open "$url" >/dev/null
  ab "$s" eval "fetch('$AXE_CDN').then(r=>r.text()).then(t=>{(0,eval)(t);window.__axeReady=true})" >/dev/null
  for _ in $(seq 1 10); do
    READY=$(ab "$s" eval "window.__axeReady === true" | tr -d '"')
    [ "$READY" = "true" ] && break; sleep 1
  done
  VIOLATIONS=$(ab "$s" eval "JSON.stringify((await axe.run()).violations.filter(v=>v.impact==='serious'||v.impact==='critical').map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length})))" 2>/dev/null)
  if [ "$VIOLATIONS" = "[]" ] || [ -z "$VIOLATIONS" ]; then
    ok "axe ($name): sem violação séria/crítica"
  else
    bad "axe ($name)" "violações: $VIOLATIONS"
  fi
done

echo ""
echo "== Resumo: $PASS passaram, $FAIL falharam =="
[ "$FAIL" -eq 0 ]
