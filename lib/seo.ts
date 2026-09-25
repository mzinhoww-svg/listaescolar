import type { Metadata } from "next";

export const SITE_NAME = "ListaCerta";
export const SITE_LOCALE = "pt_BR";

type PageMeta = { title: string; description: string; path: string; noindex?: boolean };

/** Metadata por página: canonical, Open Graph e Twitter coerentes entre si. */
export function buildPageMetadata({ title, description, path, noindex = false }: PageMeta): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", url: path, siteName: SITE_NAME, locale: SITE_LOCALE, title, description },
    twitter: { card: "summary_large_image", title, description },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}
