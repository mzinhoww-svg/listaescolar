import "server-only";

import { clientIp } from "@/lib/net/client-ip";
import { checkRateLimit } from "@/lib/rate-limit/memory-bucket";

// D-001 (S19): primeira camada de rate limit do link mágico, por IP. Balde em memória por instância — mesmo
// Ruling já aceito nas S24/S25 (API B2B, widget): é a primeira camada; o limite de verdade entre instâncias/
// lambdas da Vercel é o Firewall, pendência humana já registrada em PROGRESS.md. O Supabase Auth já limita por
// e-mail (ver `isRateLimit` em `features/auth/actions.ts`); este balde cobre o caso de um IP variando e-mails.
const LOGIN_RATE_LIMIT = 5; // tentativas
const LOGIN_RATE_WINDOW_MS = 60_000; // por minuto

type HeadersLike = { get(name: string): string | null };

/** `true` = acima do limite (recusar); `false` = pode seguir (e já contabilizado). */
export function loginRateLimited(headers: HeadersLike): boolean {
  const ip = clientIp(headers) ?? "unknown";
  return !checkRateLimit(`login:${ip}`, LOGIN_RATE_LIMIT, LOGIN_RATE_WINDOW_MS);
}
