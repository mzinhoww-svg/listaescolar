import { describe, expect, it } from "vitest";

import { SITE_PAGES } from "@/features/site/copy";
import { buildPageMetadata } from "@/lib/seo";

describe("buildPageMetadata", () => {
  const m = buildPageMetadata({ title: "Sobre · ListaCerta", description: "Descrição curta.", path: "/sobre" });

  it("canonical é o path e o Open Graph replica título, descrição e url", () => {
    expect(m.alternates?.canonical).toBe("/sobre");
    expect(m.openGraph).toMatchObject({
      type: "website",
      url: "/sobre",
      siteName: "ListaCerta",
      locale: "pt_BR",
      title: "Sobre · ListaCerta",
      description: "Descrição curta.",
    });
    expect(m.twitter).toMatchObject({ card: "summary_large_image", title: "Sobre · ListaCerta" });
  });

  it("declara a imagem OG e a do Twitter (metadata de página substitui a da raiz)", () => {
    expect(m.openGraph).toMatchObject({ images: [{ url: "/opengraph-image", width: 1200, height: 630 }] });
    expect(m.twitter).toMatchObject({ images: ["/twitter-image"] });
  });

  it("indexável por padrão; noindex desliga index e follow continua", () => {
    expect(m.robots).toBeUndefined();
    const n = buildPageMetadata({ title: "t", description: "d", path: "/x", noindex: true });
    expect(n.robots).toMatchObject({ index: false, follow: true });
  });

  it.each(Object.entries(SITE_PAGES))("%s: título até 60 e descrição até 160 caracteres", (_p, page) => {
    expect(page.title.length).toBeLessThanOrEqual(60);
    expect(page.description.length).toBeGreaterThan(20);
    expect(page.description.length).toBeLessThanOrEqual(160);
  });
});
