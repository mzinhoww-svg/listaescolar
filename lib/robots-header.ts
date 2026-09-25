/**
 * Cabeçalho `X-Robots-Tag` de tudo que NÃO é produção (previews da Vercel, build local, dev).
 * Os previews são públicos (Vercel Authentication desativada, Ruling de 2026-09-25): sem este cabeçalho um preview
 * poderia ser indexado. E o deploy "de produção" da Vercel hoje aponta para o STAGING (o projeto de produção do Supabase
 * ainda não existe): por isso só é indexável com `SITE_INDEXING=1` (ligado pelo humano no go-live, S20), além de
 * `VERCEL_ENV=production`. Sem os dois, tudo responde noindex. `app/robots.ts` continua decidindo o que o robô rastreia
 * quando o indexamento está liberado. Função pura e sem imports: usada por next.config.ts.
 */
export const NOINDEX_VALUE = "noindex, nofollow, noarchive, nosnippet";

export type HeaderEntry = { source: string; headers: { key: string; value: string }[] };

export type IndexingEnv = { VERCEL_ENV?: string; SITE_INDEXING?: string };

/** Indexamento liberado: produção da Vercel E `SITE_INDEXING=1` explícito (nunca por padrão). */
export function indexingAllowed(env: IndexingEnv): boolean {
  return env.VERCEL_ENV === "production" && (env.SITE_INDEXING ?? "").trim() === "1";
}

export function robotsHeaders(env: IndexingEnv): HeaderEntry[] {
  if (indexingAllowed(env)) return [];
  return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: NOINDEX_VALUE }] }];
}
