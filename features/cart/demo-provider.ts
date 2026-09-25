import type { ProviderOptions, RetailerProvider } from "./ports";
import type { CartItemInput, Quote } from "./types";

export type DemoEnv = {
  DEMO_RETAILERS?: string;
  VERCEL_ENV?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
};
export const DEMO_SOURCE = "demo";
export const DEMO_RETAILER_SLUGS = ["amazon", "kalunga", "magalu", "mercadolivre"] as const;

function isLoopbackUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const host = new URL(value).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
}

/**
 * Demonstração fail-closed: exige DEMO_RETAILERS=1 E (VERCEL_ENV em preview|development OU (VERCEL_ENV
 * ausente E NEXT_PUBLIC_SUPABASE_URL em loopback)). Produção, ambiente desconhecido e deploy fora da
 * Vercel apontando para Supabase remoto ficam desligados.
 */
export function isDemoEnabled(env: DemoEnv): boolean {
  if (env.DEMO_RETAILERS !== "1") return false;
  if (env.VERCEL_ENV === undefined) return isLoopbackUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  return env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "development";
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
