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
 * Só abre e fecha as sessões do agent-browser `s29-t10-*`; nunca `close --all`.
 *
 * Checagens por rota: uma ação principal por região, beco sem saída, botão fora do sistema e ação irreversível sem
 * confirmação (HTML buscado com o cookie da conta do papel) e, no navegador a 390 px: rolagem horizontal, main, h1,
 * alvo de toque < 44 px (P1 < 24 px, P2 de 24 a 43 px), ação escondida por tabela larga, texto < 12 px.
 * Checagem global do CSS publicado: movimento fora dos tokens (120/200/320 ms).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { JSDOM } from "jsdom";
import { tsImport } from "tsx/esm/api";

import { PROBE, createSessions } from "./lib/sessions.mjs";

const { classifyHiddenActions, classifyTargets, countPrimaryPerRegion, findDeadEnds, findOffSystemButtons, findOffTokenMotion, findUnconfirmedDestructive } = await tsImport("../lib/ux-checks/index.ts", import.meta.url);
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
const sessionName = (k) => `${process.env.S29_SESSION ?? "s29-t10"}-${k}`;
const { ab, login, assertLogged, cookieHeader } = createSessions({ base: BASE, mailpit: MAILPIT, sessionName });

/** Contas de demonstração (scripts/s29-seed-jornadas.sql) e a rota de retorno do login de cada papel. */
const ACCOUNTS = {
  familia: { email: "familia@listacerta.test", next: "/conta" },
  escola: { email: "escola@listacerta.test", next: "/escola" },
  papelaria: { email: "papelaria@listacerta.test", next: "/papelaria" },
  admin: { email: "admin@listacerta.test", next: "/admin" },
  parceiro: { email: "parceiro@listacerta.test", next: "/b2b" },
  marca: { email: "marca@listacerta.test", next: "/b2b" },
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
const U = "00000000-0000-4000-8000-";
/** Devolve o id só se a linha semeada existe (senão a rota é pulada e registrada). */
const seeded = (table, id) => psql(`select id from public.${table} where id = '${id}'`);
const P = {
  inep: INEP,
  serie: SERIE,
  code: encodeShortCode({ inep: INEP, gradeSlug: SERIE }),
  inepLivre: psql("select inep from public.schools where id = '" + U + "000000290101'"),
  inepLongo: psql("select inep from public.schools where id = '" + U + "000000290102'"),
  inepVerificando: psql("select inep from public.schools where id = '" + U + "000000290112'"),
  // Token só sintático (43 caracteres base64url): o GET nunca consome token, só mostra a tela de confirmação.
  tokenFalso: "S29S29S29S29S29S29S29S29S29S29S29S29S29S29S29",
  cartId: seeded("carts", U + "0000000029d2"),
  listVersionId: psql("select current_version_id from public.school_lists where school_id = '" + U + "0000000029b1' and school_year = 2027"),
  // L-C7: varejista fixo (o de `retailers` mais antigo por ordem de slug mudava com o banco); DEMO_RETAILERS liga os quatro.
  retailer: psql("select slug from public.retailers where is_active and slug = 'mercadolivre'"),
  // Códigos fixos do seed: recebido (sem cotação) e cotação enviada (com valor).
  leadCode: psql("select code from public.leads where code = 'LC-S29D1'"),
  leadCodeQuote: psql("select code from public.leads where code = 'LC-S29D4'"),
  // L-C8: o envio semeado em revisão humana (com cópia privada), não o mais recente.
  submissionId: seeded("list_submissions", U + "0000000029e3"),
  reviewId: seeded("list_submissions", U + "0000000029e3"),
  listId: psql("select id from public.school_lists where school_id = '" + U + "0000000029b1' and school_year = 2027"),
  claimId: seeded("claims", U + "000000290201"),
  stationeryId: seeded("stationeries", U + "000000290301"),
  reportId: seeded("reports", U + "000000290701"),
  batchId: seeded("import_batches", U + "000000290801"),
  partnerId: seeded("b2b_partners", U + "000000290b02"),
  studentId: seeded("students", U + "000000290a01"),
  invoiceId: seeded("invoices", U + "000000290901"),
  slug: psql("select slug from public.stationeries where slug = 's29-papelaria-demo'"),
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
  const fetched = await res.text();
  await collectCss(new JSDOM(fetched).window.document, res.url);
  // Layout no navegador a 390 px. O DOM renderizado (depois da hidratação) alimenta as checagens de HTML: telas só de cliente
  // (ex.: /pesquisa, dentro de Suspense) não trazem botões no HTML do servidor.
  let html = fetched;
  try {
    ab(route.who, "open", `${BASE}${path}`);
    ab(route.who, "wait", "1200");
    const raw = execFileSync("agent-browser", ["--session", sessionName(route.who), "--json", "eval", "--stdin"], { input: PROBE, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const p = JSON.parse(JSON.parse(raw).data.result);
    if (p.sw > p.vw + 1) row.fails.push(`rolagem horizontal ${p.sw}/${p.vw}${p.over.length ? ` (${p.over.slice(0, 2).join("; ")})` : ""}`);
    if (p.main !== 1) row.fails.push(`main=${p.main}`);
    if (p.h1 !== 1) row.fails.push(`h1=${p.h1}`);
    const targets = classifyTargets(p.targets ?? []);
    if (targets.p1.length + targets.p2.length) row.fails.push(`alvo < 44 px (${targets.summary}): ${[...targets.p1, ...targets.p2].slice(0, 3).join("; ")}`);
    const hidden = classifyHiddenActions(p.acts ?? []);
    if (hidden.length) row.fails.push(`ação escondida por tabela larga (${hidden.length}): ${hidden.slice(0, 3).join("; ")}`);
    if (p.tiny.length) row.fails.push(`texto < 12 px (${p.tiny.length}): ${p.tiny.slice(0, 3).join("; ")}`);
    const dom = JSON.parse(execFileSync("agent-browser", ["--session", sessionName(route.who), "--json", "eval", "--stdin"], { input: "document.documentElement.outerHTML", encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })).data.result;
    if (typeof dom === "string" && dom.length > 200) html = dom;
  } catch (e) {
    row.notes.push(`layout não medido: ${String(e.message).split("\n")[0].slice(0, 80)}`);
  }
  const doc = new JSDOM(html).window.document;
  const many = countPrimaryPerRegion(doc).filter((x) => x.count > 1);
  if (many.length) row.fails.push(`mais de uma ação principal: ${many.map((x) => `${x.region}=${x.count}`).join(", ")}`);
  const dead = findDeadEnds(doc, finalPath, new URL(BASE).origin);
  if (dead.length) row.fails.push(`beco sem saída: ${dead.join("; ")}`);
  const off = findOffSystemButtons(doc);
  if (off.length) row.fails.push(`botão fora do sistema (${off.length}): ${off.slice(0, 3).join(" | ")}`);
  const irreversible = findUnconfirmedDestructive(doc);
  if (irreversible.length) row.fails.push(`ação irreversível sem confirmação (${irreversible.length}): ${irreversible.slice(0, 3).join(" | ")}`);
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
