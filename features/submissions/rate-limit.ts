import "server-only";

import { clientIp, ipRateKey } from "@/lib/net/client-ip";
import { checkRateLimit } from "@/lib/rate-limit/memory-bucket";

// D-001 (S19): primeira camada de rate limit do envio de lista (upload + OCR síncrono, S07), por IP + perfil
// autenticado. Mesmo Ruling das S24/S25 (balde em memória por instância; o Firewall da Vercel é a camada de
// verdade entre instâncias, pendência humana). Limite mais baixo que o de leads: cada envio aciona OCR (custo
// real de IA) e, em falha, o pipeline assíncrono.
const SUBMIT_RATE_LIMIT = 5; // envios
const SUBMIT_RATE_WINDOW_MS = 10 * 60_000; // por 10 minutos

type HeadersLike = { get(name: string): string | null };

/** `true` = acima do limite (recusar); `false` = pode seguir (e já contabilizado). */
export function submitRateLimited(headers: HeadersLike, actorId: string): boolean {
  const raw = clientIp(headers);
  const ip = raw ? ipRateKey(raw) : "unknown";
  return !checkRateLimit(`submit:${ip}:${actorId}`, SUBMIT_RATE_LIMIT, SUBMIT_RATE_WINDOW_MS);
}
