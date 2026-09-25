import type { MetadataRoute } from "next";

import { PREFIXES } from "@/features/auth/access";
import { siteBase } from "@/lib/site-base";

/** Áreas sem página pública que também não devem ser rastreadas. */
const EXTRA_DISALLOW = ["/auth/", "/api/", "/l/", "/cadastrar-papelaria", "/403"] as const;

/**
 * Só produção (com origem válida) libera rastreamento. Prefixos com "/" final mais a raiz exata (`/escola$`): nenhum dos dois cobre `/escolas`.
 * Páginas públicas `noindex` (listas, papelarias, busca filtrada) ficam liberadas: o robô precisa ler o `noindex`.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteBase();
  if (process.env.VERCEL_ENV !== "production" || base === null) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...PREFIXES.flatMap((p) => [`${p}/`, `${p}$`]), ...EXTRA_DISALLOW] },
    sitemap: `${base}/sitemap.xml`,
  };
}
