// Cabeçalhos de limite (S24, Global Constraints): `X-RateLimit-*` da janela mais restritiva em toda resposta
// autenticada; `Retry-After` (segundos até o fim da janela) no `429`. Nunca revela outro parceiro ou balde.

export type RateLimitInfo = { limit: number; remaining: number; resetAt: Date };

export function rateLimitHeaders(info: RateLimitInfo): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(info.limit),
    "X-RateLimit-Remaining": String(Math.max(0, info.remaining)),
    "X-RateLimit-Reset": String(Math.floor(info.resetAt.getTime() / 1000)),
  };
}

export function retryAfterSeconds(resetAt: Date, now: Date): number {
  return Math.max(0, Math.ceil((resetAt.getTime() - now.getTime()) / 1000));
}
