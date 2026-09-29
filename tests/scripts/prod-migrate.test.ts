import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STAGING_REF,
  checkGuards,
  describeTarget,
  extractRef,
  maskSecrets,
  parseArgs,
  parseMigrationFiles,
  planMigrations,
  // @ts-expect-error módulo .mjs sem tipos
} from "../../scripts/prod-migrate.mjs";

type Mig = { file: string; version: string; name: string };
type Applied = { version: string; name: string };
const parse = parseMigrationFiles as (f: string[]) => Mig[];
const plan = planMigrations as (l: Mig[], a: Applied[]) => {
  alreadyApplied: Mig[];
  pending: Mig[];
  drift: { kind: string }[];
};
const guards = checkGuards as (o: {
  databaseUrl?: string;
  apply: boolean;
  allowStaging: boolean;
  confirmProduction?: string;
}) => string[];
const mask = maskSecrets as (t: string, u?: string) => string;
const ref = extractRef as (u: string) => string | null;

const PROD = "abcdefghijklmnopqrst";
const prodUrl = `postgresql://postgres.${PROD}:S3nh4%2FForte@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`;
const stagingUrl = `postgresql://postgres:x@db.${STAGING_REF}.supabase.co:5432/postgres`;

describe("scripts/prod-migrate.mjs", () => {
  it("ordena por nome e extrai version/name", () => {
    const out = parse(["0102_b.sql", "0001_a.sql", "README.md", "0101_c.sql"]);
    expect(out.map((m) => m.file)).toEqual(["0001_a.sql", "0101_c.sql", "0102_b.sql"]);
    expect(out[0]).toEqual({ file: "0001_a.sql", version: "0001", name: "a" });
  });

  it("recusa nome fora do padrão e repetidos", () => {
    expect(() => parse(["abc.sql"])).toThrow(/padrão/);
    expect(() => parse(["0001_a.sql", "0001_b.sql"])).toThrow(/Versão repetida/);
    expect(() => parse(["0001_a.sql", "0002_a.sql"])).toThrow(/Nome repetido/);
  });

  it("acha pendentes por NOME, ignorando versões por timestamp", () => {
    const local = parse(["0001_base.sql", "0002_leads.sql", "0003_novo.sql"]);
    const r = plan(local, [
      { version: "20260925003453", name: "base" },
      { version: "20260925131816", name: "leads" },
    ]);
    expect(r.alreadyApplied.map((m) => m.name)).toEqual(["base", "leads"]);
    expect(r.pending.map((m) => m.name)).toEqual(["novo"]);
    expect(r.drift).toEqual([]);
  });

  it("banco vazio: tudo pendente, na ordem", () => {
    const r = plan(parse(["0002_b.sql", "0001_a.sql"]), []);
    expect(r.pending.map((m) => m.name)).toEqual(["a", "b"]);
  });

  it("drift: nome remoto desconhecido", () => {
    const r = plan(parse(["0001_a.sql"]), [{ version: "20260101000000", name: "fantasma" }]);
    expect(r.drift).toEqual([expect.objectContaining({ kind: "unknown_remote", remoteName: "fantasma" })]);
  });

  it("drift: mesma versão com nome diferente", () => {
    const r = plan(parse(["0001_a.sql"]), [{ version: "0001", name: "outra" }]);
    expect(r.drift).toEqual([expect.objectContaining({ kind: "version_name_mismatch", localName: "a" })]);
  });

  it("guarda de staging: exige --allow-staging, inclusive no dry-run", () => {
    const base = { databaseUrl: stagingUrl, apply: false, allowStaging: false };
    expect(guards(base)).toHaveLength(1);
    expect(guards({ ...base, apply: true })).toHaveLength(1);
    expect(guards({ ...base, allowStaging: true })).toEqual([]);
  });

  it("guarda de produção: --apply exige --confirm-production igual ao ref", () => {
    const base = { databaseUrl: prodUrl, apply: true, allowStaging: false };
    expect(guards(base)).toHaveLength(1);
    expect(guards({ ...base, confirmProduction: "outroref" })).toHaveLength(1);
    expect(guards({ ...base, confirmProduction: PROD })).toEqual([]);
    expect(guards({ ...base, apply: false })).toEqual([]); // dry-run lê, não escreve
  });

  it("recusa URL remota sem ref extraível ao aplicar; local e offline passam", () => {
    expect(guards({ databaseUrl: "postgresql://u:p@exemplo.com:5432/db", apply: true, allowStaging: false })).toHaveLength(1);
    expect(guards({ databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54522/postgres", apply: true, allowStaging: false })).toEqual([]);
    expect(guards({ apply: false, allowStaging: false })).toEqual([]);
  });

  it("extrai o ref do pooler e do host direto", () => {
    expect(ref(prodUrl)).toBe(PROD);
    expect(ref(stagingUrl)).toBe(STAGING_REF);
    expect(ref("postgresql://u:p@exemplo.com/db")).toBeNull();
  });

  it("mascara senha e URL, e describeTarget não mostra credencial", () => {
    const text = `falha em ${prodUrl}: senha S3nh4/Forte rejeitada, S3nh4%2FForte também`;
    const out = mask(text, prodUrl);
    expect(out).not.toContain("S3nh4");
    expect(out).toContain("<DATABASE_URL>");
    const target = describeTarget(prodUrl) as string;
    expect(target).toContain(PROD);
    expect(target).not.toContain("S3nh4");
    expect(target).not.toContain("postgres.");
  });

  it("parseArgs: padrão dry-run e flags", () => {
    expect((parseArgs([]) as { apply: boolean }).apply).toBe(false);
    expect(parseArgs(["--apply", "--allow-staging", "--confirm-production=x"])).toMatchObject({
      apply: true,
      allowStaging: true,
      confirmProduction: "x",
    });
    expect(() => parseArgs(["--foo"])).toThrow();
  });

  it("os arquivos reais são todos válidos e o histórico do staging não tem drift", () => {
    const local = parse(readdirSync(resolve(process.cwd(), "supabase/migrations")));
    const fixture = JSON.parse(
      readFileSync(resolve(process.cwd(), "tests/fixtures/staging-migrations-2026-09-28.json"), "utf8"),
    ) as { migrations: Applied[] };
    const r = plan(local, fixture.migrations);
    expect(r.drift).toEqual([]);
    expect(r.alreadyApplied).toHaveLength(fixture.migrations.length);
  });
});
