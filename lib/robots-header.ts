/**
 * Cabeçalho `X-Robots-Tag` de tudo que NÃO é produção (previews da Vercel, build local, dev).
 * Os previews são públicos (Vercel Authentication desativada, Ruling de 2026-09-25): sem este cabeçalho um preview
 * poderia ser indexado. Só o deploy de produção da Vercel (`VERCEL_ENV=production`) fica sem ele; `app/robots.ts`
 * continua decidindo o que o robô pode rastrear em produção. Função pura e sem imports: usada por next.config.ts.
 */
export const NOINDEX_VALUE = "noindex, nofollow, noarchive, nosnippet";

export type HeaderEntry = { source: string; headers: { key: string; value: string }[] };

export function robotsHeaders(env: { VERCEL_ENV?: string }): HeaderEntry[] {
  if (env.VERCEL_ENV === "production") return [];
  return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: NOINDEX_VALUE }] }];
}
