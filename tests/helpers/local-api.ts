import { execFileSync } from "node:child_process";

/** Interpreta a saída de `supabase status -o env` (KEY="valor" ou KEY=valor, uma por linha). */
export function parseStatusEnv(out: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of out.split("\n")) {
    const m = /^([A-Z][A-Z0-9_]*)=(?:"([^"]*)"|(\S*))\s*$/.exec(line.trim());
    if (m?.[1]) env[m[1]] = m[2] ?? m[3] ?? "";
  }
  return env;
}

/** URL e chave secreta do Supabase local (com ou sem trilha: `scripts/supa.mjs` resolve o workdir). */
export function localApiFrom(out: string): { url: string; key: string } {
  const env = parseStatusEnv(out);
  const key = env.SECRET_KEY || env.SERVICE_ROLE_KEY;
  if (!env.API_URL || !key) throw new Error("Supabase local fora do ar (pnpm db:start)");
  return { url: env.API_URL, key };
}

export function localApi(): { url: string; key: string } {
  const out = execFileSync("node", ["scripts/supa.mjs", "status", "-o", "env"], { encoding: "utf8" });
  return localApiFrom(out);
}
