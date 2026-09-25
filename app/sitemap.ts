import type { MetadataRoute } from "next";

import { listIndexableSchools } from "@/features/schools/search/sitemap";
import { SITE_PAGES } from "@/features/site/copy";
import { indexingAllowed } from "@/lib/robots-header";
import { siteBase } from "@/lib/site-base";

export const revalidate = 3600;

const STATIC_PATHS: readonly string[] = [...Object.values(SITE_PAGES).map((p) => p.path), "/escolas"];

/** Páginas do site + perfis de escola indexáveis. Nunca listas, papelarias, demo, áreas privadas nem `/l/`. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteBase();
  // Sem indexamento liberado (SITE_INDEXING=1 em produção) não se publica sitemap: o site é noindex.
  if (base === null || !indexingAllowed({ VERCEL_ENV: process.env.VERCEL_ENV, SITE_INDEXING: process.env.SITE_INDEXING })) return [];
  const entries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({ url: `${base}${path}` }));
  try {
    const schools = await listIndexableSchools({ limit: 45000 });
    for (const s of schools) entries.push({ url: `${base}/escolas/${s.inep}`, lastModified: new Date(s.updatedAt) });
  } catch (error) {
    console.error("[sitemap]", { code: error instanceof Error ? error.message : "unknown" });
  }
  return entries;
}
