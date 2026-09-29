#!/usr/bin/env bash
# E2E da S28 (Excelência de produto e design) com agent-browser, build de produção local da trilha 2 (porta 3002) e
# Supabase local. Cobre os momentos das Tasks 8 a 16: landing com escopo do piloto, busca vazia com saídas, login com
# retorno (contexto, "link enviado", troca de e-mail), lista publicada (aviso de preço e compartilhar sem dado pessoal),
# carrinho sem preço inventado, foto grande reduzida antes do envio, papelaria (checklist de ativação), escola
# (próximo passo) e a medição de uso (sem chave nada existe; nada persistente antes do aceite).
# O envio ao /ingest com aceite/recusa e os cabeçalhos do proxy são verificados por scripts/e2e-s28-posthog.sh
# (build próprio com chave falsa), rodado à parte.
# Pré-requisitos: `pnpm db:reset`; seeds (import:inep --demo, seed:demo-lists, e2e-s14-seed.sql, s28-seed-medicao.sql);
# `.env.local` carregado; `pnpm build && pnpm start -p 3002` (sem NEXT_PUBLIC_POSTHOG_KEY).
set -u
cd "$(dirname "$0")/.."
BASE=${BASE:-http://127.0.0.1:3002}
MAILPIT=${MAILPIT:-http://127.0.0.1:54524}
DB=${DB:-supabase_db_listacerta-t2}
OUT=${OUT:-docs/superpowers/e2e/screenshots}
INEP=99001001
RUN=$(date +%s)
export AGENT_BROWSER_SESSION_PREFIX="s28-e2e-$RUN"
source "$(dirname "$0")/e2e-lib.sh"
mkdir -p "$OUT"
TMP=$(mktemp -d)

cleanup() { for s in anon pai pap esc; do agent-browser close --session "${AGENT_BROWSER_SESSION_PREFIX}-$s" >/dev/null 2>&1; done; rm -rf "$TMP"; }
trap cleanup EXIT

for s in anon pai pap esc; do ab "$s" set viewport 390 844 >/dev/null 2>&1; done

echo "== 1) landing e busca (Tasks 8 e 13)"
ab anon open "$BASE/" >/dev/null; wait_text anon "Piloto em Cuiabá, MT" 20
expect_text anon "Piloto em Cuiabá, MT" "landing: frase de escopo do piloto junto à busca"
absent_text anon "Amazon" "landing: nenhum nome de varejista"
absent_text anon "Kalunga" "landing: nenhum nome de varejista (2)"
eq "$(ab anon eval "document.documentElement.scrollWidth <= document.documentElement.clientWidth" | tr -d '"')" "true" "landing: sem rolagem horizontal a 390 px"
shot anon "$OUT/S28-landing.png"
ab anon open "$BASE/escolas?q=zzzxyzabc" >/dev/null; wait_text anon "Enviar a lista da escola" 20
expect_text anon "Enviar a lista da escola" "busca vazia: saída 'Enviar a lista da escola'"
expect_text anon "Ver escolas de Cuiabá" "busca vazia: saída 'Ver escolas de Cuiabá'"
eq "$(ab anon eval "!!document.querySelector('a[href=\"/enviar-lista\"]')" | tr -d '"')" "true" "busca vazia: o link leva a /enviar-lista"
shot anon "$OUT/S28-busca-vazia.png"

echo "== 2) lista publicada: aviso de preço e compartilhar sem dado pessoal (Tasks 9 e 11)"
ab anon open "$BASE/escolas/$INEP/ef-5?ano=2027" >/dev/null; wait_text anon "Compartilhar no WhatsApp" 20
expect_text anon "Preços aparecem quando a loja ou a papelaria informa" "lista: aviso antes do CTA"
HREF=$(ab anon eval "document.querySelector('a[href^=\"https://wa.me/\"]')?.getAttribute('href') ?? 'none'" | tr -d '"')
[[ "$HREF" == https://wa.me/\?text=* ]] && ok "compartilhar: link wa.me com texto codificado" || bad "compartilhar" "$HREF"
DECODED=$(python3 -c "import sys,urllib.parse;print(urllib.parse.unquote(sys.argv[1].split('text=',1)[1]))" "$HREF")
has "$DECODED" "Lista de material de" "compartilhar: texto com escola/série/ano"
has "$DECODED" "/l/" "compartilhar: texto com o link curto da lista"
lacks "$DECODED" "@" "compartilhar: nenhum e-mail no texto"
lacks "$DECODED" "apelido" "compartilhar: nenhum apelido de aluno no texto"
shot anon "$OUT/S28-lista.png"

echo "== 3) login com retorno (Task 10)"
LISTAV=$(ab anon eval "document.querySelector('a[href*=\"/carrinho/novo\"]')?.getAttribute('href') ?? 'none'" | tr -d '"')
[[ "$LISTAV" == /carrinho/novo\?lista=* ]] && ok "link do carrinho na lista: $LISTAV" || bad "link do carrinho" "$LISTAV"
ab anon open "$BASE$LISTAV" >/dev/null; wait_text anon "Entre para montar o carrinho" 20
expect_text anon "Entre para montar o carrinho desta lista" "login: subtítulo contextual do carrinho"
ab anon fill '#email' s28pai@listacerta.test >/dev/null; ab anon press Enter >/dev/null
wait_text anon "Enviamos o link para" 20
expect_text anon "s28pai@listacerta.test" "login: link enviado cita o e-mail digitado"
expect_text anon "Reenviar link em" "login: reenvio bloqueado por 30 s"
expect_text anon "Trocar e-mail" "login: opção de trocar o e-mail"
shot anon "$OUT/S28-link-enviado.png"
login pai s28pai@listacerta.test "$LISTAV"
wait_text pai "Comparar opções" 20; ok_url=$(ab pai get url)
[[ "$ok_url" == *"$LISTAV"* ]] && ok "login: depois do link, volta para a lista do carrinho" || bad "retorno do login" "$ok_url"

echo "== 4) carrinho sem preço inventado (Task 11)"
clicktext pai "Comparar opções"
for _ in $(seq 1 30); do ab pai get url | grep -q "/carrinho/[0-9a-f-]\{36\}" && break; sleep 1; done
ab pai get url | grep -q "/carrinho/[0-9a-f-]\{36\}" && ok "carrinho criado pela interface" || bad "carrinho" "$(ab pai get url)"
wait_text pai "Montamos" 20
BODY=$(ab pai get text body)
has "$BODY" "Montamos" "carrinho: título com a contagem de opções"
NCARDS=$(grep -oE "Montamos [0-9]+" <<<"$BODY" | grep -oE "[0-9]+" | head -1)
[ -n "$NCARDS" ] && ok "carrinho: título anuncia $NCARDS opção(ões)" || bad "contagem" "sem número"
if grep -qF "Ainda não temos preço de loja" <<<"$BODY"; then
  ok "carrinho sem preço de fonte: aviso 'Ainda não temos preço de loja'"
  lacks "$BODY" "R$" "carrinho sem preço de fonte: nenhum valor em reais inventado"
else
  # Com a papelaria demo (catálogo com preço, e2e-s14-seed.sql) há opção com preço de fonte: o aviso não se aplica.
  has "$BODY" "R$" "carrinho com preço de fonte (catálogo da papelaria demo): valor vem da fonte"
  lacks "$BODY" "Ainda não temos preço" "carrinho com preço de fonte: sem o aviso de 'sem preço'"
fi
has "$BODY" "Pedir cotação a papelarias" "carrinho: opção de cotação presente"
shot pai "$OUT/S28-carrinho.png"

echo "== 5) foto grande reduzida antes do envio (Task 12)"
python3 - "$TMP/grande.png" <<'PY'
import os, struct, sys, zlib
w = h = 1500
raw = b"".join(b"\x00" + os.urandom(w * 3) for _ in range(h))
def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
open(sys.argv[1], "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 0)) + chunk(b"IEND", b""))
PY
BYTES=$(wc -c <"$TMP/grande.png" | tr -d ' ')
[ "$BYTES" -gt 4000000 ] && ok "foto de teste tem $BYTES bytes (acima do limite de 4 MB)" || bad "foto de teste" "$BYTES bytes"
BEFORE=$(sql "select count(*) from public.list_submissions")
ab pai open "$BASE/enviar-lista" >/dev/null; wait_text pai "Enviar para revisão" 20; sleep 1
for _ in 1 2 3 4 5 6; do ab pai upload '#file' "$TMP/grande.png" >/dev/null; ab pai get text '[data-testid=picked]' 2>/dev/null | grep -q . && break; sleep 1; done
ab pai select '#grade' "5º ano" >/dev/null; ab pai check 'input[name=consent]' >/dev/null
ab pai click 'button[type=submit]' >/dev/null
for _ in $(seq 1 45); do [ "$(sql "select count(*) from public.list_submissions")" -gt "$BEFORE" ] && break; sleep 1; done
[ "$(sql "select count(*) from public.list_submissions")" -gt "$BEFORE" ] && ok "foto acima de 4 MB foi aceita (reduzida no aparelho), envio gravado" || bad "envio da foto grande" "$(ab pai get text body | head -c 200)"
STORED=$(sql "select coalesce((metadata->>'size')::bigint,0) from storage.objects order by created_at desc limit 1")
[ "${STORED:-0}" -gt 0 ] && [ "${STORED:-0}" -le 4000000 ] && ok "arquivo guardado tem $STORED bytes (até 4 MB)" || bad "tamanho guardado" "$STORED"
absent_text pai "muito grande" "nenhuma recusa por tamanho"
shot pai "$OUT/S28-foto-grande.png"

echo "== 6) papelaria: checklist de ativação (Task 15)"
login pap s14a@listacerta.test /papelaria
wait_text pap "Papelaria" 20
LEADS=$(sql "select count(*) from public.leads l join public.stationery_members m on m.stationery_id = l.stationery_id join auth.users u on u.id = m.profile_id where u.email = 's14a@listacerta.test'")
if [ "$LEADS" = "0" ]; then
  expect_text pap "Falta pouco para receber pedidos" "papelaria sem pedido: checklist de ativação aparece"
  expect_text pap "Receber o primeiro pedido de cotação" "papelaria: passo do primeiro pedido listado"
else
  absent_text pap "Falta pouco para receber pedidos" "papelaria com pedido: checklist some"
fi
shot pap "$OUT/S28-papelaria.png"
ab pap open "$BASE/papelaria/leads" >/dev/null; sleep 2
[ "$LEADS" = "0" ] && expect_text pap "Nenhum" "papelaria: lista de leads vazia orientada" || ok "papelaria: leads existentes (vazio não se aplica)"
shot pap "$OUT/S28-papelaria-leads.png"

echo "== 7) escola: próximo passo (Task 16)"
login esc s28escola@listacerta.test /escola
wait_text esc "Minhas escolas" 20
BODY=$(ab esc get text body)
if grep -qF "Sua lista está publicada" <<<"$BODY"; then ok "escola com lista publicada: próximo passo 'Sua lista está publicada'"
elif grep -qF "Envie a lista da escola" <<<"$BODY"; then ok "escola sem lista: próximo passo 'Envie a lista da escola'"
else bad "próximo passo da escola" "${BODY:0:200}"; fi
lacks "$BODY" "dias úteis" "escola: nenhum prazo prometido"
shot esc "$OUT/S28-escola.png"

echo "== 8) medição de uso desligada sem chave (Task 24, ADR-007)"
ab anon open "$BASE/" >/dev/null; sleep 3
eq "$(ab anon eval "!!document.querySelector('[aria-label=\"Medição de uso\"]')" | tr -d '"')" "false" "sem chave: nenhum aviso de medição"
eq "$(ab anon eval "localStorage.length" | tr -d '"')" "0" "sem chave: localStorage vazio"
eq "$(ab anon eval "performance.getEntriesByType('resource').filter(r=>r.name.includes('/ingest')).length" | tr -d '"')" "0" "sem chave: nenhuma requisição a /ingest"
lacks "$(ab anon eval "document.cookie" | tr -d '"')" "ph_" "sem chave: nenhum cookie da medição (ph_*)"
CSP=$(curl -sI "$BASE/" | grep -i '^content-security-policy' | tr -d '\r')
has "$CSP" "nonce-" "CSP da S19 ativa com nonce"

echo
echo "RESULTADO: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
