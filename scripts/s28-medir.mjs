#!/usr/bin/env node
/**
 * Medição da S28 (antes/depois): Lighthouse mobile, axe e screenshots 390x844 das páginas principais.
 * Roda contra um `next start` local com o Supabase local e dados de demonstração (nunca staging/produção).
 *
 * Uso: node scripts/s28-medir.mjs <antes|depois> [--only=inicio,busca] [--skip=lighthouse,axe,shots,checks]
 * Ambiente (defaults da trilha 2):
 *   BASE=http://127.0.0.1:3002  MAILPIT=http://127.0.0.1:54524  DB=supabase_db_listacerta-t2
 *   RUNS=3 (execuções do Lighthouse por página; usa a mediana)
 *   AXE_JS=/caminho/axe.min.js (default: instala axe-core num diretório temporário)
 *   CHROME_PATH (default: Google Chrome do macOS)
 * Saída: docs/superpowers/evidencias/S28/<rótulo>/{lighthouse.md,axe.md,*.png}
 *
 * Só fecha as sessões do agent-browser que abriu (prefixo s28-<rótulo>); nunca `close --all`.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createSessions, PROBE } from "./lib/sessions.mjs";

const label = process.argv[2];
if (!["antes", "depois"].includes(label ?? "")) throw new Error("Uso: s28-medir.mjs <antes|depois>");
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1]?.split(",") ?? null;
const only = arg("only");
const skip = new Set(arg("skip") ?? []);

const BASE = process.env.BASE ?? "http://127.0.0.1:3002";
const MAILPIT = process.env.MAILPIT ?? "http://127.0.0.1:54524";
const DB = process.env.DB ?? "supabase_db_listacerta-t2";
const RUNS = Number(process.env.RUNS ?? 3);
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = process.env.S28_OUT ?? join("docs/superpowers/evidencias/S28", label);
const WORK = join(tmpdir(), `s28-medir-${label}`);
mkdirSync(OUT, { recursive: true });
mkdirSync(WORK, { recursive: true });

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
const sql = (q) => sh("docker", ["exec", DB, "psql", "-U", "postgres", "-Atq", "-c", q]).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const session = (k) => `s28-${label}-${k}`;
const { ab, login, assertLogged, cookieHeader } = createSessions({ base: BASE, mailpit: MAILPIT, sessionName: session });

const PARENT = "s28pai@listacerta.test";
const STATIONERY = "s14a@listacerta.test"; // papelaria demo A (scripts/e2e-s14-seed.sql)
const B2B_OWNER = "parent@listacerta.test"; // dono de parceiro B2B (seed e2e-s24 ou insert em b2b_partner_members)
const SCHOOL = "s28escola@listacerta.test"; // membro aprovado da escola 99001001 (scripts/s28-seed-medicao.sql)
const ADMIN = "admin@listacerta.test"; // admin semeado pelo db:reset (S28 Task 20)
const cartId = sql("select id from public.carts order by created_at desc limit 1");
const PAGES = [
  { key: "inicio", path: "/", who: "pub" },
  { key: "busca", path: "/escolas?q=Demonstra", who: "pub" },
  { key: "escola", path: "/escolas/99001001", who: "pub" },
  { key: "lista", path: "/escolas/99001001/ef-5?ano=2027", who: "pub" },
  { key: "carrinho", path: `/carrinho/${cartId}`, who: "pai" },
  { key: "enviar-lista", path: "/enviar-lista", who: "pai" },
  { key: "login", path: "/entrar", who: "pub" },
  { key: "papelaria", path: "/papelaria", who: "pap" },
  { key: "como-funciona", path: "/como-funciona", who: "pub" },
  // S28 Task 20: áreas fora das 9 páginas originais.
  { key: "cotacao-nova", path: "/cotacao/nova", who: "pai" },
  { key: "conta", path: "/conta", who: "pai" },
  { key: "escola-painel", path: "/escola", who: "esc" },
  { key: "admin", path: "/admin", who: "adm" },
  { key: "b2b", path: "/b2b", who: "b2b" },
  { key: "parceiros", path: "/parceiros", who: "pub" },
].filter((p) => !only || only.includes(p.key));

// Rotas extras só para as checagens de layout (alvo de toque, h1, main, rolagem horizontal, texto < 12 px).
const CHECK_EXTRA = [
  ...["planos", "papelarias", "contestacoes", "ia", "campanhas", "revisao", "parceiros", "eventos", "inadimplencia", "reivindicacoes", "repasses", "auditoria", "denuncias", "importacoes"].map((x) => ({ key: `admin-${x}`, path: `/admin/${x}`, who: "adm" })),
  ...["carrinhos", "compras", "listas-salvas", "notificacoes", "privacidade", "alunos/novo"].map((x) => ({ key: `conta-${x.replace("/", "-")}`, path: `/conta/${x}`, who: "pai" })),
  ...["insights", "widget", "campanhas", "api", "webhooks", "conta", "faturamento", "docs"].map((x) => ({ key: `b2b-${x}`, path: `/b2b/${x}`, who: "b2b" })),
  ...["papelaria-areas", "papelaria-catalogo", "papelaria-creditos", "papelaria-desempenho", "papelaria-leads"].map((x) => ({ key: x, path: `/${x.replace("-", "/")}`, who: "pap" })),
  { key: "escola-nova-lista", path: "/escola/listas/nova", who: "esc" },
  { key: "parceiros-docs", path: "/parceiros/docs", who: "pub" },
  { key: "cadastrar-papelaria", path: "/cadastrar-papelaria", who: "pai" },
  { key: "pesquisa", path: "/pesquisa", who: "pub" },
  { key: "papelaria-publica", path: "/papelarias/s14-papelaria-a", who: "pub" },
].filter((p) => !only || only.includes(p.key));

async function ensureSessions() {
  ab("pub", "set", "viewport", "390", "844");
  const need = new Set(PAGES.map((p) => p.who));
  if (need.has("pai") || CHECK_EXTRA.some((p) => p.who === "pai")) {
    ab("pai", "set", "viewport", "390", "844");
    await login("pai", PARENT, "/");
    await sleep(1500);
    assertLogged("pai", "/enviar-lista");
  }
  if (need.has("esc") || CHECK_EXTRA.some((p) => p.who === "esc")) {
    ab("esc", "set", "viewport", "390", "844");
    await login("esc", SCHOOL, "/escola");
    await sleep(1500);
    assertLogged("esc", "/escola");
  }
  if (need.has("b2b") || CHECK_EXTRA.some((p) => p.who === "b2b")) {
    ab("b2b", "set", "viewport", "390", "844");
    await login("b2b", B2B_OWNER, "/b2b");
    await sleep(1500);
  }
  if (need.has("adm") || CHECK_EXTRA.some((p) => p.who === "adm")) {
    ab("adm", "set", "viewport", "390", "844");
    await login("adm", ADMIN, "/admin");
    await sleep(1500);
  }
  if (need.has("pap") || CHECK_EXTRA.some((p) => p.who === "pap")) {
    ab("pap", "set", "viewport", "390", "844");
    await login("pap", STATIONERY, "/papelaria");
    await sleep(1500);
    assertLogged("pap", "/papelaria");
  }
}

function lighthouse(page) {
  const results = [];
  for (let i = 0; i < RUNS; i++) {
    const out = join(WORK, `${page.key}-${i}.json`);
    const args = [
      "--yes", "lighthouse@12", `${BASE}${page.path}`, "--form-factor=mobile", "--output=json",
      `--output-path=${out}`, "--quiet", "--chrome-flags=--headless=new",
    ];
    if (page.who !== "pub") {
      const f = join(WORK, `hdr-${page.who}.json`);
      writeFileSync(f, JSON.stringify({ Cookie: cookieHeader(page.who) }));
      args.push(`--extra-headers=${f}`);
    }
    try {
      sh("npx", args, { env: { ...process.env, CHROME_PATH: CHROME } });
      const j = JSON.parse(readFileSync(out, "utf8"));
      const a = j.audits;
      const refs = new Set(j.categories.accessibility.auditRefs.map((r) => r.id));
      results.push({
        perf: Math.round((j.categories.performance.score ?? 0) * 100),
        a11y: Math.round((j.categories.accessibility.score ?? 0) * 100),
        bp: Math.round((j.categories["best-practices"].score ?? 0) * 100),
        seo: Math.round((j.categories.seo.score ?? 0) * 100),
        lcp: a["largest-contentful-paint"].numericValue,
        cls: a["cumulative-layout-shift"].numericValue,
        tbt: a["total-blocking-time"].numericValue,
        jsKb: (a["network-requests"]?.details?.items ?? []).filter((x) => x.resourceType === "Script").reduce((t, x) => t + (x.transferSize ?? 0), 0) / 1024,
        finalUrl: j.finalDisplayedUrl,
        failedA11y: Object.values(a).filter((x) => refs.has(x.id) && x.scoreDisplayMode === "binary" && x.score === 0).map((x) => x.id),
      });
    } catch (e) {
      results.push({ error: String(e.message).split("\n")[0] });
    }
  }
  return results;
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

function runLighthouse() {
  const rows = [];
  for (const p of PAGES) {
    console.log(`lighthouse ${p.key}`);
    const r = lighthouse(p);
    const ok = r.filter((x) => !x.error);
    if (!ok.length) {
      rows.push(`| ${p.key} | \`${p.path}\` | erro | | | | | | | | ${r[0]?.error ?? ""} |`);
      continue;
    }
    const final = ok[0].finalUrl ? new URL(ok[0].finalUrl) : null;
    const redirected = final && final.pathname !== p.path.split("?")[0] ? ` (redirecionou para \`${final.pathname}\`)` : "";
    rows.push(
      `| ${p.key} | \`${p.path}\`${redirected} | ${median(ok.map((x) => x.perf))} | ${median(ok.map((x) => x.a11y))} | ${median(ok.map((x) => x.bp))} | ${median(ok.map((x) => x.seo))} | ${(median(ok.map((x) => x.lcp)) / 1000).toFixed(1)} s | ${median(ok.map((x) => x.cls)).toFixed(3)} | ${Math.round(median(ok.map((x) => x.tbt)))} ms | ${Math.round(median(ok.map((x) => x.jsKb)))} KB | ${[...new Set(ok.flatMap((x) => x.failedA11y))].join(", ") || "-"} |`,
    );
  }
  const md = `# Lighthouse mobile (${label}) · S28

Build de produção local (\`next start\`, porta ${new URL(BASE).port}), Supabase local com dados de demonstração, Lighthouse 12, emulação mobile padrão (4G simulado, CPU 4x). Mediana de ${RUNS} execuções por página. Páginas logadas usam o cookie de sessão de uma conta de demonstração (\`@listacerta.test\`). Gerado por \`scripts/s28-medir.mjs\` em ${new Date().toISOString()}.

| Página | Rota | Desempenho | Acessibilidade | Boas práticas | SEO | LCP | CLS | TBT | JS transferido | Auditorias de a11y reprovadas |
|---|---|---|---|---|---|---|---|---|---|---|
${rows.join("\n")}
`;
  writeFileSync(join(OUT, "lighthouse.md"), md);
}

function axeJs() {
  if (process.env.AXE_JS) return readFileSync(process.env.AXE_JS, "utf8");
  const dir = join(WORK, "axe");
  mkdirSync(dir, { recursive: true });
  sh("npm", ["i", "--prefix", dir, "axe-core"]);
  return readFileSync(join(dir, "node_modules/axe-core/axe.min.js"), "utf8");
}

function runAxe() {
  const lib = axeJs();
  const version = lib.match(/axe v(\d+\.\d+\.\d+)/)?.[1] ?? "";
  const script = `${lib}
;(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']}});
return JSON.stringify({url:location.pathname,passes:r.passes.length,violations:r.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.length,sample:v.nodes.slice(0,2).map(n=>n.target.join(' '))}))})})()`;
  const sections = [];
  const totals = [];
  for (const p of PAGES) {
    console.log(`axe ${p.key}`);
    const k = p.who;
    ab(k, "open", `${BASE}${p.path}`);
    ab(k, "wait", "1500");
    let list;
    let meta = "";
    try {
      const raw = execFileSync("agent-browser", ["--session", session(k), "--json", "eval", "--stdin"], { input: script, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      const parsed = JSON.parse(JSON.parse(raw).data.result);
      list = parsed.violations;
      meta = `Página avaliada: \`${parsed.url}\`; regras aprovadas: ${parsed.passes}.\n\n`;
    } catch (e) {
      sections.push(`## ${p.key} (\`${p.path}\`)\n\nErro ao rodar axe: ${String(e.message).split("\n")[0]}\n`);
      continue;
    }
    const by = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    for (const v of list) by[v.impact ?? "minor"] += 1;
    totals.push(`| ${p.key} | ${by.critical} | ${by.serious} | ${by.moderate} | ${by.minor} |`);
    const detail = list.length
      ? list.map((v) => `- **${v.impact}** \`${v.id}\`: ${v.help} (${v.nodes} elemento(s); ex.: \`${v.sample.join("`, `")}\`)`).join("\n")
      : "- Nenhuma violação.";
    sections.push(`## ${p.key} (\`${p.path}\`)\n\n${meta}${detail}\n`);
  }
  const md = `# axe-core (${label}) · S28

axe-core ${version} injetado na página com viewport 390x844, tags wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa e best-practice. Contagem por regra violada (não por elemento) e por impacto. Gerado por \`scripts/s28-medir.mjs\` em ${new Date().toISOString()}.

| Página | Críticas | Sérias | Moderadas | Leves |
|---|---|---|---|---|
${totals.join("\n")}

${sections.join("\n")}`;
  writeFileSync(join(OUT, "axe.md"), md);
}

function runShots() {
  for (const p of PAGES) {
    console.log(`shot ${p.key}`);
    ab(p.who, "open", `${BASE}${p.path}`);
    ab(p.who, "wait", "2000");
    ab(p.who, "screenshot", join(OUT, `${p.key}.png`));
  }
}

// Sonda de layout (PROBE) vem de scripts/lib/sessions.mjs.

function runChecks() {
  const rows = [];
  const details = [];
  let bad = 0;
  for (const p of [...PAGES, ...CHECK_EXTRA]) {
    console.log(`check ${p.key}`);
    try {
      ab(p.who, "open", `${BASE}${p.path}`);
      ab(p.who, "wait", "1200");
      const raw = execFileSync("agent-browser", ["--session", session(p.who), "--json", "eval", "--stdin"], { input: PROBE, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      const r = JSON.parse(JSON.parse(raw).data.result);
      const moved = r.path !== p.path.split("?")[0] ? ` → \`${r.path}\`` : "";
      const noScroll = r.sw <= r.vw + 1;
      const fails = [!noScroll && "rolagem", r.main !== 1 && `main=${r.main}`, r.h1 !== 1 && `h1=${r.h1}`, r.small.length && `alvos=${r.small.length}`, r.tiny.length && `texto<12=${r.tiny.length}`].filter(Boolean);
      if (fails.length && !moved) bad += 1;
      rows.push(`| ${p.key} | \`${p.path}\`${moved} | ${r.sw}/${r.vw} | ${r.main} | ${r.h1} | ${r.small.length} | ${r.tiny.length} | ${moved ? "redirecionou" : fails.join(", ") || "ok"} |`);
      if (fails.length && !moved) details.push(`### ${p.key}\n${r.over.length ? `- estouro: ${r.over.join("; ")}\n` : ""}${r.small.length ? `- alvos < 44 px: ${r.small.join("; ")}\n` : ""}${r.tiny.length ? `- texto < 12 px: ${r.tiny.join("; ")}\n` : ""}`);
    } catch (e) {
      rows.push(`| ${p.key} | \`${p.path}\` | erro | | | | | ${String(e.message).split("\n")[0].slice(0, 80)} |`);
    }
  }
  const md = `# Checagens de layout a 390 px (${label}) · S28

Gerado por \`scripts/s28-medir.mjs\` em ${new Date().toISOString()}. Cada rota é aberta em 390x844 com a conta de demonstração do papel indicado; "redirecionou" = a conta não vê a rota (sem dado semeado ou sem papel), não conta como falha. Critérios: sem rolagem horizontal da página (largura de rolagem/viewport), exatamente um \`main\` e um \`h1\`, nenhum alvo de toque menor que 44 px (link em linha de texto isento) e nenhum texto abaixo de 12 px.

Rotas com falha: **${bad}**

| Chave | Rota | Rolagem/viewport | main | h1 | Alvos < 44 px | Texto < 12 px | Resultado |
|---|---|---|---|---|---|---|---|
${rows.join("\n")}

## Detalhe das falhas

${details.join("\n") || "Nenhuma."}
`;
  writeFileSync(join(OUT, "checks.md"), md);
  console.log(`checks: ${bad} rota(s) com falha`);
}

await ensureSessions();
try {
  if (!skip.has("lighthouse")) runLighthouse();
  if (!skip.has("axe")) runAxe();
  if (!skip.has("shots")) runShots();
  if (!skip.has("checks")) runChecks();
} finally {
  for (const k of ["pub", "pai", "pap", "adm", "b2b", "esc"]) {
    try {
      ab(k, "close");
    } catch {
      /* sessão não aberta */
    }
  }
}
