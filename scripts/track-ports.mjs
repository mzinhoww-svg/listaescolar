#!/usr/bin/env node
// Dá a um worktree paralelo o seu próprio Supabase local (project_id e portas distintos).
// Uso: node scripts/track-ports.mjs <índice 1-9>   (índice 0 = padrão do repositório)
// Edita supabase/config.toml localmente e o marca com skip-worktree para nunca ser commitado.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const index = Number(process.argv[2]);
if (!Number.isInteger(index) || index < 0 || index > 9) {
  console.error("Uso: node scripts/track-ports.mjs <índice 0-9>");
  process.exit(1);
}
const file = "supabase/config.toml";
const BASE = { api: 54321, db: 54322, shadow: 54320, pooler: 54329, studio: 54323, mail: 54324, analytics: 54327 };
const INSPECTOR = 8083;
const shift = index * 100;

let text = readFileSync(file, "utf8");
const setPort = (section, key, base, offset) => {
  const re = new RegExp(`(\\[${section.replace(".", "\\.")}\\][^\\[]*?\\n${key}\\s*=\\s*)\\d+`);
  if (!re.test(text)) throw new Error(`não achei ${section}.${key} em ${file}`);
  text = text.replace(re, `$1${base + offset}`);
};
setPort("api", "port", BASE.api, shift);
setPort("db", "port", BASE.db, shift);
setPort("db", "shadow_port", BASE.shadow, shift);
setPort("db.pooler", "port", BASE.pooler, shift);
setPort("studio", "port", BASE.studio, shift);
setPort("local_smtp", "port", BASE.mail, shift);
setPort("analytics", "port", BASE.analytics, shift);
setPort("edge_runtime", "inspector_port", INSPECTOR, index);
text = text.replace(/^project_id = ".*"$/m, `project_id = "listacerta${index === 0 ? "" : `-t${index}`}"`);
writeFileSync(file, text);

if (index > 0) {
  execFileSync("git", ["update-index", "--skip-worktree", file]);
  console.log(`Trilha ${index}: API ${BASE.api + shift}, DB ${BASE.db + shift}, e-mail ${BASE.mail + shift}. ${file} marcado skip-worktree.`);
} else {
  execFileSync("git", ["update-index", "--no-skip-worktree", file]);
  console.log("Trilha 0: portas padrão restauradas.");
}
