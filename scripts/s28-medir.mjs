#!/usr/bin/env node
/**
 * Medição da S28 (antes/depois): Lighthouse mobile, axe e screenshots 390x844 das páginas principais.
 * Roda contra um `next start` local com o Supabase local e dados de demonstração (nunca staging/produção).
 *
 * Uso: node scripts/s28-medir.mjs <antes|depois> [--only=inicio,busca] [--skip=lighthouse,axe,shots]
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
const OUT = join("docs/superpowers/evidencias/S28", label);
const WORK = join(tmpdir(), `s28-medir-${label}`);
mkdirSync(OUT, { recursive: true });
mkdirSync(WORK, { recursive: true });

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
const sql = (q) => sh("docker", ["exec", DB, "psql", "-U", "postgres", "-Atq", "-c", q]).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const session = (k) => `s28-${label}-${k}`;
const ab = (k, ...a) => sh("agent-browser", ["--session", session(k), ...a]);

const PARENT = "s28pai@listacerta.test";
const STATIONERY = "s14a@listacerta.test"; // papelaria demo A (scripts/e2e-s14-seed.sql)
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
].filter((p) => !only || only.includes(p.key));

async function login(k, email, next) {
  const count = async () => (await (await fetch(`${MAILPIT}/api/v1/search?query=to:${email}`)).json()).messages_count;
  const before = await count();
  ab(k, "open", `${BASE}/entrar?next=${next}`);
  ab(k, "fill", "#email", email);
  ab(k, "press", "Enter");
  for (let i = 0; i < 20 && (await count()) <= before; i++) await sleep(1000);
  const list = await (await fetch(`${MAILPIT}/api/v1/search?query=to:${email}`)).json();
  const msg = await (await fetch(`${MAILPIT}/api/v1/message/${list.messages[0].ID}`)).json();
  ab(k, "open", msg.Text.match(/https?:\/\/[^\s"<>]+/)[0]);
}

async function ensureSessions() {
  ab("pub", "set", "viewport", "390", "844");
  const need = new Set(PAGES.map((p) => p.who));
  if (need.has("pai")) {
    ab("pai", "set", "viewport", "390", "844");
    await login("pai", PARENT, "/");
    await sleep(1500);
    assertLogged("pai", "/enviar-lista");
  }
  if (need.has("pap")) {
    ab("pap", "set", "viewport", "390", "844");
    await login("pap", STATIONERY, "/papelaria");
    await sleep(1500);
    assertLogged("pap", "/papelaria");
  }
}

/** Falha alto se a sessão não está logada de fato (evita medir a tela de login por engano). */
function assertLogged(k, path) {
  const res = JSON.parse(ab(k, "cookies", "get", "--json"));
  const header = res.data.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const out = sh("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code} %{redirect_url}", "-H", `Cookie: ${header}`, `${BASE}${path}`]);
  if (out.includes("/entrar")) throw new Error(`sessão ${k} não está logada para ${path}: ${out}`);
}

function cookieHeader(k) {
  const res = JSON.parse(ab(k, "cookies", "get", "--json"));
  return res.data.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
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
      rows.push(`| ${p.key} | \`${p.path}\` | erro | | | | | | | ${r[0]?.error ?? ""} |`);
      continue;
    }
    const final = ok[0].finalUrl ? new URL(ok[0].finalUrl) : null;
    const redirected = final && final.pathname !== p.path.split("?")[0] ? ` (redirecionou para \`${final.pathname}\`)` : "";
    rows.push(
      `| ${p.key} | \`${p.path}\`${redirected} | ${median(ok.map((x) => x.perf))} | ${median(ok.map((x) => x.a11y))} | ${median(ok.map((x) => x.bp))} | ${median(ok.map((x) => x.seo))} | ${(median(ok.map((x) => x.lcp)) / 1000).toFixed(1)} s | ${median(ok.map((x) => x.cls)).toFixed(3)} | ${Math.round(median(ok.map((x) => x.tbt)))} ms | ${[...new Set(ok.flatMap((x) => x.failedA11y))].join(", ") || "-"} |`,
    );
  }
  const md = `# Lighthouse mobile (${label}) · S28

Build de produção local (\`next start\`, porta ${new URL(BASE).port}), Supabase local com dados de demonstração, Lighthouse 12, emulação mobile padrão (4G simulado, CPU 4x). Mediana de ${RUNS} execuções por página. Páginas logadas usam o cookie de sessão de uma conta de demonstração (\`@listacerta.test\`). Gerado por \`scripts/s28-medir.mjs\` em ${new Date().toISOString()}.

| Página | Rota | Desempenho | Acessibilidade | Boas práticas | SEO | LCP | CLS | TBT | Auditorias de a11y reprovadas |
|---|---|---|---|---|---|---|---|---|---|
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

await ensureSessions();
try {
  if (!skip.has("lighthouse")) runLighthouse();
  if (!skip.has("axe")) runAxe();
  if (!skip.has("shots")) runShots();
} finally {
  for (const k of ["pub", "pai", "pap"]) {
    try {
      ab(k, "close");
    } catch {
      /* sessão não aberta */
    }
  }
}
