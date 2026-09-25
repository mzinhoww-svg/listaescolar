import { z } from "zod";

const originSchema = z.url().transform((v) => new URL(v).origin);

const MISSING =
  "Origem do site indefinida: defina NEXT_PUBLIC_SITE_URL (ex.: https://listacerta.com.br).";

function blank(v: string | undefined): string | undefined {
  return v === undefined || v === "" ? undefined : v;
}

/**
 * Origem canônica para links enviados por e-mail e redirects de OAuth.
 * Nunca deriva de Host/Origin/x-forwarded-host em produção (forjáveis).
 * `requestOrigin` só vale fora de produção (dev/test).
 */
export function getSiteOrigin(requestOrigin?: string): string {
  const configured = blank(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured !== undefined) {
    const parsed = originSchema.safeParse(configured);
    if (!parsed.success)
      throw new Error("NEXT_PUBLIC_SITE_URL inválida: informe uma URL completa.");
    return parsed.data;
  }
  const vercelHost =
    process.env.VERCEL_ENV === "production"
      ? (blank(process.env.VERCEL_PROJECT_PRODUCTION_URL) ?? blank(process.env.VERCEL_URL))
      : blank(process.env.VERCEL_URL);
  if (vercelHost !== undefined) {
    const parsed = originSchema.safeParse(`https://${vercelHost}`);
    if (parsed.success) return parsed.data;
  }
  if (process.env.NODE_ENV !== "production" && requestOrigin) {
    const parsed = originSchema.safeParse(requestOrigin);
    if (parsed.success) return parsed.data;
  }
  throw new Error(MISSING);
}
