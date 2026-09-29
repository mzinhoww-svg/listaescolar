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

/**
 * Chave de rate limit para um IP (reverificação S19, N4): IPv4 fica como está; IPv6 vira o prefixo /64 (os 4
 * primeiros grupos, já expandindo `::`), porque um único assinante recebe um /64 inteiro e girar o sufixo
 * contornaria o limite por IP. IPv4 mapeado em IPv6 (`::ffff:1.2.3.4`) usa o IPv4.
 */
export function ipRateKey(ip: string): string {
  const v = ip.trim().toLowerCase();
  if (!v.includes(":")) return v;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(v);
  if (mapped?.[1]) return mapped[1];
  const [headPart = "", tailPart] = v.split("::");
  const head = headPart ? headPart.split(":") : [];
  const tail = tailPart ? tailPart.split(":") : [];
  const missing = tailPart === undefined ? 0 : Math.max(0, 8 - head.length - tail.length);
  const groups = [...head, ...Array<string>(missing).fill("0"), ...tail].map((g) => g.replace(/^0+(?=.)/, ""));
  return `${groups.slice(0, 4).join(":")}::/64`;
}
