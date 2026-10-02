#!/usr/bin/env node
// Ignored Build Step da Vercel (T4). Convenção da Vercel: exit 0 = PULAR o build; exit 1 = construir.
// Pula só quando TODOS os arquivos do commit são docs/**, *.md ou .claude/**. Em dúvida (sem git, erro), constrói.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** true se o caminho não afeta o app. */
export function isIgnorablePath(path) {
  const p = path.replace(/^\.\//, "");
  return p.startsWith("docs/") || p.startsWith(".claude/") || p.endsWith(".md");
}

/** true => pular o deploy (lista não vazia e toda ignorável). */
export function shouldSkipBuild(changedFiles) {
  const files = changedFiles.map((f) => f.trim()).filter(Boolean);
  return files.length > 0 && files.every(isIgnorablePath);
}

function main() {
  let files;
  try {
    const base = process.env.VERCEL_GIT_PREVIOUS_SHA || "HEAD^";
    files = execFileSync("git", ["diff", "--name-only", base, "HEAD"], { encoding: "utf8" }).split("\n");
  } catch {
    console.log("Sem diff disponível: construindo.");
    process.exit(1);
  }
  if (shouldSkipBuild(files)) {
    console.log("Só docs/**, *.md e .claude/** mudaram: pulando o deploy.");
    process.exit(0);
  }
  console.log("Mudança em código ou configuração: construindo.");
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
