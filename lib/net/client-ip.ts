import "server-only";

/** Qualquer objeto com `.get(name)` como `Headers`: cobre `Request.headers` E `ReadonlyHeaders` de `next/headers`
 * (Server Actions não recebem `Request`; usam `await headers()` para o mesmo efeito). */
type HeadersLike = { get(name: string): string | null };

// Mesmo critério de `features/b2b/api/handler.ts::clientIp` (S24): `x-vercel-forwarded-for` (escrito só pela
// borda da Vercel, não pode ser forjado por um proxy anterior) tem prioridade; `x-forwarded-for` é só um
// fallback para ambientes locais/de teste que não passam pela borda da Vercel.
export function clientIp(headers: HeadersLike): string | null {
  const vercelForwardedFor = headers.get("x-vercel-forwarded-for")?.trim();
  if (vercelForwardedFor) return vercelForwardedFor;
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return null;
}
