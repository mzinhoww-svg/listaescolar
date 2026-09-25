import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/site/channels", () => ({ getPurchaseChannels: vi.fn() }));

import { getPurchaseChannels } from "@/features/site/channels";
import { PRIVACY_SECTIONS, TERMS_SECTIONS } from "@/features/site/legal";
import { SITE_COPY } from "@/features/site/copy";

import { CHANNELS, loadPage, renderInSite, SITE_ROUTES } from "./helpers";

const CONFORMIDADE =
  /conformidade|em conformidade|compliant|certificad|garantimos|100% seguro|de acordo com a LGPD|cumpre a LGPD/i;
const PROIBIDOS: [string, RegExp][] = [
  ["número com unidade", /\d+\s*(mil|escolas|famílias|%|minutos|dias|horas)/i],
  ["Procon", /Procon/i],
  ["lei", /12\.886/],
  ["Magalu", /Magalu/i],
  ["Kalunga", /Kalunga/i],
  ["entrega", /entrega|receba em casa|entregue/i],
  ["parceria", /parceir/i],
  ["pronta em minutos", /em minutos/i],
  ["conformidade", CONFORMIDADE],
];

function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === "object") return Object.values(v).flatMap(strings);
  return [];
}

describe("regex de conformidade", () => {
  it("pega as frases proibidas", () => {
    for (const s of ["Estamos em conformidade com a LGPD", "site 100% seguro", "Somos certificados", "cumpre a LGPD"])
      expect(s).toMatch(CONFORMIDADE);
    expect("Versão preliminar. Texto em revisão jurídica.").not.toMatch(CONFORMIDADE);
  });
});

describe("cópia sem afirmações sem fonte", () => {
  const corpus = [
    ...strings(SITE_COPY),
    ...strings(TERMS_SECTIONS),
    ...strings(PRIVACY_SECTIONS),
  ];
  it.each(PROIBIDOS)("dados de cópia: %s", (_n, re) => {
    for (const s of corpus) expect(s).not.toMatch(re);
  });

  beforeEach(() => vi.mocked(getPurchaseChannels).mockResolvedValue(CHANNELS));

  it.each(SITE_ROUTES)("texto renderizado de %s", async (route) => {
    const Page = await loadPage(route);
    const { container } = await renderInSite(Page);
    const text = container.textContent ?? "";
    for (const [name, re] of PROIBIDOS) expect(text, `${route}: ${name}`).not.toMatch(re);
  });
});
