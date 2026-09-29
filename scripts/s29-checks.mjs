#!/usr/bin/env node
/**
 * Checagens automáticas da S29 sobre o HTML de cada rota de uma jornada (spec §4).
 * Roda contra `pnpm build && pnpm start -p <porta>` com o Supabase local semeado
 * (scripts/s29-seed-jornadas.sql). Nunca contra staging ou produção.
 *
 * Uso: node scripts/s29-checks.mjs --jornada J1[,J2|all] [--out docs/revisao-total/checks.md]
 * Ambiente (defaults da trilha 3):
 *   BASE=http://127.0.0.1:3003  MAILPIT=http://127.0.0.1:54624  DB=supabase_db_listacerta-t3
 * Saída: a seção de cada jornada (entre marcadores) em --out; código 1 se alguma rota ou o CSS falhar.
 * Só abre e fecha as sessões do agent-browser `s29-t4-*`; nunca `close --all`.
 *
 * Checagens por rota: uma ação principal por região, beco sem saída, botão fora do sistema (HTML buscado com o
 * cookie da conta do papel) e, no navegador a 390 px: rolagem horizontal, main, h1, alvo de toque < 44 px, texto < 12 px.
 * Checagem global do CSS publicado: movimento fora dos tokens (120/200/320 ms).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { JSDOM } from "jsdom";
import { tsImport } from "tsx/esm/api";

import { PROBE, createSessions } from "./lib/sessions.mjs";

const { countPrimaryPerRegion, findDeadEnds, findOffSystemButtons, findOffTokenMotion } = await tsImport("../lib/ux-checks/index.ts", import.meta.url);
const { JOURNEYS } = await tsImport("../lib/ux-checks/journeys.ts", import.meta.url);
const { encodeShortCode } = await tsImport("../features/short-links/code.ts", import.meta.url);

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0) return argv[i + 1];
  return argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? null;
};
const BASE = process.env.BASE ?? "http://127.0.0.1:3003";
const MAILPIT = process.env.MAILPIT ?? "http://127.0.0.1:54624";
const DB = process.env.DB ?? "supabase_db_listacerta-t3";
const OUT = flag("out") ?? "docs/revisao-total/checks.md";
const sessionName = (k) => `s29-t4-${k}`;
const { ab, login, assertLogged, cookieHeader } = createSessions({ base: BASE, mailpit: MAILPIT, sessionName });

/** Contas de demonstração (scripts/s29-seed-jornadas.sql) e a rota de retorno do login de cada papel. */
const ACCOUNTS = {
  familia: { email: "familia@listacerta.test", next: "/conta" },
  escola: { email: "escola@listacerta.test", next: "/escola" },
  papelaria: { email: "papelaria@listacerta.test", next: "/papelaria" },
  admin: { email: "admin@listacerta.test", next: "/admin" },
  parceiro: { email: "parceiro@listacerta.test", next: "/b2b" },
};

