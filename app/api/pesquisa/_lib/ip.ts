import { createHash } from "node:crypto";

/**
 * IP confiável: o ÚLTIMO valor de `x-forwarded-for` (adicionado pelo proxy confiável da Vercel), nunca o
 * primeiro (forjável pelo cliente). Sem o header, IP é desconhecido.
 */
export function trustedIpFromHeaders(headers: Headers): string | null {
  const raw = headers.get("x-forwarded-for");
  if (!raw) return null;
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? (parts[parts.length - 1] ?? null) : null;
}

/** `ip_hash` = SHA-256 hex de `IP_HASH_SALT + ip`. null se não houver IP. */
export function hashIp(ip: string | null, salt: string): string | null {
  if (!ip) return null;
  return createHash("sha256").update(salt + ip).digest("hex");
}
