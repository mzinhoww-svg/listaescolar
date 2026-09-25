#!/usr/bin/env bash
# E2E da S27 (site público, link curto, QR, cartão Compartilhar, robots/sitemap/OG, acessibilidade) com agent-browser
# contra o BUILD DE PRODUÇÃO local da trilha 3, só com dados de demonstração.
# Pré-requisitos (nada disso é versionado): Supabase local da trilha 3 no ar; `.env.local` gerado por `node scripts/supa.mjs env`
# (NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3003); `pnpm import:inep tests/fixtures/inep-demo.csv --demo && pnpm seed:demo-lists`;
# `pnpm build`. O script sobe/derruba o próprio `next start` (por PID) e, na fase final, refaz o build simulando produção
# (VERCEL_ENV=production, NEXT_PUBLIC_SITE_URL=https://listacerta.com.br) só para ler robots.txt e sitemap.xml.
# Uso: bash scripts/e2e-s27.sh   (PRODSIM=0 pula a fase de simulação de produção)
set -u
cd "$(dirname "$0")/.."
PORT=${PORT:-3003}
BASE=http://127.0.0.1:$PORT
MAILPIT=${MAILPIT:-http://127.0.0.1:54624}
OUT=docs/superpowers/e2e/screenshots
TMP=$(mktemp -d)
NEXT=./node_modules/.bin/next
SCHOOL=99001001; SERIE=ef-5; SCHOOL2=99001002; SERIE2=ef-1; SCHOOL3=99001003 # 3 = lista aprovada, sem publicar
PASS=0; FAIL=0
RUN=$(date +%s)
SERVER_PID=""
PRODSIM_DIRTY=0
ok() { PASS=$((PASS+1)); echo "PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL  $1  ($2)"; }
expect_eq() { if [ "$1" = "$2" ]; then ok "$3"; else bad "$3" "esperado '$2', veio '$1'"; fi; }
expect_match() { if [[ "$1" =~ $2 ]]; then ok "$3"; else bad "$3" "esperado /$2/, veio '${1:0:160}'"; fi; }
ab() { local s=$1; shift; AGENT_BROWSER_SESSION="t3s27-$RUN-$s" agent-browser "$@"; }
hx() { pnpm exec tsx scripts/e2e-s27-helpers.ts "$@"; }
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
header() { curl -sI "$1" | tr -d '\r' | grep -i "^$2:" | head -1 | cut -d' ' -f2-; }
start_server() { # porta [env...]
  local p=$1; shift
  env "$@" PORT=$p $NEXT start -p "$p" >"$TMP/server-$p.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 40); do [ "$(status "http://127.0.0.1:$p/robots.txt")" = "200" ] && return 0; sleep 0.5; done
  echo "servidor não subiu"; return 1
}
stop_server() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null; wait "$SERVER_PID" 2>/dev/null; SERVER_PID=""; }
cleanup() {
  stop_server; for s in a b p; do ab $s close >/dev/null 2>&1; done
  # fase k interrompida: o .next ficou com o build de produção simulado; restaura o build normal
  if [ "$PRODSIM_DIRTY" = "1" ]; then echo "restaurando build normal…"; pnpm build >/dev/null 2>&1; fi
  rm -rf "$TMP"
}
trap cleanup EXIT

start_server "$PORT" || exit 1
echo "== a) páginas estáticas: 200, metadata, OG, h1, claims"
for p in / /como-funciona /sobre /termos /privacidade /escolas; do
  code=$(status "$BASE$p"); expect_eq "$code" 200 "GET $p = 200"
  curl -s "$BASE$p" -o "$TMP/page.html"
  expect_match "$(grep -o '<title>[^<]*' "$TMP/page.html" | head -1)" 'ListaCerta' "$p tem <title> da marca"
  for prop in og:title og:description og:image og:type; do
    grep -q "property=\"$prop\"" "$TMP/page.html" && ok "$p tem $prop" || bad "$p $prop" "ausente"
  done
  grep -q 'name="twitter:card"' "$TMP/page.html" && ok "$p tem twitter:card" || bad "$p twitter:card" "ausente"
  grep -q 'rel="canonical"' "$TMP/page.html" && ok "$p tem canonical" || bad "$p canonical" "ausente"
  expect_eq "$(grep -o '<h1' "$TMP/page.html" | wc -l | tr -d ' ')" 1 "$p tem um único h1"
  case $p in /escolas) ;; *) hx scan "$TMP/page.html" >/dev/null && ok "$p sem claims sem fonte (varredura no HTML final)" || bad "$p claims" "$(hx scan "$TMP/page.html")";; esac
