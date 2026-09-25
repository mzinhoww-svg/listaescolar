#!/usr/bin/env node
// Wrapper do Supabase CLI com isolamento por trilha paralela.
// A trilha vem de `TRACK=<1-9>` ou do arquivo `.track` (gitignored) na raiz do worktree; sem trilha (ou 0)
// roda `supabase` direto. Com trilha, gera `.track-workdir/supabase/config.toml` (derivado do
// supabase/config.toml versionado, com project_id e portas deslocados) e roda o CLI com `--workdir`.
// O config versionado nunca é alterado. Uso: `node scripts/supa.mjs <args do supabase>`.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const BASE_PORTS = { api: 54321, db: 54322, shadow: 54320, pooler: 54329, studio: 54323, mail: 54324, analytics: 54327 };
const INSPECTOR = 8083;
const APP_PORT = 3000;

export function parseTrack(raw) {
  const index = Number(raw);
  if (!Number.isInteger(index) || index < 0 || index > 9) throw new Error(`TRACK inválido: ${raw}`);
  return index;
}

function setPort(text, section, key, value) {
  const header = `[${section}]`;
  const start = text.indexOf(`\n${header}\n`);
  if (start < 0) throw new Error(`seção ${header} não encontrada em supabase/config.toml`);
  const next = text.indexOf("\n[", start + header.length + 2);
  const block = text.slice(start, next < 0 ? undefined : next);
  const re = new RegExp(`(\\n${key}\\s*=\\s*)\\d+`);
  if (!re.test(block)) throw new Error(`${section}.${key} não encontrado em supabase/config.toml`);
  const replaced = block.replace(re, (_m, prefix) => `${prefix}${value}`);
  return text.slice(0, start) + replaced + (next < 0 ? "" : text.slice(next));
}

export function deriveConfig(text, index) {
  const shift = index * 100;
  let out = text;
  out = setPort(out, "api", "port", BASE_PORTS.api + shift);
  out = setPort(out, "db", "port", BASE_PORTS.db + shift);
  out = setPort(out, "db", "shadow_port", BASE_PORTS.shadow + shift);
  out = setPort(out, "db.pooler", "port", BASE_PORTS.pooler + shift);
  out = setPort(out, "studio", "port", BASE_PORTS.studio + shift);
  out = setPort(out, "local_smtp", "port", BASE_PORTS.mail + shift);
  out = setPort(out, "analytics", "port", BASE_PORTS.analytics + shift);
  out = setPort(out, "edge_runtime", "inspector_port", INSPECTOR + index);
  if (!/^project_id = ".*"$/m.test(out)) throw new Error("project_id não encontrado");
  out = out.replace(/^project_id = ".*"$/m, () => `project_id = "listacerta-t${index}"`);
  // o app da trilha sobe em 3000+índice: site_url e redirects do auth acompanham
  out = out.replaceAll(`:${APP_PORT}`, () => `:${APP_PORT + index}`);
  return out;
}

// `env`: imprime as variáveis para o .env.local da trilha (valores locais; não versionar).
function printEnv(root, index, workdir) {
  const base = index === 0 ? [] : ["--workdir", workdir];
  const out = execFileSync("supabase", [...base, "status", "-o", "env"], { cwd: root, encoding: "utf8" });
  const get = (key) => new RegExp(`^${key}="?([^"\\n]+)"?$`, "m").exec(out)?.[1] ?? "";
  console.log(`NEXT_PUBLIC_SUPABASE_URL=${get("API_URL")}`);
  console.log(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${get("PUBLISHABLE_KEY")}`);
  console.log(`SUPABASE_SECRET_KEY=${get("SECRET_KEY")}`);
  console.log(`NEXT_PUBLIC_SITE_URL=http://127.0.0.1:${APP_PORT + index}`);
  console.log(`# e-mails (Mailpit): ${get("MAILPIT_URL")}  |  app: PORT=${APP_PORT + index} pnpm dev`);
}

function prepareWorkdir(root, workdir, index) {
  rmSync(workdir, { recursive: true, force: true });
  const sdir = join(workdir, "supabase");
  mkdirSync(sdir, { recursive: true });
  for (const name of readdirSync(join(root, "supabase"))) {
    if (name === "config.toml" || name === ".temp" || name === ".branches") continue;
    symlinkSync(join(root, "supabase", name), join(sdir, name));
  }
  writeFileSync(join(sdir, "config.toml"), deriveConfig(readFileSync(join(root, "supabase", "config.toml"), "utf8"), index));
}

function main() {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const workdir = join(root, ".track-workdir");
  const trackFile = join(root, ".track");
  const index = parseTrack(process.env.TRACK ?? (existsSync(trackFile) ? readFileSync(trackFile, "utf8").trim() : "0"));
  const args = process.argv.slice(2);
  if (args[0] === "env") {
    if (index !== 0) prepareWorkdir(root, workdir, index);
    printEnv(root, index, workdir);
    return;
  }
  if (index === 0) {
    process.exit(spawnSync("supabase", args, { cwd: root, stdio: "inherit" }).status ?? 1);
  }
  prepareWorkdir(root, workdir, index);
  const result = spawnSync("supabase", ["--workdir", workdir, ...args], { cwd: root, stdio: "inherit" });
  process.exit(result.status ?? 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
