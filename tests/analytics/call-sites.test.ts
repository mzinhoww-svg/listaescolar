import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { EVENT_NAMES } from "@/lib/analytics/schema";

const ROOT = join(__dirname, "..", "..");
const DIRS = ["app", "features", "components", "lib", "supabase/functions"];
/** Nomes proibidos como chave em qualquer chamada de medição. */
const FORBIDDEN_KEYS = ["email", "phone", "telefone", "nome", "name", "apelido", "nickname", "cpf", "cnpj", "text", "query", "message", "student", "grade_label"];
/** Eventos que nascem de transição SQL sem ponto único no Node: esquema pronto, emissão adiada (Ruling S28 T24). */
const NOT_YET_EMITTED = ["lead_converted", "catalog_activated"];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (e === "node_modules" || e.startsWith(".")) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

/** Texto entre o delimitador de abertura em `from` e o seu par (aninhamento respeitado). */
function balanced(src: string, from: number, open: string, close: string): string {
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close && --depth === 0) return src.slice(from, i + 1);
  }
  return src.slice(from);
}

type Site = { file: string; name: string; args: string };

function findSites(): Site[] {
  const sites: Site[] = [];
  for (const d of DIRS) {
    for (const f of walk(join(ROOT, d))) {
      const rel = relative(ROOT, f);
      // o próprio módulo de medição e o seu contrato ficam de fora (definem `track`, não o chamam com evento)
      if (rel.startsWith("lib/analytics/") || rel.includes("_shared/analytics/")) continue;
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/\b(?:track|captureServer|captureUserAction)\(\s*(["'])([^"']+)\1/g)) {
        sites.push({ file: rel, name: m[2]!, args: balanced(src, src.indexOf("(", m.index), "(", ")") });
      }
      // `captureLogin(método, ...)` é o helper de `login_completed` (a conta vem da autenticação, não da sessão)
      for (const m of src.matchAll(/\bcaptureLogin\(/g)) {
        sites.push({ file: rel, name: "login_completed", args: balanced(src, m.index + "captureLogin".length, "(", ")") });
      }
      for (const m of src.matchAll(/\bsafeEmit\(\s*[^,]+,\s*(["'])([^"']+)\1/g)) {
        sites.push({ file: rel, name: m[2]!, args: balanced(src, src.indexOf("(", m.index), "(", ")") });
      }
      for (const m of src.matchAll(/<(?:TrackView|TrackClick)\s+name=(["'])([^"']+)\1/g)) {
        const at = src.indexOf("props=", m.index);
        sites.push({ file: rel, name: m[2]!, args: at < 0 ? "" : balanced(src, src.indexOf("{", at), "{", "}") });
      }
      // helpers tipados do próprio módulo de medição que emitem um evento fixo
      if (/\btrackUploadStarted\(/.test(src)) sites.push({ file: rel, name: "list_upload_started", args: "" });
    }
  }
  return sites;
}

describe("contrato dos pontos de chamada de medição", () => {
  const sites = findSites();

  it("encontra chamadas (o teste não passa por não achar nada)", () => {
    expect(sites.length).toBeGreaterThan(15);
  });

  it("o primeiro argumento é sempre um evento do esquema", () => {
    const bad = sites.filter((s) => !(EVENT_NAMES as string[]).includes(s.name));
    expect(bad.map((s) => `${s.file}: ${s.name}`)).toEqual([]);
  });

  it("nenhuma chamada passa chave de dado pessoal, texto livre ou consulta", () => {
    const offenders: string[] = [];
    for (const s of sites) {
      for (const k of FORBIDDEN_KEYS) {
        if (new RegExp(`(^|[\\s,{])${k}\\s*:`, "i").test(s.args)) offenders.push(`${s.file}: ${s.name} passa "${k}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("todo evento do esquema tem ponto de chamada, exceto os adiados por Ruling", () => {
    const used = new Set(sites.map((s) => s.name));
    const missing = EVENT_NAMES.filter((n) => !used.has(n) && !NOT_YET_EMITTED.includes(n));
    expect(missing).toEqual([]);
    for (const n of NOT_YET_EMITTED) expect(EVENT_NAMES).toContain(n);
  });

  it("nenhum ponto de chamada usa storage nem cookie para medição fora de lib/analytics", () => {
    for (const s of new Set(sites.map((x) => x.file))) {
      const src = readFileSync(join(ROOT, s), "utf8");
      expect(src, s).not.toMatch(/lc_analytics/);
    }
  });
});
