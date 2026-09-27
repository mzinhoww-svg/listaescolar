#!/usr/bin/env bash
# E2E da S15 (área da família) com agent-browser contra o build local da trilha 3.
# Pré-requisitos: `pnpm db:reset` (banco limpo); `.env.local` (só neste worktree, não versionado) com as variáveis
# de `pnpm db:env`; `pnpm build && PORT=3003 pnpm start`. Reaproveita o responsável real do seed padrão
# (parent@listacerta.test). Uma escola e uma lista publicada (real, não `is_demo`) são criadas por SQL direto
# (mesmo padrão de outras fatias): a S15 não cria escola nem lista, só consome o que já existe.
set -u
cd "$(dirname "$0")/.."
BASE=${BASE:-http://127.0.0.1:3003}
MAILPIT=${MAILPIT:-http://127.0.0.1:54624}
DB=${DB:-supabase_db_listacerta-t3}
OUT=docs/superpowers/e2e/screenshots
INEP=51999150
PASS=0; FAIL=0
RUN=$(date +%s)
export AGENT_BROWSER_SESSION_PREFIX=t3s15
for s in parent; do AGENT_BROWSER_SESSION="t3s15-$RUN-$s" agent-browser close >/dev/null 2>&1; done
ab() { local s=$1; shift; AGENT_BROWSER_SESSION="t3s15-$RUN-$s" agent-browser "$@"; }
sql() { docker exec "$DB" psql -U postgres -Atq -c "$1"; }
sql_stdin() { docker exec -i "$DB" psql -U postgres -At -v ON_ERROR_STOP=1; }
ok() { PASS=$((PASS+1)); echo "PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL  $1  ($2)"; }
expect_text() { local t; t=$(ab "$1" get text body 2>/dev/null); if grep -qiF -- "$2" <<<"$t"; then ok "$3"; else bad "$3" "esperava '$2'; veio: ${t:0:200}"; fi; }
expect_no_text() { local t; t=$(ab "$1" get text body 2>/dev/null); if grep -qiF -- "$2" <<<"$t"; then bad "$3" "não deveria conter '$2'"; else ok "$3"; fi; }
wait_text() { for _ in $(seq 1 "$3"); do ab "$1" get text body 2>/dev/null | grep -qiF -- "$2" && return 0; sleep 1; done; return 1; }
shot() { sleep 1; ab "$1" screenshot "$2" >/dev/null; }
clicktext() { # sessão, texto de <a>/<button>/<label>
  # `find text ... click` (clique real do Playwright) em vez de `.click()` via eval: um `.click()` sintético em JS
  # não disparou o submit do botão "Salvar aluno" nesta fatia (achado novo desta E2E, registrado no relatório).
  ab "$1" find text "$2" click >/dev/null
}
# Achado desta E2E: `fill`/`select`/`check` do agent-browser em sequência rápida logo após uma navegação por
# clique perderam o valor no clique de submit seguinte, de forma repetível nesta sessão (mesmo com sleeps de até
# 5 s). Um ÚNICO `eval` que usa o SETTER NATIVO do protótipo (o mesmo truque de "setNativeValue" para inputs
# controlados por React) e dispara o evento — tudo síncrono, sem round-trips intermediários — é confiável.
set_nickname() { # sessão, apelido
  ab "$1" eval "(() => { function sn(el,p,v){Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),p).set.call(el,v);} const n=document.querySelector('#nickname'); sn(n,'value','$2'); n.dispatchEvent(new Event('input',{bubbles:true})); return 'ok'; })()" >/dev/null
}
set_new_student_fields() { # sessão, apelido, slug da série
  # Checkbox: React detecta troca de estado de <input type=checkbox> pelo evento `click`, não por um `change`
  # sintético após setar `.checked` via setter nativo (funciona para <select>/<input type=text>, não para
  # checkbox — achado desta E2E). `.click()` alterna o estado e dispara o `onChange` de verdade.
  ab "$1" eval "(() => { function sn(el,p,v){Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),p).set.call(el,v);} const n=document.querySelector('#nickname'); sn(n,'value','$2'); n.dispatchEvent(new Event('input',{bubbles:true})); const g=document.querySelector('#gradeSlug'); sn(g,'value','$3'); g.dispatchEvent(new Event('change',{bubbles:true})); const c=document.querySelector('input[name=consent]'); if (!c.checked) c.click(); return 'ok'; })()" >/dev/null
}
submit_form() { # sessão
  ab "$1" eval "document.querySelector('form').requestSubmit(); 'ok'" >/dev/null
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

echo "== 0) escola e lista publicada REAIS (SQL direto; a S15 só consome, não cria escola/lista)"
sql_stdin <<SQL
set role service_role;
insert into public.schools (inep, name, normalized_name, network, municipality_id)
select '$INEP', 'Escola E2E S15', 'escola e2e s15', 'municipal', id from public.municipalities where ibge_code = '5103403'
returning id as school_id \gset
select id as grade_id from public.grades where slug = 'ef-5' \gset
insert into public.school_lists (school_id, grade_id, school_year) values (:'school_id'::uuid, :'grade_id'::uuid, 2027) returning id as list_id \gset
select version_id as version_id from public.list_create_candidate_version(:'list_id'::uuid, 'admin', null, null) \gset
insert into public.list_items (version_id, position, original_name, normalized_name, category, quantity, unit)
values (:'version_id'::uuid, 1, 'Caderno 96 folhas', 'caderno 96 folhas', 'papelaria', 2, 'un'),
       (:'version_id'::uuid, 2, 'Lápis HB', 'lapis hb', 'escrita', 3, 'un');
select public.list_transition(:'list_id'::uuid, 'submitted'::public.list_status, '00000000-0000-4000-8000-0000000000a1'::uuid, null);
select public.list_transition(:'list_id'::uuid, 'processing'::public.list_status, '00000000-0000-4000-8000-0000000000a1'::uuid, null);
select public.list_transition(:'list_id'::uuid, 'approved'::public.list_status, '00000000-0000-4000-8000-0000000000a1'::uuid, null);
select public.list_approve_version(:'list_id'::uuid, :'version_id'::uuid, '00000000-0000-4000-8000-0000000000a1'::uuid);
select public.list_publish_version(:'list_id'::uuid, :'version_id'::uuid, '00000000-0000-4000-8000-0000000000a1'::uuid);
SQL
PUB=$(sql "select status::text from public.school_lists where school_id = (select id from public.schools where inep = '$INEP');")
[ "$PUB" = "published" ] && ok "lista publicada de verdade (5º ano, 2027, real)" || bad "publicar lista" "status veio '$PUB'"

echo "== 1) hub vazio: sem aluno, sem lista salva, sem carrinho"
ab parent set viewport 420 900 >/dev/null
login parent parent@listacerta.test "/conta"
wait_text parent "Minha conta" 20
expect_text parent "Nenhum aluno cadastrado ainda" "hub sem aluno mostra o vazio certo"
expect_text parent "Nenhuma lista salva ainda" "hub sem lista salva mostra o vazio certo"
expect_text parent "Nenhum carrinho ainda" "hub sem carrinho mostra o vazio certo"
shot parent "$OUT/S15-conta-vazio.png"

echo "== 2) Novo aluno (App13): só apelido e série (SPEC §5, correção da revisão de segurança); apelido com sobrenome é recusado"
clicktext parent "Adicionar"
wait_text parent "Novo aluno" 30
sleep 2 # hidratação do client component (GradeSelect/consent são controlados) antes de interagir
set_new_student_fields parent "Maria Silva" "ef-5"
submit_form parent
# Achado desta E2E: o AVISO estático abaixo do campo ("Só letras, sem sobrenome nem documento.") já contém
# "sem sobrenome"/"letras" — um `wait_text` com esses termos casava na página em repouso, ANTES da action
# resolver, e o `expect_text` seguinte rodava cedo demais. Espera-se a mensagem de erro completa (só aparece
# depois da resposta da action), nunca um trecho que também exista no aviso estático.
wait_text parent "Use só um apelido, sem sobrenome" 30
expect_text parent "Use só um apelido, sem sobrenome" "apelido com espaço é recusado com a mensagem certa"
shot parent "$OUT/S15-app13-apelido-recusado.png"

echo "== 2b) apelido com pontuação (achado da revisão de segurança) também é recusado"
set_nickname parent "Maria.Silva"
submit_form parent
wait_text parent "Use só letras, sem número" 30
expect_text parent "Use só letras" "apelido com ponto é recusado (só letras)"

echo "== 3) corrige o apelido e salva: aluno aparece no hub, só com a série (sem escola/ano — vivem na lista salva)"
set_nickname parent "Maria"
submit_form parent
wait_text parent "Maria" 30
expect_text parent "Maria" "aluno salvo aparece no hub"
expect_text parent "5º ano" "série do aluno aparece no hub"
shot parent "$OUT/S15-conta-com-aluno.png"

echo "== 4) editar aluno: troca o apelido"
clicktext parent "Maria"
wait_text parent "Editar aluno" 30
sleep 2 # hidratação do client component antes de interagir
set_nickname parent "Mari"
submit_form parent
wait_text parent "Mari" 30
expect_text parent "Mari" "apelido editado aparece no hub"
expect_no_text parent "Maria Silva" "nunca grava nome com sobrenome (recusado antes de chegar ao banco)"
shot parent "$OUT/S15-conta-editado.png"

echo "== 5) salvar a lista publicada para a aluna (App13/S15) na página pública da lista"
ab parent open "$BASE/escolas/$INEP/ef-5?ano=2027" >/dev/null
wait_text parent "Escola E2E S15" 30
sleep 2 # hidratação do SaveListButton (client component) antes de clicar
expect_text parent "Caderno 96 folhas" "itens da lista publicada aparecem"
ab parent eval "(() => { const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').includes('Salvar lista')); if (!b) return 'sem-elemento'; b.click(); return 'ok'; })()"
wait_text parent "Lista salva" 30
expect_text parent "Lista salva" "botão confirma o salvamento"
shot parent "$OUT/S15-salvar-lista.png"
ab parent open "$BASE/conta" >/dev/null
wait_text parent "Listas salvas" 30
expect_text parent "Escola E2E S15" "lista salva aparece no hub"
expect_text parent "Para Mari" "lista salva mostra o aluno certo"

echo "== 6) carrinho a partir da lista: aparece no hub e em /conta/carrinhos"
# `/carrinho/novo?lista=` espera o id da VERSÃO (list_reader_get compara com list_versions.id, não com
# school_lists.id) — achado desta E2E: a UI pública de uma lista OFICIAL não linka para "montar carrinho" em
# lugar nenhum hoje (só a cópia do pai, via ParentCopyEditor, tem esse link); registrado como dívida no fechamento.
VERSION_ID=$(sql "select current_version_id from public.school_lists where school_id = (select id from public.schools where inep = '$INEP');")
ab parent open "$BASE/carrinho/novo?lista=$VERSION_ID" >/dev/null
wait_text parent "Caderno" 30
clicktext parent "Comparar opções"
wait_text parent "carrinho" 30
ab parent open "$BASE/conta" >/dev/null
wait_text parent "2 itens" 8 || ab parent open "$BASE/conta" >/dev/null # 2ª navegação: contorna um instantâneo preso visto 1x nesta sessão longa (achado de roteiro, não do produto — confirmado em sessão nova)
wait_text parent "2 itens" 30
expect_text parent "2 itens" "carrinho recente aparece no hub com a contagem certa"
ab parent open "$BASE/conta/carrinhos" >/dev/null
wait_text parent "Seus carrinhos" 30
expect_text parent "2 itens" "carrinho aparece na lista completa"
shot parent "$OUT/S15-carrinhos.png"

echo "== 7) cotações: link do hub leva a /cotacao (S14/S22, já pronto)"
ab parent open "$BASE/conta" >/dev/null
wait_text parent "Cotações" 30
clicktext parent "Ver suas cotações"
wait_text parent "cotaç" 30
expect_text parent "cotaç" "hub leva a /cotacao"

echo "== 8) excluir a aluna (LGPD): apaga o aluno e a lista salva junto (cascade)"
ab parent open "$BASE/conta" >/dev/null
wait_text parent "Mari" 30
clicktext parent "Mari"
wait_text parent "Editar aluno" 30
sleep 2 # hidratação do DeleteStudentButton (dialog) antes de clicar
ab parent eval "(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Excluir aluno'); b.click(); return b ? 'ok' : 'sem-elemento'; })()" >/dev/null
sleep 1
ab parent eval "document.querySelector('dialog[open] form').requestSubmit(); 'ok'" >/dev/null
wait_text parent "Minha conta" 30
expect_text parent "Nenhum aluno cadastrado ainda" "aluna excluída some do hub"
expect_text parent "Nenhuma lista salva ainda" "lista salva some junto (cascade)"
shot parent "$OUT/S15-apos-exclusao.png"
STUDENTS=$(sql "select count(*) from public.students where owner_id = '00000000-0000-4000-8000-0000000000a2';")
SAVED=$(sql "select count(*) from public.saved_lists where owner_id = '00000000-0000-4000-8000-0000000000a2';")
[ "$STUDENTS" = "0" ] && ok "banco: 0 alunos após a exclusão" || bad "banco pós-exclusão (aluno)" "vieram $STUDENTS"
[ "$SAVED" = "0" ] && ok "banco: 0 listas salvas após a exclusão (cascade real)" || bad "banco pós-exclusão (lista salva)" "vieram $SAVED"

echo
echo "RESULTADO: $PASS passaram, $FAIL falharam"
exit $((FAIL > 0))
