import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

// Assinatura HMAC-SHA256 dos webhooks (S25). Cabeçalho `x-listacerta-signature: t=<epoch_seconds>,v1=<hex hmac>`,
// `hmac = HMAC-SHA256(secret, "<t>.<corpo bruto>")`. Tolerância a replay documentada (também em `/b2b/docs`): o
// destinatário deve recusar `|now - t| > tolerância`. Este repositório só ASSINA (o parceiro verifica do lado
// dele); `verifySignature` existe aqui para dar cobertura de teste ao round-trip e para a documentação apontar
// para uma implementação de referência.

export const SIGNATURE_TOLERANCE_SECONDS = 300;
export const SIGNATURE_HEADER = "x-listacerta-signature";

export function signPayload(secret: string, timestamp: number, rawBody: string): string {
  const hmac = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  return `t=${timestamp},v1=${hmac}`;
}

export type VerifyResult = { ok: true } | { ok: false; reason: "malformed_header" | "bad_signature" | "timestamp_out_of_tolerance" };

function parseHeader(header: string): { t: number; v1: string } | null {
  const parts = new Map<string, string>();
  for (const kv of header.split(",")) {
    const [k, v] = kv.split("=", 2);
    if (k && v) parts.set(k.trim(), v.trim());
  }
  const t = parts.get("t");
  const v1 = parts.get("v1");
  if (!t || !v1 || !/^[0-9]+$/.test(t) || !/^[0-9a-f]{64}$/.test(v1)) return null;
  return { t: Number(t), v1 };
}

/** Verificação de referência (round-trip / testes). O parceiro real reimplementa isto do lado dele. */
export function verifySignature(secret: string, header: string, rawBody: string, o: { toleranceSeconds?: number; nowMs?: number } = {}): VerifyResult {
  const parsed = parseHeader(header);
  if (!parsed) return { ok: false, reason: "malformed_header" };
  const tolerance = o.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS;
  const now = Math.floor((o.nowMs ?? Date.now()) / 1000);
  if (Math.abs(now - parsed.t) > tolerance) return { ok: false, reason: "timestamp_out_of_tolerance" };
  const expected = createHmac("sha256", secret).update(`${parsed.t}.${rawBody}`, "utf8").digest("hex");
  const a = Buffer.from(parsed.v1, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad_signature" };
  return { ok: true };
}