const psql = (q) => {
  try {
    return execFileSync("docker", ["exec", DB, "psql", "-U", "postgres", "-Atq", "-c", q], { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
};
const INEP = process.env.S29_INEP ?? psql("select inep from public.schools where name like 'Escola Demo S29%' limit 1") ?? "99029001";
const SERIE = "ef-5";
const P = {
  inep: INEP,
  serie: SERIE,
  code: encodeShortCode({ inep: INEP, gradeSlug: SERIE }),
  cartId: psql("select id from public.carts where owner_id = '00000000-0000-4000-8000-0000000029a1' order by created_at desc limit 1"),
  retailer: psql("select slug from public.retailers where is_active order by slug limit 1"),
  leadCode: psql("select code from public.leads where code like 'LC-S29%' order by created_at limit 1"),
  submissionId: psql("select id from public.list_submissions where submitted_by = '00000000-0000-4000-8000-0000000029a1' order by created_at desc limit 1"),
  slug: psql("select slug from public.stationeries where slug like 's29-%' limit 1"),
};

const fill = (path) => {
  const missing = [];
  const out = path.replace(/\{(\w+)\}/g, (_, k) => {
    if (!P[k]) missing.push(k);
    return P[k] ?? "";
  });
  return { out, missing };
};

const ids = (flag("jornada") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const chosen = ids.includes("all") ? Object.keys(JOURNEYS) : ids;
if (!chosen.length || chosen.some((j) => !JOURNEYS[j])) {
  console.error(`Uso: node scripts/s29-checks.mjs --jornada <${Object.keys(JOURNEYS).join("|")}|all> [--out arquivo]`);
  process.exit(2);
}

const opened = new Set();
async function ensure(who) {
  if (opened.has(who)) return;
  ab(who, "set", "viewport", "390", "844");
  if (who !== "pub") {
    const a = ACCOUNTS[who];
    await login(who, a.email, a.next);
    await new Promise((res) => setTimeout(res, 1500));
    assertLogged(who, a.next);
  }
  opened.add(who);
}

const cssSeen = new Map();
async function collectCss(doc, pageUrl) {
  for (const link of Array.from(doc.querySelectorAll('link[rel="stylesheet"][href]'))) {
    const url = new URL(link.getAttribute("href"), pageUrl).href;
    if (cssSeen.has(url)) continue;
    try {
      cssSeen.set(url, await (await fetch(url)).text());
    } catch {
      cssSeen.set(url, "");
    }
  }
  Array.from(doc.querySelectorAll("style")).forEach((s, i) => cssSeen.set(`${pageUrl}#style${i}`, s.textContent ?? ""));
}

async function checkRoute(route) {
  const { out: path, missing } = fill(route.path);
  const row = { key: route.path, path, who: route.who, fails: [], notes: [] };
  if (route.skip) {
    row.notes.push(`pulada: ${route.skip}`);
    return row;
  }
  if (missing.length) {
    row.notes.push(`pulada: sem dado semeado (${missing.join(", ")})`);
    return row;
  }
  await ensure(route.who);
  const headers = route.who === "pub" ? {} : { Cookie: cookieHeader(route.who) };
  const res = await fetch(`${BASE}${path}`, { headers, redirect: "follow" });
  const finalPath = new URL(res.url).pathname;
  row.status = res.status;
  const expected = route.status ?? 200;
  if (res.status !== expected) row.fails.push(`HTTP ${res.status} (esperado ${expected})`);
  if (finalPath !== path.split("?")[0]) {
    row.notes.push(`redirecionou para ${finalPath}`);
    if (finalPath.startsWith("/entrar") && route.who !== "pub") row.fails.push("sem sessão (caiu no login)");
  }
  if (!(res.headers.get("content-type") ?? "").includes("text/html")) {
    row.notes.push(`não é HTML (${res.headers.get("content-type") ?? "?"}): só status`);
    return row;
  }
  const doc = new JSDOM(await res.text()).window.document;
  await collectCss(doc, res.url);
  const many = countPrimaryPerRegion(doc).filter((x) => x.count > 1);
  if (many.length) row.fails.push(`mais de uma ação principal: ${many.map((x) => `${x.region}=${x.count}`).join(", ")}`);
  const dead = findDeadEnds(doc, finalPath, new URL(BASE).origin);
  if (dead.length) row.fails.push(`beco sem saída: ${dead.join("; ")}`);
  const off = findOffSystemButtons(doc);
  if (off.length) row.fails.push(`botão fora do sistema (${off.length}): ${off.slice(0, 3).join(" | ")}`);
  // Layout no navegador a 390 px.
  try {
    ab(route.who, "open", `${BASE}${path}`);
    ab(route.who, "wait", "1200");
    const raw = execFileSync("agent-browser", ["--session", sessionName(route.who), "--json", "eval", "--stdin"], { input: PROBE, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const p = JSON.parse(JSON.parse(raw).data.result);
    if (p.sw > p.vw + 1) row.fails.push(`rolagem horizontal ${p.sw}/${p.vw}${p.over.length ? ` (${p.over.slice(0, 2).join("; ")})` : ""}`);
    if (p.main !== 1) row.fails.push(`main=${p.main}`);
    if (p.h1 !== 1) row.fails.push(`h1=${p.h1}`);
    if (p.small.length) row.fails.push(`alvo < 44 px (${p.small.length}): ${p.small.slice(0, 3).join("; ")}`);
    if (p.tiny.length) row.fails.push(`texto < 12 px (${p.tiny.length}): ${p.tiny.slice(0, 3).join("; ")}`);
  } catch (e) {
    row.notes.push(`layout não medido: ${String(e.message).split("\n")[0].slice(0, 80)}`);
  }
  return row;
}

const results = {};
let failures = 0;
try {
  for (const id of chosen) {
    results[id] = [];
    for (const route of JOURNEYS[id].rotas) {
      console.log(`${id} ${route.path}`);
      let row;
      try {
        row = await checkRoute(route);
      } catch (e) {
        row = { key: route.path, path: route.path, who: route.who, fails: [`erro do runner: ${String(e.message).split("\n")[0].slice(0, 120)}`], notes: [] };
      }
      failures += row.fails.length ? 1 : 0;
      results[id].push(row);
    }
  }
} finally {
  for (const who of opened) {
    try {
      ab(who, "close");
    } catch {
      /* sessão já fechada */
    }
  }
}

// Movimento fora dos tokens: CSS publicado, uma vez por execução.
const motion = [...cssSeen.entries()].flatMap(([url, css]) => findOffTokenMotion(css).map((m) => `${new URL(url, BASE).pathname.split("/").pop()}: ${m}`));
const motionUnique = [...new Set(motion)];
failures += motionUnique.length ? 1 : 0;

const md = (id) => {
  const rows = results[id];
  const bad = rows.filter((x) => x.fails.length).length;
  const table = rows
    .map((x) => `| \`${x.path}\` | ${x.who} | ${x.status ?? "-"} | ${x.fails.length ? "falha" : x.notes.some((n) => n.startsWith("pulada")) ? "pulada" : "ok"} | ${[...x.fails, ...x.notes].join("<br>") || "-"} |`)
    .join("\n");
  return `<!-- ${id}:start -->
## ${id} · ${JOURNEYS[id].nome}

Gerado por \`scripts/s29-checks.mjs\` em ${new Date().toISOString()} contra \`${BASE}\`. Rotas com falha: **${bad}** de ${rows.length}.

| Rota | Conta | HTTP | Resultado | Achados |
|---|---|---|---|---|
${table}
<!-- ${id}:end -->
`;
};
const motionMd = `<!-- movimento:start -->
## Movimento fora dos tokens (CSS publicado, ${cssSeen.size} folha(s))

Aceitos: 120/200/320 ms e \`var(--mov-*)\`. Isentos por lista nomeada: \`animate-spin\`, \`animate-pulse\`, \`pesquisa-pulso\`. Achados: **${motionUnique.length}**${motionUnique.length ? "\n\n" + motionUnique.slice(0, 40).map((m) => `- \`${m.slice(0, 200)}\``).join("\n") + (motionUnique.length > 40 ? `\n- ... e mais ${motionUnique.length - 40}` : "") : ""}
<!-- movimento:end -->
`;

let doc = existsSync(OUT) ? readFileSync(OUT, "utf8") : "# Checagens automáticas · S29\n\nUma seção por jornada; regenerada por `node scripts/s29-checks.mjs --jornada <ID>`.\n\n";
const put = (id, body) => {
  const re = new RegExp(`<!-- ${id}:start -->[\\s\\S]*?<!-- ${id}:end -->\\n?`);
  doc = re.test(doc) ? doc.replace(re, () => body) : `${doc.trimEnd()}\n\n${body}`;
};
for (const id of chosen) put(id, md(id));
put("movimento", motionMd);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, doc);
console.log(`${OUT}: ${failures} item(ns) com falha`);
process.exit(failures ? 1 : 0);
