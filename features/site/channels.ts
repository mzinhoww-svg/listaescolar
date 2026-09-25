import "server-only";

import { createPublicClient } from "@/lib/supabase/public";

export type ChannelsClient = ReturnType<typeof createPublicClient>;
export type PurchaseChannels = {
  retailers: { slug: string; name: string }[];
  hasStationeries: boolean;
};

/**
 * Onde comprar, só com dado real: varejistas ativos (por nome) e se há ao menos uma papelaria
 * pública não demonstrativa. Qualquer erro → null (a landing omite a faixa).
 */
export async function getPurchaseChannels(
  deps: { client?: ChannelsClient } = {},
): Promise<PurchaseChannels | null> {
  try {
    const client = deps.client ?? createPublicClient();
    const [retailers, stationeries] = await Promise.all([
      client.from("retailers").select("slug,name").eq("is_active", true).order("name"),
      client.from("stationery_public").select("id").eq("is_demo", false).limit(1),
    ]);
    if (retailers.error || stationeries.error) {
      console.error("site: falha ao ler canais de compra", retailers.error?.code ?? stationeries.error?.code);
      return null;
    }
    return {
      retailers: (retailers.data ?? []).map((r: { slug: string; name: string }) => ({ slug: r.slug, name: r.name })),
      hasStationeries: (stationeries.data ?? []).length > 0,
    };
  } catch (e) {
    console.error("site: falha ao ler canais de compra", e instanceof Error ? e.name : "erro");
    return null;
  }
}
