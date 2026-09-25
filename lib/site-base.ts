import { getSiteOrigin } from "@/lib/site-url";

/**
 * Base para metadados públicos (canonical, JSON-LD). Diferente de `getSiteOrigin`, não lança.
 * Em deploy (`VERCEL_ENV` definido) sem origem válida devolve null: o chamador omite `metadataBase` e o `url`
 * do JSON-LD em vez de publicar localhost. Fora de deploy (dev/E2E local) cai no host local.
 * Nunca afeta links de e-mail/OAuth (esses usam `getSiteOrigin`, que lança).
 */
export function siteBase(): string | null {
  try {
    return getSiteOrigin();
  } catch {
    return process.env.VERCEL_ENV ? null : "http://localhost:3000";
  }
}
