#!/usr/bin/env node
// Aplica supabase/migrations/*.sql em ordem de nome contra o banco de DATABASE_URL (S20, go-live).
// Só usa `psql` (uma transação por arquivo, ON_ERROR_STOP) e registra em supabase_migrations.schema_migrations
// (mesmo formato do CLI: version = prefixo numérico do arquivo, name = resto do nome). O que já foi aplicado é
// identificado por NOME, não por versão: o histórico do staging usa versões por timestamp.
//
// Uso (padrão = dry-run, não altera nada):
//   DATABASE_URL=... node scripts/prod-migrate.mjs                      # lista o que seria aplicado
//   node scripts/prod-migrate.mjs --applied-file=historico.json         # planeja offline, sem banco
//   DATABASE_URL=... node scripts/prod-migrate.mjs --apply --confirm-production=<ref>
// Flags: --apply, --dry-run, --allow-staging, --confirm-production=<ref>, --applied-file=<json>, --dir=<pasta>.
// Nunca imprime a URL nem a senha.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const STAGING_REF = "hojbnqkwzsicahzgshne";
const FILE_RE = /^(\d+)_([a-z0-9_]+)\.sql$/;
const REF_RE = /(?:postgres\.|db\.)([a-z0-9]{20})(?=[:.@/]|$)/;

/** Ordena por nome de arquivo e extrai version/name. Recusa nome fora do padrão e version/name repetidos. */
export function parseMigrationFiles(fileNames) {
  const sorted = fileNames.filter((f) => f.endsWith(".sql")).sort();
  const seenV = new Set();
  const seenN = new Set();
  return sorted.map((file) => {
    const m = FILE_RE.exec(file);
    if (!m) throw new Error(`Nome de migration fora do padrão <numero>_<nome>.sql: ${file}`);
    const [, version, name] = m;
    if (seenV.has(version)) throw new Error(`Versão repetida entre migrations: ${version}`);
    if (seenN.has(name)) throw new Error(`Nome repetido entre migrations: ${name}`);
    seenV.add(version);
    seenN.add(name);
    return { file, version, name };
  });
}

/**
 * Compara arquivos locais com o histórico remoto (lista de {version, name}), por NOME.
 * drift: nome remoto que não existe localmente, ou versão remota igual a uma local com nome diferente.
 */
export function planMigrations(local, applied) {
  const localByName = new Map(local.map((l) => [l.name, l]));
  const localByVersion = new Map(local.map((l) => [l.version, l]));
  const appliedNames = new Set(applied.map((a) => a.name));
  const drift = [];
  for (const a of applied) {
    const sameVersion = localByVersion.get(a.version);
    if (sameVersion && sameVersion.name !== a.name) {
      drift.push({ kind: "version_name_mismatch", version: a.version, remoteName: a.name, localName: sameVersion.name });
    } else if (!localByName.has(a.name)) {
      drift.push({ kind: "unknown_remote", version: a.version, remoteName: a.name });
    }
  }
  return {
    alreadyApplied: local.filter((l) => appliedNames.has(l.name)),
    pending: local.filter((l) => !appliedNames.has(l.name)),
    drift,
  };
}

/** Extrai o project ref de uma URL do Supabase (db.<ref>.supabase.co ou usuário postgres.<ref> do pooler). */
export function extractRef(url) {
  const m = REF_RE.exec(url);
  return m ? m[1] : null;
}

