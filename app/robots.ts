import type { MetadataRoute } from "next";

import { PREFIXES } from "@/features/auth/access";
import { indexingAllowed } from "@/lib/robots-header";
import { siteBase } from "@/lib/site-base";

/** Áreas sem página pública que também não devem ser rastreadas. `/v1/` (API B2B, S24) inclui `/v1/openapi.json`:
 * é público (sem chave), mas não é conteúdo para indexar. */
const EXTRA_DISALLOW = ["/auth/", "/api/", "/l/", "/cadastrar-papelaria", "/403", "/v1/"] as const;

/**
 * Só produção da Vercel com `SITE_INDEXING=1` (go-live) e origem válida libera rastreamento. Prefixos com "/" final mais a raiz exata (`/escola$`): nenhum dos dois cobre `/escolas`.
 * Páginas públicas `noindex` (listas, papelarias, busca filtrada) ficam liberadas: o robô precisa ler o `noindex`.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteBase();
  if (!indexingAllowed({ VERCEL_ENV: process.env.VERCEL_ENV, SITE_INDEXING: process.env.SITE_INDEXING }) || base === null) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...PREFIXES.flatMap((p) => [`${p}/`, `${p}$`]), ...EXTRA_DISALLOW] },
    sitemap: `${base}/sitemap.xml`,
  };
}
