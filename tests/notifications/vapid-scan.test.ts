import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? (["node_modules", ".next", ".git", ".track-workdir", ".superpowers"].includes(n) ? [] : walk(p)) : [p];
});

describe("scripts/vapid-dev.mjs", () => {
  const run = (env: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "vapid-"));
    const file = join(dir, ".env.local");
    writeFileSync(file, "FOO=1\n");
    const r = spawnSync("node", ["scripts/vapid-dev.mjs"], { cwd: ROOT, env: { PATH: process.env.PATH ?? "", VAPID_ENV_FILE: file, ...env } as unknown as NodeJS.ProcessEnv, encoding: "utf8" });
    return { r, text: readFileSync(file, "utf8") };
  };
  it("recusa APP_ENV=production e não escreve nada", () => {
    const { r, text } = run({ APP_ENV: "production" });
    expect(r.status).not.toBe(0);
    expect(text).toBe("FOO=1\n");
  });
  it("gera as chaves no arquivo local sem imprimir a privada; preserva o resto; é idempotente", () => {
    const { r, text } = run({ APP_ENV: "local" });
    expect(r.status).toBe(0);
    const priv = /^VAPID_PRIVATE_KEY=(\S+)$/m.exec(text)?.[1];
    const pub = /^NEXT_PUBLIC_VAPID_PUBLIC_KEY=(\S+)$/m.exec(text)?.[1];
    expect(priv).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pub).toMatch(/^[A-Za-z0-9_-]{87}$/);
    expect(text).toContain("FOO=1");
    expect(r.stdout + r.stderr).not.toContain(priv!);
    expect(text).toMatch(/^VAPID_SUBJECT=mailto:/m);
  });
});

describe("varredura de guardas", () => {
  const files = ["app", "features", "lib", "components", "supabase", "scripts", "tests", "docs", "public"].flatMap((d) => { try { return walk(resolve(ROOT, d)); } catch { return []; } })
    .concat([".env.example", "vercel.json", "package.json"].map((f) => resolve(ROOT, f)));
  const text = (f: string) => { try { return readFileSync(f, "utf8"); } catch { return ""; } };
  it("nenhuma chave VAPID (base64url de 87/43 caracteres atribuída a VAPID_*) nem chave de e-mail re_… no repositório", () => {
    for (const f of files.filter((x) => /\.(ts|tsx|md|sql|json|mjs|sh|example|txt)$/.test(x) || x.endsWith(".env.example"))) {
      const t = text(f);
      expect(t, f).not.toMatch(/VAPID_PRIVATE_KEY\s*=\s*[A-Za-z0-9_-]{43}\b/);
      expect(t, f).not.toMatch(/NEXT_PUBLIC_VAPID_PUBLIC_KEY\s*=\s*[A-Za-z0-9_-]{87}\b/);
      expect(t, f).not.toMatch(/\bre_[A-Za-z0-9]{20,}\b/);
    }
  });
  it("web-push só é importado pelo adapter; features/notifications não importa ai/*", () => {
    for (const f of files.filter((x) => /\.(ts|tsx|mjs)$/.test(x) && !x.includes("/tests/") && !x.includes("/scripts/"))) {
      if (/from ["']web-push["']|require\(["']web-push["']\)/.test(text(f))) expect(f.endsWith("features/notifications/web-push-notifier.ts"), f).toBe(true);
    }
    for (const f of files.filter((x) => x.includes("features/notifications/") && x.endsWith(".ts"))) expect(text(f), f).not.toMatch(/from ["'][^"']*\/ai\//);
  });
});
