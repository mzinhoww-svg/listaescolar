import { getSiteOrigin } from "@/lib/site-url";

/**
 * Base para metadados públicos (canonical, JSON-LD). Diferente de `getSiteOrigin`, não lança quando a
 * origem não está configurada: cai no host local (só afeta URLs absolutas de SEO, nunca links de e-mail/OAuth).
 */
export function siteBase(): string {
  try {
    return getSiteOrigin();
  } catch {
    return "http://localhost:3000";
  }
}
