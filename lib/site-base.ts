import { getSiteOrigin } from "@/lib/site-url";

/**
 * Base para metadados públicos (canonical, JSON-LD). Diferente de `getSiteOrigin`, não lança.
 * Em deploy (`VERCEL_ENV` definido) sem origem válida devolve null: o chamador omite `metadataBase` e o `url`
 * do JSON-LD em vez de publicar localhost. Fora de deploy e fora de NODE_ENV=production (dev/teste) cai no host local.
 * Nunca afeta links de e-mail/OAuth (esses usam `getSiteOrigin`, que lança).
 */
export function siteBase(): string | null {
  try {
    return getSiteOrigin();
  } catch {
    // localhost só em dev/teste: build de produção fora da Vercel sem NEXT_PUBLIC_SITE_URL também devolve null.
    return process.env.VERCEL_ENV || process.env.NODE_ENV === "production" ? null : "http://localhost:3000";
  }
}
