import type { Metadata } from "next";

export const SITE_NAME = "ListaCerta";
export const SITE_LOCALE = "pt_BR";

/** A `openGraph` de uma página substitui a da raiz por inteiro, inclusive as imagens do arquivo `opengraph-image`. */
const OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "ListaCerta · A lista oficial da escola, pronta para comprar." };

type PageMeta = { title: string; description: string; path: string; noindex?: boolean };

/** Metadata por página: canonical, Open Graph e Twitter coerentes entre si. */
export function buildPageMetadata({ title, description, path, noindex = false }: PageMeta): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", url: path, siteName: SITE_NAME, locale: SITE_LOCALE, title, description, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: ["/twitter-image"] },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}
