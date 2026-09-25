import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/site/channels", () => ({ getPurchaseChannels: vi.fn() }));

import { getPurchaseChannels } from "@/features/site/channels";
import { PRIVACY_SECTIONS, TERMS_SECTIONS } from "@/features/site/legal";
import { SITE_COPY, SITE_PAGES, pageMetadata } from "@/features/site/copy";

import { CHANNELS, loadPage, renderInSite, SITE_ROUTES } from "./helpers";

const CONFORMIDADE =
  /conformidade|em conformidade|compliant|certificad|garantimos|100% seguro|de acordo com a LGPD|cumpre a LGPD/i;

/** Única exceção documentada: a frase do Ruling de custo (S27 plano), a validar com o humano. */
const COST_SENTENCE = "Famílias e escolas não pagam para usar a ListaCerta.";
const NUM_WORD = "um|uma|dois|duas|três|quatro|cinco|seis|sete|oito|nove|dez|vinte|trinta|cem|cento|meia";
const PROIBIDOS: [string, RegExp][] = [
  ["número com unidade", /\d+\s*(mil|escolas|famílias|%|minutos|dias|horas)/i],
  ["número por extenso com unidade", new RegExp(`\\b(${NUM_WORD})\\s+(mil|escolas|famílias|lojas|papelarias|itens|minutos|dias|horas|segundos)\\b`, "i")],
  ["quantidade vaga", /milhares|dezenas|centenas|\bmil\b/i],
  ["preço em reais", /R\$/],
  ["gratuidade", /gr[aá]tis|gratuit|sem custo|n[aã]o pagam|de graça/i],
  ["economia", /economi[zs]|\bdesconto/i],
  ["IA compara", /\bIA compara/],
  ["velocidade", /mais r[aá]pid|rapidez|em segundos/i],
  ["validação", /validad|verificad|homologad/i],
  ["Procon", /Procon/i],
  ["lei", /12\.886/],
  ["Magalu", /Magalu/i],
  ["Kalunga", /Kalunga/i],
  ["entrega", /entrega|receba em casa|entregue/i],
  ["parceria", /parceir/i],
  ["pronta em minutos", /em minutos/i],
  ["função inexistente", /marque o que já tem|itens de casa saem|marque cada item/i],
  ["conformidade", CONFORMIDADE],
];

function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === "object") return Object.values(v).flatMap(strings);
  return [];
}

const scrub = (s: string) => s.replaceAll(COST_SENTENCE, "");
const ariaLabels = (root: HTMLElement) => [...root.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label") ?? "");

describe("regex de claims", () => {
  it("pega as frases proibidas", () => {
    const bad = [
      "Estamos em conformidade com a LGPD", "site 100% seguro", "Somos certificados", "cumpre a LGPD",
      "R$ 10", "Grátis para todos", "sem custo", "A IA compara preços", "muito mais rápido", "milhares de famílias",
      "dezenas de escolas", "cinco mil famílias", "lista validada", "economize 30%", "Famílias não pagam",
    ];
    for (const s of bad) expect(PROIBIDOS.some(([, re]) => re.test(s)), s).toBe(true);
    expect("Versão preliminar. Texto em revisão jurídica.").not.toMatch(CONFORMIDADE);
  });
});

describe("cópia sem afirmações sem fonte", () => {
  const meta = (Object.keys(SITE_PAGES) as (keyof typeof SITE_PAGES)[]).flatMap((k) => strings(pageMetadata(k)));
  const corpus = [
    ...strings(SITE_COPY),
    ...strings(SITE_PAGES),
    ...meta,
    ...strings(TERMS_SECTIONS),
    ...strings(PRIVACY_SECTIONS),
  ].map(scrub);

  it("a exceção do Ruling de custo existe e é única", () => {
    const hits = [...strings(SITE_COPY), ...strings(SITE_PAGES), ...meta, ...strings(TERMS_SECTIONS), ...strings(PRIVACY_SECTIONS)].filter((s) =>
      s.includes(COST_SENTENCE),
    );
    expect(hits).toHaveLength(1);
  });

  it.each(PROIBIDOS)("dados de cópia, títulos e metadados: %s", (_n, re) => {
    for (const s of corpus) expect(s).not.toMatch(re);
  });

  beforeEach(() => vi.mocked(getPurchaseChannels).mockResolvedValue(CHANNELS));

  describe.each([false, true])("render com hasStationeries=%s", (has) => {
    it.each(SITE_ROUTES)("texto e aria-labels de %s", async (route) => {
      vi.mocked(getPurchaseChannels).mockResolvedValue({ ...CHANNELS, hasStationeries: has });
      const Page = await loadPage(route);
      const { container } = await renderInSite(Page);
      const text = scrub(container.textContent ?? "");
      const labels = ariaLabels(container).map(scrub);
      for (const [name, re] of PROIBIDOS) {
        expect(text, `${route}: ${name}`).not.toMatch(re);
        for (const l of labels) expect(l, `${route} aria-label: ${name}`).not.toMatch(re);
      }
    });
  });
});