export function isLocalUrl(url) {
  return /@(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(url);
}

/** Erros de guarda (lista vazia = pode seguir). Staging e produção nunca passam sem a flag explícita. */
export function checkGuards({ databaseUrl, apply, allowStaging, confirmProduction }) {
  const errors = [];
  if (!databaseUrl) return errors; // modo offline (--applied-file): nada a proteger
  if (databaseUrl.includes(STAGING_REF)) {
    if (!allowStaging) errors.push("DATABASE_URL aponta para o staging: use --allow-staging para continuar.");
    return errors;
  }
  if (isLocalUrl(databaseUrl)) return errors;
  if (apply) {
    const ref = extractRef(databaseUrl);
    if (!ref) errors.push("Não foi possível extrair o ref do projeto da DATABASE_URL; recusado.");
    else if (confirmProduction !== ref) {
      errors.push("Banco remoto: informe --confirm-production=<ref> igual ao ref da URL para aplicar.");
    }
  }
  return errors;
}

/** Troca senha e a URL inteira por marcadores em qualquer texto (saída de erro, logs). */
export function maskSecrets(text, url) {
  if (!url) return text;
  let out = String(text).split(url).join("<DATABASE_URL>");
  try {
    const u = new URL(url);
    for (const secret of [decodeURIComponent(u.password), u.password]) {
      if (secret) out = out.split(secret).join("***");
    }
  } catch {
    /* URL inválida: só a troca da URL inteira */
  }
  return out;
}

/** Forma segura de exibir o alvo: host e ref, sem usuário nem senha. */
export function describeTarget(url) {
  try {
    const u = new URL(url);
    const ref = extractRef(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ""}${ref ? ` (ref ${ref})` : ""}`;
  } catch {
    return "<url inválida>";
  }
}

export function parseArgs(argv) {
  const args = { apply: false, allowStaging: false, confirmProduction: undefined, appliedFile: undefined, dir: "supabase/migrations" };
  for (const a of argv) {
    if (a === "--apply") args.apply = true;
    else if (a === "--dry-run") args.apply = false;
    else if (a === "--allow-staging") args.allowStaging = true;
    else if (a.startsWith("--confirm-production=")) args.confirmProduction = a.slice("--confirm-production=".length);
    else if (a.startsWith("--applied-file=")) args.appliedFile = a.slice("--applied-file=".length);
    else if (a.startsWith("--dir=")) args.dir = a.slice("--dir=".length);
    else throw new Error(`Argumento desconhecido: ${a}`);
  }
  return args;
}

/** Variáveis PG* a partir da URL, para a senha não aparecer no argv do psql. */
export function psqlEnv(url) {
  const u = new URL(url);
  const env = {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: u.pathname.replace(/^\//, "") || "postgres",
  };
  const ssl = u.searchParams.get("sslmode");
  if (ssl) env.PGSSLMODE = ssl;
  return env;
}

const REGISTRY_DDL =
  "create schema if not exists supabase_migrations; " +
  "create table if not exists supabase_migrations.schema_migrations (version text not null primary key, statements text[], name text);";

function registerSql({ version, name }) {
  if (!/^\d+$/.test(version) || !/^[a-z0-9_]+$/.test(name)) throw new Error("version/name inválidos");
  return `insert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${name}');`;
}

function psql(url, args) {
  const r = spawnSync("psql", ["--no-psqlrc", "-X", "-v", "ON_ERROR_STOP=1", ...args], { env: psqlEnv(url), encoding: "utf8" });
  if (r.error) throw new Error(`Falha ao executar psql: ${r.error.message}`);
  if (r.status !== 0) throw new Error(maskSecrets(`psql saiu com ${r.status}: ${r.stderr}`, url));
  return r.stdout;
}

function readApplied(url) {
  const exists = psql(url, ["-At", "-c", "select to_regclass('supabase_migrations.schema_migrations') is not null"]).trim();
  if (exists !== "t") return [];
  return psql(url, ["-At", "-F", "|", "-c", "select version, name from supabase_migrations.schema_migrations order by version"])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [version, name] = line.split("|");
      return { version, name };
    });
}

export function main(argv, env = process.env) {
  const args = parseArgs(argv);
  const databaseUrl = env.DATABASE_URL || undefined;
  if (!databaseUrl && !args.appliedFile) {
    console.error("Defina DATABASE_URL (ou use --applied-file=<json> para planejar offline).");
    return 1;
  }
  if (args.apply && !databaseUrl) {
    console.error("--apply exige DATABASE_URL.");
    return 1;
  }
  const guard = checkGuards({ databaseUrl, apply: args.apply, allowStaging: args.allowStaging, confirmProduction: args.confirmProduction });
  if (guard.length) {
    for (const e of guard) console.error(`RECUSADO: ${e}`);
    return 1;
  }

  const local = parseMigrationFiles(readdirSync(args.dir));
  const applied = args.appliedFile ? JSON.parse(readFileSync(args.appliedFile, "utf8")).migrations : readApplied(databaseUrl);
  const plan = planMigrations(local, applied);

  console.log(`Alvo: ${databaseUrl ? describeTarget(databaseUrl) : `arquivo ${args.appliedFile}`}`);
  console.log(`Modo: ${args.apply ? "APLICAR" : "dry-run (nada será alterado)"}`);
  console.log(`Locais ${local.length} · já aplicadas ${plan.alreadyApplied.length} · pendentes ${plan.pending.length} · drift ${plan.drift.length}`);
  for (const d of plan.drift) {
    console.error(`DRIFT: ${d.kind} versão ${d.version} nome remoto "${d.remoteName}"${d.localName ? ` x local "${d.localName}"` : ""}`);
  }
  if (plan.drift.length) return 2;
  for (const p of plan.pending) console.log(`${args.apply ? "aplicar" : "aplicaria"}: ${p.file}`);
  if (!args.apply || plan.pending.length === 0) return 0;

  psql(databaseUrl, ["-c", REGISTRY_DDL]);
  for (const p of plan.pending) {
    // Mesmo psql, mesma transação: o arquivo e o registro entram juntos ou nenhum dos dois.
    psql(databaseUrl, ["--single-transaction", "-f", join(args.dir, p.file), "-c", registerSql(p)]);
    console.log(`aplicada: ${p.file}`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.error(maskSecrets(e instanceof Error ? e.message : String(e), process.env.DATABASE_URL));
    process.exit(1);
  }
}