done
grep -q 'placeholder\|a definir' <(curl -s "$BASE/termos") && ok "/termos mostra placeholders [a definir]" || bad "/termos" "sem placeholder"
grep -q 'a definir' <(curl -s "$BASE/privacidade") && ok "/privacidade mostra placeholders [a definir]" || bad "/privacidade" "sem placeholder"
expect_match "$(curl -s "$BASE/como-funciona" | grep -o 'href="[^"]*canonical[^"]*"\|rel="canonical" href="[^"]*"' | head -1)" 'como-funciona' "canonical da página aponta para o próprio caminho"

echo "== b) imagens Open Graph"
for img in /opengraph-image /twitter-image /escolas/$SCHOOL/opengraph-image /escolas/$SCHOOL/twitter-image /escolas/$SCHOOL/$SERIE/opengraph-image /escolas/$SCHOOL/$SERIE/twitter-image; do
  curl -s "$BASE$img" -o "$TMP/og.png"
  dims=$(python3 -c "
import struct,sys
b=open('$TMP/og.png','rb').read()
print('png' if b[:8]==b'\x89PNG\r\n\x1a\n' else 'nao-png', struct.unpack('>II', b[16:24]) if len(b)>24 else '')")
  expect_eq "$dims" "png (1200, 630)" "$img é PNG 1200x630"
done
curl -s "$BASE/escolas/$SCHOOL/$SERIE/opengraph-image" -o "$OUT/S27-og-lista.png"
expect_eq "$(status "$BASE/escolas/00000000/opengraph-image")" 200 "OG de escola inexistente cai na imagem genérica (200)"

echo "== c) link curto /l/<código>"
CODE_LIST=$(hx code $SCHOOL $SERIE); CODE_LIST2=$(hx code $SCHOOL2 $SERIE2); CODE_SCHOOL=$(hx code $SCHOOL)
CODE_NOSCHOOL=$(hx code 12345678 ef-1)
CODE_BADCHECK="${CODE_LIST:0:7}$([ "${CODE_LIST:7:1}" = "0" ] && echo 1 || echo 0)"
expect_eq "$(status "$BASE/l/$CODE_LIST")" 307 "/l/$CODE_LIST = 307"
expect_eq "$(header "$BASE/l/$CODE_LIST" location)" "/escolas/$SCHOOL/$SERIE" "Location relativo para a escola/série certa"
expect_eq "$(header "$BASE/l/$CODE_LIST2" location)" "/escolas/$SCHOOL2/$SERIE2" "segundo código leva à outra escola/série"
expect_eq "$(header "$BASE/l/$CODE_SCHOOL" location)" "/escolas/$SCHOOL" "sem série: perfil da escola"
expect_eq "$(header "$BASE/l/${CODE_LIST:0:4}%20${CODE_LIST:4}" location)" "/escolas/$SCHOOL/$SERIE" "código digitado com espaço também resolve"
for c in AAAAAAAA "$CODE_BADCHECK" "$CODE_NOSCHOOL" "xx" "%2F%2Fevil.com"; do
  expect_eq "$(status "$BASE/l/$c")" 404 "/l/$c = 404"
  expect_eq "$(header "$BASE/l/$c" x-robots-tag)" noindex "/l/$c com X-Robots-Tag noindex"
  expect_eq "$(header "$BASE/l/$c" location)" "" "/l/$c sem Location"
done
curl -s "$BASE/l/AAAAAAAA" | grep -q "Link inválido ou expirado?" && ok "404 do link mostra a tela Sis01" || bad "Sis01" "texto ausente"
ab a set viewport 390 844 >/dev/null
ab a open "$BASE/l/$CODE_LIST" >/dev/null; sleep 2
expect_eq "$(ab a get url)" "$BASE/escolas/$SCHOOL/$SERIE" "navegador segue o 307 até a lista da série"
ab a get text body | grep -q "Escola Demonstração 1" && ok "a lista mostra a escola demo" || bad "lista demo" "sem nome"
ab a open "$BASE/l/$CODE_SCHOOL" >/dev/null; sleep 2
expect_eq "$(ab a get url)" "$BASE/escolas/$SCHOOL" "sem série o navegador chega ao perfil da escola"

echo "== d) QR /l/<código>/qr"
expect_match "$(header "$BASE/l/$CODE_LIST/qr" content-type)" "^image/svg\\+xml"  "QR é image/svg+xml"
curl -s "$BASE/l/$CODE_LIST/qr" -o "$TMP/qr.svg"
expect_eq "$(hx qr "$TMP/qr.svg")" "$BASE/l/$CODE_LIST" "QR decodificado (jsqr) = URL do link curto"
expect_match "$(header "$BASE/l/$CODE_LIST/qr?download=1" content-disposition)" 'attachment' "?download=1 baixa como anexo"
expect_eq "$(status "$BASE/l/AAAAAAAA/qr")" 404 "QR de código inválido = 404"

echo "== e) cartão Compartilhar na lista demo publicada"
ab a open "$BASE/escolas/$SCHOOL/$SERIE" >/dev/null; sleep 2
T=$(ab a get text body)
grep -qF "Compartilhar esta lista" <<<"$T" && ok "cartão aparece com lista publicada" || bad "cartão" "ausente"
grep -qF "$BASE/l/$CODE_LIST" <<<"$T" && ok "cartão mostra o link curto certo" || bad "link no cartão" "ausente"
expect_eq "$(ab a eval "document.querySelector('[role=img][aria-label*=\"/l/\"]') !== null")" true "QR com role img e aria-label"
expect_eq "$(ab a eval "(() => { const a=[...document.querySelectorAll('a')].find(x=>/Baixar QR/.test(x.textContent)); return a ? a.getAttribute('href') : ''; })()" | tr -d '"')" "/l/$CODE_LIST/qr?download=1" "Baixar QR aponta para o SVG"
ab a screenshot "$OUT/S27-lista-compartilhar-390.png" >/dev/null
ab a open "$BASE/escolas/$SCHOOL3/$SERIE" >/dev/null; sleep 2
ab a get text body | grep -qF "Compartilhar esta lista" && bad "cartão sem lista publicada" "apareceu" || ok "sem lista publicada não há cartão"

echo "== f) 404 e 403 reais"
expect_eq "$(status "$BASE/nao-existe")" 404 "/nao-existe = 404 (status HTTP)"
curl -s "$BASE/nao-existe" | grep -q "Esta página não está na lista" && ok "404 mostra a tela Sis06" || bad "Sis06" "texto ausente"
# Sem `loading.tsx` forçando 200 (chore soft-404, #17), escola/série inexistente sai com HTTP 404 real + noindex.
for p in /escolas/00000000 /escolas/$SCHOOL/serie-que-nao-existe; do
  curl -s "$BASE$p" -o "$TMP/nf.html" -w '%{http_code}' >"$TMP/nf.code"
  expect_eq "$(cat "$TMP/nf.code")" 404 "$p responde HTTP 404"
  grep -q '<meta name="robots" content="noindex' "$TMP/nf.html" && ok "$p traz noindex" || bad "$p" "sem noindex"
done
ab a set viewport 390 844 >/dev/null
ab a open "$BASE/nao-existe" >/dev/null; sleep 1; ab a screenshot "$OUT/S27-404-390.png" >/dev/null
# 403: responsável logado (papel parent) em /admin. O e-mail chega ao Mailpit local.
EMAIL="e2e-s27-$RUN@listacerta.test"
ab p set viewport 390 844 >/dev/null
ab p open "$BASE/entrar?next=/conta" >/dev/null; sleep 1
ab p fill '#email' "$EMAIL" >/dev/null; ab p press Enter >/dev/null
LINK=""
for _ in $(seq 1 25); do
  LINK=$(curl -s "$MAILPIT/api/v1/search?query=to:$EMAIL" | python3 -c "
import sys,json,re,urllib.request
d=json.load(sys.stdin)
if d.get('messages'):
    m=json.load(urllib.request.urlopen('$MAILPIT/api/v1/message/'+d['messages'][0]['ID']))
    print(re.findall(r'https?://[^\s\"<>]+', m['Text'])[0])" 2>/dev/null)
  [ -n "$LINK" ] && break; sleep 1
done
if [ -n "$LINK" ]; then
  ab p open "$LINK" >/dev/null; sleep 2
  R=$(ab p eval "fetch('/admin',{redirect:'manual'}).then(r=>r.status)")
  expect_eq "$R" 403 "responsável em /admin = 403 (papel errado)"
  ab p open "$BASE/admin" >/dev/null; sleep 1
  ab p get text body | grep -q "Você não tem acesso a esta página" && ok "403 mostra a tela Sis05" || bad "Sis05" "texto ausente"
  ab p screenshot "$OUT/S27-403-390.png" >/dev/null
else bad "login do responsável" "sem e-mail no Mailpit"; fi

echo "== g) robots e sitemap (build local: fora de produção)"
expect_eq "$(curl -s "$BASE/robots.txt" | tr -d '\r' | grep -i '^disallow' | head -1)" "Disallow: /" "robots local = Disallow: /"
curl -s "$BASE/robots.txt" | grep -qi '^sitemap' && bad "robots local" "não deveria anunciar sitemap" || ok "robots local sem Sitemap"
curl -s "$BASE/sitemap.xml" -o "$TMP/sitemap.xml"
expect_eq "$(status "$BASE/sitemap.xml")" 200 "sitemap.xml = 200"
for path in /como-funciona /sobre /termos /privacidade /escolas; do grep -q "<loc>[^<]*$path</loc>" "$TMP/sitemap.xml" && ok "sitemap lista $path" || bad "sitemap $path" "ausente"; done
grep -Eq "9900100|/l/|/papelaria|/carrinho|/conta|/admin|/cotacao|/escola/" "$TMP/sitemap.xml" && bad "sitemap" "contém demo, lista ou área privada" || ok "sitemap sem demo, listas, /l/, papelarias nem áreas privadas"

echo "== h) acessibilidade e layout (390 e 1440)"
A11Y_JS="(() => { const q=s=>document.querySelectorAll(s).length; const nm=e=>(e.getAttribute('aria-label')||e.textContent||e.getAttribute('title')||'').trim(); const un=[...document.querySelectorAll('a[href],button')].filter(e=>!nm(e)&&!e.querySelector('img[alt]:not([alt=\"\"])')).length; return ['sw='+document.documentElement.scrollWidth,'h1='+q('h1'),'main='+q('main'),'header='+q('body header'),'footer='+q('body footer'),'noalt='+q('img:not([alt])'),'unnamed='+un,'lang='+document.documentElement.lang].join(';'); })()"
FOCUS_JS="(() => { const e=document.activeElement; if(!e||e===document.body) return 'body'; let vis=false; for (let n=e, i=0; n && i<3 && !vis; n=n.parentElement, i++) { const c=getComputedStyle(n); vis=(c.outlineStyle!=='none'&&parseFloat(c.outlineWidth)>0)||c.boxShadow!=='none'; } return (vis?'ok':'SEM-FOCO')+':'+e.tagName+':'+(e.textContent||'').trim().slice(0,30); })()"
for W in 390 1440; do
  ab a set viewport $W 900 >/dev/null
  for p in / /como-funciona /sobre /termos /privacidade "/escolas/$SCHOOL/$SERIE" /escolas; do
    ab a open "$BASE$p" >/dev/null; sleep 1
    R=$(ab a eval "$A11Y_JS" | tr -d '"')
    sw=$(sed -E 's/.*sw=([0-9]+).*/\1/' <<<"$R")
    [ "$sw" -le "$W" ] && ok "$p @$W sem rolagem horizontal (scrollWidth=$sw)" || bad "$p @$W" "scrollWidth=$sw"
    KVS="h1=1 main=1 noalt=0 unnamed=0 lang=pt-BR"; case $p in /|/como-funciona|/sobre|/termos|/privacidade) KVS="$KVS header=1 footer=1";; esac
    for kv in $KVS; do
      [[ "$R" == *"$kv"* ]] && ok "$p @$W $kv" || bad "$p @$W $kv" "$R"
    done
  done
done
ab a set viewport 320 700 >/dev/null
for p in / /como-funciona /privacidade; do
  ab a open "$BASE$p" >/dev/null; sleep 1
  sw=$(ab a eval "document.documentElement.scrollWidth" | tr -d '"')
  [ "$sw" -le 320 ] && ok "$p @320 (zoom 200% equivalente) sem rolagem horizontal" || bad "$p @320" "scrollWidth=$sw"
done

echo "== i) teclado: skip link, foco visível, FAQ"
ab a set viewport 1440 900 >/dev/null
for p in / /como-funciona /sobre /termos /privacidade /escolas/$SCHOOL/$SERIE; do
  case $p in /escolas/*) ;; *)
    ab a open "$BASE$p" >/dev/null; sleep 1
    ab a press Tab >/dev/null
    first=$(ab a eval "$FOCUS_JS" | tr -d '"')
    [[ "$first" == ok:A:*[Cc]onte* ]] && ok "$p: 1º Tab = skip link visível ($first)" || bad "$p skip link" "$first"
    ab a press Enter >/dev/null
    expect_eq "$(ab a eval "location.hash" | tr -d '"')" "#conteudo" "$p: Enter no skip link move para o conteúdo (#conteudo)";;
  esac
  ab a open "$BASE$p" >/dev/null; sleep 1
  semfoco=0
  for i in $(seq 1 14); do ab a press Tab >/dev/null; r=$(ab a eval "$FOCUS_JS" | tr -d '"'); [[ "$r" == SEM-FOCO* ]] && { semfoco=$((semfoco+1)); echo "   sem indicador: $r"; }; done
  expect_eq "$semfoco" 0 "$p: 14 Tabs seguidos, todos com foco visível"
done
ab a open "$BASE/" >/dev/null; sleep 1
ab a eval "document.querySelector('summary').focus()" >/dev/null
ab a press Enter >/dev/null
expect_eq "$(ab a eval "document.querySelector('details').open")" true "FAQ abre com Enter"
ab a press Space >/dev/null
expect_eq "$(ab a eval "document.querySelector('details').open")" false "FAQ fecha com Espaço"
ab a set viewport 390 844 >/dev/null; ab a open "$BASE/" >/dev/null; sleep 1
expect_eq "$(ab a eval "[...document.querySelectorAll('nav[aria-label=\"Seções\"] a')].every(a=>a.offsetParent!==null)" )" true "390 px: todos os links do menu visíveis e acessíveis"
ab a set media light reduced-motion >/dev/null; ab a open "$BASE/" >/dev/null; sleep 1
expect_eq "$(ab a eval "matchMedia('(prefers-reduced-motion: reduce)').matches")" true "emulação prefers-reduced-motion ativa"
expect_eq "$(ab a eval "[...document.querySelectorAll('*')].filter(e=>{const c=getComputedStyle(e);return (parseFloat(c.transitionDuration)>0&&c.transitionProperty!=='none')||(parseFloat(c.animationDuration)>0&&c.animationName!=='none')}).length")" 0 "com reduced-motion nada anima nem transiciona"
echo "-- contraste WCAG (pares da marca)"
hx contrast && ok "todos os pares de cor >= AA" || bad "contraste" "par abaixo do mínimo"

echo "== j) capturas (390 e 1440, só demo)"
for W in 390 1440; do
  ab a set viewport $W 900 >/dev/null
  for pair in "home:/" "como-funciona:/como-funciona" "sobre:/sobre" "termos:/termos" "privacidade:/privacidade"; do
    ab a open "$BASE${pair#*:}" >/dev/null; sleep 2; ab a screenshot --full "$OUT/S27-${pair%%:*}-$W.png" >/dev/null
  done
  ab a open "$BASE/l/AAAAAAAA" >/dev/null; sleep 1; ab a screenshot "$OUT/S27-link-invalido-$W.png" >/dev/null
done
ab a set viewport 1440 900 >/dev/null; ab a open "$BASE/escolas/$SCHOOL/$SERIE" >/dev/null; sleep 2; ab a screenshot --full "$OUT/S27-lista-compartilhar-1440.png" >/dev/null
stop_server

if [ "${PRODSIM:-1}" = "1" ]; then
  echo "== k) simulação de produção (build com VERCEL_ENV=production; só robots.txt e sitemap.xml)"
  PROD_ORIGIN=https://listacerta.com.br
  PRODSIM_DIRTY=1
  VERCEL_ENV=production NEXT_PUBLIC_SITE_URL=$PROD_ORIGIN pnpm build >"$TMP/build-prod.log" 2>&1 && ok "build simulando produção" || bad "build prodsim" "$(tail -3 "$TMP/build-prod.log")"
  start_server 3013 VERCEL_ENV=production NEXT_PUBLIC_SITE_URL=$PROD_ORIGIN
  P=http://127.0.0.1:3013
  curl -s "$P/robots.txt" -o "$TMP/robots.txt"
  grep -qi '^allow: /$' "$TMP/robots.txt" && ok "robots produção: Allow /" || bad "robots produção" "$(head -3 "$TMP/robots.txt")"
  for d in /escola/ '/escola$' /conta/ /admin/ /papelaria/ /l/ /api/ /auth/; do grep -qF "Disallow: $d" "$TMP/robots.txt" && ok "robots produção bloqueia $d" || bad "robots $d" "ausente"; done
  grep -q "^Disallow: /escolas" "$TMP/robots.txt" && bad "robots" "bloqueia /escolas" || ok "robots produção não bloqueia /escolas"
  grep -qF "Sitemap: $PROD_ORIGIN/sitemap.xml" "$TMP/robots.txt" && ok "robots produção anuncia o sitemap" || bad "robots sitemap" "ausente"
  curl -s "$P/sitemap.xml" -o "$TMP/sitemap-prod.xml"
  grep -q "<loc>$PROD_ORIGIN/como-funciona</loc>" "$TMP/sitemap-prod.xml" && ok "sitemap produção usa a origem canônica" || bad "sitemap produção" "$(head -c 200 "$TMP/sitemap-prod.xml")"
  grep -Eq "9900100|/l/|/papelaria" "$TMP/sitemap-prod.xml" && bad "sitemap produção" "contém demo/lista" || ok "sitemap produção sem demo, listas nem papelarias"
  curl -s "$P/como-funciona" | grep -q "rel=\"canonical\" href=\"$PROD_ORIGIN/como-funciona\"" && ok "canonical produção = origem + caminho" || bad "canonical produção" "diferente"
  stop_server
  pnpm build >"$TMP/build.log" 2>&1 && { PRODSIM_DIRTY=0; ok "build normal restaurado"; } || bad "rebuild" "$(tail -3 "$TMP/build.log")"
fi

echo "== l) suíte anti open-redirect"
pnpm exec vitest run tests/security/open-redirect.test.ts >"$TMP/vt.log" 2>&1 && ok "tests/security/open-redirect.test.ts verde" || bad "open-redirect" "$(tail -5 "$TMP/vt.log")"

echo; echo "TOTAL: $PASS ok, $FAIL falhas"
[ "$FAIL" -eq 0 ]
