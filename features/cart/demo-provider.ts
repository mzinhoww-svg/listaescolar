import type { ProviderOptions, RetailerProvider } from "./ports";
import type { CartItemInput, Quote } from "./types";

export type DemoEnv = { DEMO_RETAILERS?: string; VERCEL_ENV?: string };
export const DEMO_SOURCE = "demo";
export const DEMO_RETAILER_SLUGS = ["amazon", "kalunga", "magalu", "mercadolivre"] as const;

/** Demonstração só com DEMO_RETAILERS=1 e nunca em produção (VERCEL_ENV=production). */
export function isDemoEnabled(env: DemoEnv): boolean {
  return env.DEMO_RETAILERS === "1" && env.VERCEL_ENV !== "production";
}

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619) >>> 0;
  return h;
}

/**
 * Preços FICTÍCIOS e determinísticos para demonstração (is_demo, origem `demo`). Cada loja deixa de
 * cotar cerca de 1 em 5 itens, para as quatro opções divergirem. Não representa preço real.
 */
export class DemoRetailerProvider implements RetailerProvider {
  constructor(private readonly clock: () => Date = () => new Date()) {}

  async getQuotes(items: readonly CartItemInput[], options?: ProviderOptions): Promise<Quote[]> {
    const now = options?.now ?? this.clock();
    const quotes: Quote[] = [];
    for (const item of items) {
      for (const slug of DEMO_RETAILER_SLUGS) {
        const h = hash(`${slug}|${item.itemKey}`);
        if (h % 5 === 0) continue;
        quotes.push({
          retailerSlug: slug,
          itemKey: item.itemKey,
          unitPriceCents: 250 + (h % 4750),
          source: DEMO_SOURCE,
          checkedAt: now,
          isDemo: true,
        });
      }
    }
    return quotes;
  }
}

export function createDemoRetailerProvider(env: DemoEnv): RetailerProvider | null {
  return isDemoEnabled(env) ? new DemoRetailerProvider() : null;
}
