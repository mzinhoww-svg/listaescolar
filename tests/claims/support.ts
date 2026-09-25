import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { EvidenceStorage } from "@/features/claims/ports";

import { parseStatusEnv } from "../helpers/local-api";

export type LocalEnv = { url: string; publishable: string; secret: string; jwtSecret: string };

/** Chaves do Supabase local (trilha atual), lidas em tempo de execução. Recusa host que não seja loopback. */
export function localEnv(): LocalEnv {
  const env = parseStatusEnv(execFileSync("node", ["scripts/supa.mjs", "status", "-o", "env"], { encoding: "utf8" }));
  const url = env.API_URL ?? "";
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) throw new Error("teste só roda contra Supabase local");
  const need = (k: string): string => {
    const v = env[k];
    if (!v) throw new Error(`variável ${k} ausente`);
    return v;
  };
  return { url, publishable: need("PUBLISHABLE_KEY"), secret: need("SECRET_KEY"), jwtSecret: need("JWT_SECRET") };
}

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

/** Cliente com a sessão (JWT assinado com o segredo local) de um usuário `authenticated`: passa pelo RLS. */
export function sessionClient(env: LocalEnv, userId: string): SupabaseClient {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ sub: userId, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 600 });
  const sig = createHmac("sha256", env.jwtSecret).update(`${head}.${body}`).digest("base64url");
  return createClient(env.url, env.publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${head}.${body}.${sig}` } },
  });
}

export class MemoryEvidenceStorage implements EvidenceStorage {
  readonly objects = new Map<string, { bytes: Uint8Array; mime: string }>();
  async put(path: string, bytes: Uint8Array, mime: string): Promise<void> {
    this.objects.set(path, { bytes, mime });
  }
  async remove(path: string): Promise<void> {
    this.objects.delete(path);
  }
  async signedUrl(path: string, seconds: number): Promise<string> {
    if (!this.objects.has(path)) throw new Error("objeto ausente");
    return `https://storage.invalid/${path}?ttl=${seconds}`;
  }
}
