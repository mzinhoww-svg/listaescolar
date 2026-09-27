#!/usr/bin/env bash
# E2E da S16 (Admin: dashboard, auditoria filtrável, denúncias, ai_settings, arquivar lista) com agent-browser
# contra o build local da trilha 3.
# Pré-requisitos: `pnpm db:reset` (banco limpo); `.env.local` (só neste worktree, não versionado) com as variáveis
# de `pnpm db:env`; `pnpm build && PORT=3003 pnpm start`. Reaproveita admin@listacerta.test/parent@listacerta.test
# (supabase/seed.sql); a escola e a lista publicada são criadas por SQL direto (mesmo padrão de outras fatias).
set -u
cd "$(dirname "$0")/.."
BASE=${BASE:-http://127.0.0.1:3003}
MAILPIT=${MAILPIT:-http://127.0.0.1:54624}
DB=${DB:-supabase_db_listacerta-t3}
OUT=docs/superpowers/e2e/screenshots
ADMIN_ID=00000000-0000-4000-8000-0000000000a1
PARENT_ID=00000000-0000-4000-8000-0000000000a2
INEP=51999160
PASS=0; FAIL=0
RUN=$(date +%s)
export AGENT_BROWSER_SESSION_PREFIX=t3s16
for s in admin parent; do AGENT_BROWSER_SESSION="t3s16-$RUN-$s" agent-browser close >/dev/null 2>&1; done
ab() {
  local s=$1; shift
  AGENT_BROWSER_SESSION="t3s16-$RUN-$s" agent-browser "$@"
  # Achado desta E2E: `get text body` chamado imediatamente após `open` às vezes pega HTML ainda em streaming
  # (SSR/RSC) — sobra de navegação anterior faltando conteúdo dinâmico. Um respiro fixo depois de `open` evita a
  # corrida sem precisar de retry em cada chamada.
  if [ "$1" = "open" ]; then sleep 1; fi
}
sql() { docker exec "$DB" psql -U postgres -Atq -c "$1"; }
sql_stdin() { docker exec -i "$DB" psql -U postgres -At -v ON_ERROR_STOP=1; }
ok() { PASS=$((PASS+1)); echo "PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL  $1  ($2)"; }
expect_text() { local t; t=$(ab "$1" get text body 2>/dev/null); if grep -qiF -- "$2" <<<"$t"; then ok "$3"; else bad "$3" "esperava '$2'; veio: ${t:0:200}"; fi; }
expect_no_text() { local t; t=$(ab "$1" get text body 2>/dev/null); if grep -qiF -- "$2" <<<"$t"; then bad "$3" "não deveria conter '$2'"; else ok "$3"; fi; }
wait_text() { for _ in $(seq 1 "$3"); do ab "$1" get text body 2>/dev/null | grep -qiF -- "$2" && return 0; sleep 1; done; return 1; }
shot() { sleep 1; ab "$1" screenshot "$2" >/dev/null; }
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

echo "== 0) escola e lista publicada REAIS (SQL direto)"
sql_stdin <<SQL
set role service_role;
insert into public.schools (inep, name, normalized_name, network, municipality_id)
select '$INEP', 'Escola E2E S16', 'escola e2e s16', 'municipal', id from public.municipalities where ibge_code = '5103403'
returning id as school_id \gset
select id as grade_id from public.grades where slug = 'ef-3' \gset
insert into public.school_lists (school_id, grade_id, school_year) values (:'school_id'::uuid, :'grade_id'::uuid, 2027) returning id as list_id \gset
select version_id as version_id from public.list_create_candidate_version(:'list_id'::uuid, 'admin', null, null) \gset
insert into public.list_items (version_id, position, original_name, normalized_name, category, quantity, unit)
values (:'version_id'::uuid, 1, 'Caderno 96 folhas', 'caderno 96 folhas', 'papelaria', 2, 'un');
select public.list_transition(:'list_id'::uuid, 'submitted'::public.list_status, '$ADMIN_ID'::uuid, null);
select public.list_transition(:'list_id'::uuid, 'processing'::public.list_status, '$ADMIN_ID'::uuid, null);
select public.list_transition(:'list_id'::uuid, 'approved'::public.list_status, '$ADMIN_ID'::uuid, null);
select public.list_approve_version(:'list_id'::uuid, :'version_id'::uuid, '$ADMIN_ID'::uuid);
select public.list_publish_version(:'list_id'::uuid, :'version_id'::uuid, '$ADMIN_ID'::uuid);
SQL
LIST_ID=$(sql "select id from public.school_lists where school_id = (select id from public.schools where inep = '$INEP');")
[ -n "$LIST_ID" ] && ok "escola e lista publicada criadas ($LIST_ID)" || bad "seed" "LIST_ID vazio"
BEFORE_LISTS=$(sql "select count(*) from public.school_lists where status = 'published';")

echo "== 1) dashboard (Admin01-Visao): contagens reais (nunca inventadas)"
ab admin set viewport 1280 900 >/dev/null
login admin admin@listacerta.test "/admin"
expect_text admin "Visão geral" "dashboard abre para o admin"
REGISTERED_DB=$(sql "select count(*) from public.schools where verification_status = 'registered';")
DASH_TEXT=$(ab admin get text body 2>/dev/null)
grep -qiF "Cadastrada (INEP)" <<<"$DASH_TEXT" && ok "categoria de escola 'registered' aparece (rótulo Cadastrada (INEP))" || bad "categoria registered" "rótulo ausente"
grep -qF "$REGISTERED_DB" <<<"$DASH_TEXT" && ok "número de escolas registradas no dashboard bate com o banco ($REGISTERED_DB)" || bad "contagem de escolas" "banco tem $REGISTERED_DB, texto: ${DASH_TEXT:0:300}"
PUBLISHED_DB=$(sql "select count(*) from public.school_lists where status = 'published';")
grep -qF "Publicada" <<<"$DASH_TEXT" && grep -qF "$PUBLISHED_DB" <<<"$DASH_TEXT" && ok "categoria de lista 'published' bate com o banco ($PUBLISHED_DB)" || bad "contagem de listas publicadas" "veio $PUBLISHED_DB"
shot admin "$OUT/S16-01-dashboard.png"

echo "== 2) eventos (Admin08-Eventos): tela abre com filtro (conteúdo real é conferido no passo 9, depois de editar ai_settings)"
ab admin open "$BASE/admin/eventos" >/dev/null
expect_text admin "Eventos (auditoria)" "tela de eventos abre"
expect_text admin "Ação" "formulário de filtro aparece"
shot admin "$OUT/S16-02-eventos.png"

echo "== 3) admin (autenticado errado): parent não acessa /admin"
ab parent set viewport 1280 900 >/dev/null
login parent parent@listacerta.test "/admin/denuncias"
expect_text parent "Você não tem acesso a esta página" "parent recebe 403 ao tentar abrir /admin/denuncias"

echo "== 4) denúncia pública (parent, só autenticado, sobre a lista publicada)"
ab parent open "$BASE/escolas/$INEP?serie=ef-3&ano=2027" >/dev/null
expect_text parent "Encontrou um problema" "bloco de denúncia aparece na página da escola"
# Abrir via eval (equivalente a clicar no <summary>, que só alterna o atributo `open`): determinístico e evita
# depender de o <summary> estar dentro do viewport.
ab parent eval "document.querySelector('#denunciar').open = true; 'ok'" >/dev/null
sleep 1
ab parent select 'select[name=reason]' "preco_incorreto" >/dev/null
# Achados desta E2E: (1) `scrollintoview`/`is visible` com um seletor CSS `:has-text(...)` não é CSS de verdade
# (é sintaxe do Playwright) — essas chamadas retornam "não encontrado" em silêncio; usar um seletor de atributo
# real (aqui, o próprio campo do formulário) resolve. (2) "find text ... click" casa por SUBSTRING: a página
# tem um h2 "Resolver denúncia" que também bate com o texto do botão "Resolver" — `find role button click`
# (por role + nome acessível) é o único jeito confiável de clicar no botão certo nesta fatia.
ab parent scrollintoview 'select[name=reason]' >/dev/null
sleep 1
ab parent find role button click "Denunciar" >/dev/null
wait_text parent "Denúncia enviada" 10 && ok "denúncia enviada com sucesso" || bad "denunciar" "mensagem de sucesso não apareceu"
shot parent "$OUT/S16-03-denuncia-publica.png"
REPORT_ID=$(sql "select id from public.reports where target_id = '$LIST_ID' order by created_at desc limit 1;")
[ -n "$REPORT_ID" ] && ok "denúncia gravada no banco, status open ($REPORT_ID)" || bad "denúncia no banco" "não encontrada"
REASON=$(sql "select reason from public.reports where id = '$REPORT_ID';")
[ "$REASON" = "preco_incorreto" ] && ok "motivo gravado corretamente" || bad "motivo" "veio $REASON"

echo "== 5) fila de denúncias (admin): abre, coloca em análise e resolve"
ab admin open "$BASE/admin/denuncias" >/dev/null
expect_text admin "Preço incorreto" "denúncia aparece na fila (aberta)"
ab admin open "$BASE/admin/denuncias/$REPORT_ID" >/dev/null
sleep 1
ab admin scrollintoview 'select[name=resolution]' >/dev/null
ab admin find role button click "Colocar em análise" >/dev/null
wait_text admin "Denúncia atualizada" 10 && ok "denúncia passou para 'em análise'" || bad "em análise" "sem confirmação"
STATUS1=$(sql "select status from public.reports where id = '$REPORT_ID';")
[ "$STATUS1" = "reviewing" ] && ok "estado no banco é reviewing" || bad "estado reviewing" "veio $STATUS1"
ab admin open "$BASE/admin/denuncias/$REPORT_ID" >/dev/null
sleep 1
ab admin select 'select[name=resolution]' "upheld" >/dev/null
sleep 1
ab admin fill 'input[name=resolutionNote]' "lista_arquivada" >/dev/null
sleep 1
ab admin scrollintoview 'input[name=resolutionNote]' >/dev/null
ab admin find role button click "Resolver" >/dev/null
wait_text admin "Denúncia atualizada" 10 && ok "denúncia resolvida" || bad "resolver" "sem confirmação"
STATUS2=$(sql "select status, resolution, resolved_by from public.reports where id = '$REPORT_ID';")
echo "$STATUS2" | grep -q "resolved|upheld|$ADMIN_ID" && ok "estado final resolved, com resolution=upheld e resolved_by=admin ($STATUS2)" || bad "estado resolved" "veio $STATUS2"
shot admin "$OUT/S16-04-denuncia-resolvida.png"

echo "== 5b) eventos (Admin08-Eventos): auditoria filtrada por entidade=reports mostra as mudanças de estado"
ab admin open "$BASE/admin/eventos?entidade=reports&entidadeId=$REPORT_ID" >/dev/null
expect_text admin "reports" "auditoria filtrada por entidade devolve linhas de reports"
expect_text admin "UPDATE" "mostra a atualização de status (open -> reviewing -> resolved)"
shot admin "$OUT/S16-04b-eventos-reports.png"

echo "== 6) arquivar lista (só published -> archived, com motivo)"
ab admin open "$BASE/admin/listas/$LIST_ID" >/dev/null
expect_text admin "Arquivar lista" "tela de lista mostra a ação de arquivar (lista publicada)"
sleep 1
ab admin fill 'textarea[name=reason]' "denuncia_procedente_lista_arquivada" >/dev/null
sleep 1
ab admin scrollintoview 'textarea[name=reason]' >/dev/null
ab admin find role button click "Confirmar arquivamento" >/dev/null
wait_text admin "Lista arquivada" 10 && ok "lista arquivada com sucesso" || bad "arquivar" "sem confirmação"
STATUS3=$(sql "select status, archived_at is not null as tem_data from public.school_lists where id = '$LIST_ID';")
echo "$STATUS3" | grep -q "archived|t" && ok "estado no banco é archived, com archived_at (estado: $STATUS3)" || bad "estado archived" "veio $STATUS3"
AFTER_LISTS=$(sql "select count(*) from public.school_lists where status = 'published';")
[ "$AFTER_LISTS" -eq "$((BEFORE_LISTS - 1))" ] && ok "contagem de listas publicadas caiu em 1 (de $BEFORE_LISTS para $AFTER_LISTS)" || bad "contagem pós-arquivamento" "veio $AFTER_LISTS, esperava $((BEFORE_LISTS - 1))"
ab admin open "$BASE/admin/listas/$LIST_ID" >/dev/null
expect_text admin "Só listas publicadas podem ser arquivadas" "não oferece arquivar de novo (lista já arquivada)"
shot admin "$OUT/S16-05-lista-arquivada.png"

echo "== 7) motivo do arquivamento fica em list_status_events (máquina de estados, S05; school_lists não tem gatilho de audit_log)"
REASON_ROW=$(sql "select from_status, to_status, actor_id, reason from public.list_status_events where list_id = '$LIST_ID' and to_status = 'archived';")
echo "$REASON_ROW" | grep -q "published|archived|$ADMIN_ID|denuncia_procedente_lista_arquivada" && ok "evento de arquivamento registrado com motivo e ator (estado: $REASON_ROW)" || bad "evento de arquivamento" "veio $REASON_ROW"

echo "== 8) configuração de IA (ai_settings): edição e recusa de campo fora do formulário"
BEFORE_PV=$(sql "select pipeline_version from public.ai_settings where scope = 'default';")
ab admin open "$BASE/admin/ia" >/dev/null
expect_text admin "Configuração de IA" "tela de IA abre"
expect_text admin "Publicação automática" "auto_publish_enabled aparece só como leitura"
sleep 1
ab admin fill 'input[name=pipelineVersion]' "e2e-s16-v2" >/dev/null
sleep 1
ab admin scrollintoview 'input[name=pipelineVersion]' >/dev/null
ab admin find role button click "Salvar" >/dev/null
wait_text admin "Configuração salva" 10 && ok "ai_settings salvo" || bad "salvar ai_settings" "sem confirmação"
AFTER_PV=$(sql "select pipeline_version from public.ai_settings where scope = 'default';")
[ "$AFTER_PV" = "e2e-s16-v2" ] && [ "$AFTER_PV" != "$BEFORE_PV" ] && ok "pipeline_version atualizado no banco ($BEFORE_PV -> $AFTER_PV)" || bad "pipeline_version" "veio $AFTER_PV"
AUTO_PUBLISH=$(sql "select auto_publish_enabled from public.ai_settings where scope = 'default';")
[ "$AUTO_PUBLISH" = "f" ] && ok "auto_publish_enabled continua desligado (não ligou sozinho)" || bad "auto_publish_enabled" "veio $AUTO_PUBLISH"
shot admin "$OUT/S16-07-ia.png"

echo "== 9) auditoria mostra a edição de ai_settings"
ab admin open "$BASE/admin/eventos?entidade=ai_settings" >/dev/null
wait_text admin "e2e-s16-v2" 10 && ok "auditoria mostra o novo pipeline_version no 'depois'" || bad "auditoria mostra o novo pipeline_version no 'depois'" "não apareceu"
shot admin "$OUT/S16-08-eventos-ia.png"

echo
echo "== resultado: $PASS passaram, $FAIL falharam =="
[ "$FAIL" -eq 0 ]
