import "server-only";

// Mesmo critério de `features/b2b/api/handler.ts::clientIp` (S24): `x-vercel-forwarded-for` (escrito só pela
// borda da Vercel, não pode ser forjado por um proxy anterior) tem prioridade; `x-forwarded-for` é só um
// fallback para ambientes locais/de teste que não passam pela borda da Vercel.
export function clientIp(request: Request): string | null {
  const vercelForwardedFor = request.headers.get("x-vercel-forwarded-for")?.trim();
  if (vercelForwardedFor) return vercelForwardedFor;
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return null;
}
