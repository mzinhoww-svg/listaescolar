import "server-only";

import { clientIp, ipRateKey } from "@/lib/net/client-ip";
import { checkRateLimit } from "@/lib/rate-limit/memory-bucket";

// D-001 (S19): primeira camada de rate limit da criação de lead ("pedir cotação"), por IP + perfil autenticado.
// Mesmo Ruling das S24/S25 (balde em memória por instância; o Firewall da Vercel é a camada de verdade entre
// instâncias, pendência humana).
const LEAD_CREATE_RATE_LIMIT = 10; // pedidos
const LEAD_CREATE_RATE_WINDOW_MS = 10 * 60_000; // por 10 minutos

type HeadersLike = { get(name: string): string | null };

/** `true` = acima do limite (recusar); `false` = pode seguir (e já contabilizado). */
export function leadCreateRateLimited(headers: HeadersLike, actorId: string): boolean {
  const raw = clientIp(headers);
  const ip = raw ? ipRateKey(raw) : "unknown";
  return !checkRateLimit(`lead:${ip}:${actorId}`, LEAD_CREATE_RATE_LIMIT, LEAD_CREATE_RATE_WINDOW_MS);
}
