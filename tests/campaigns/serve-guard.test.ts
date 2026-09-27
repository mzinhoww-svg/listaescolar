import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { serveCampaigns } from "@/features/campaigns/repository";

// Guarda para toda exibição futura (widget, página pública da lista — nada consome isto ainda, ver Ruling do
// ledger): `b2b_campaign_serve` sempre devolve `sponsored = true`; se um dia devolver outra coisa (bug de banco,
// coluna renomeada), o parse tem que estourar alto em vez de deixar passar uma campanha sem o selo "Patrocinado".

function fakeClient(rows: unknown[]): SupabaseClient {
  return { rpc: async () => ({ data: rows, error: null }) } as unknown as SupabaseClient;
}

const VALID_ROW = {
  campaign_id: "22222222-2222-4222-8222-222222222222",
  partner_id: "33333333-3333-4333-8333-333333333333",
  name: "Campanha",
  product_label: "Produto",
  creative_text: null,
  pricing_model: "cpm",
  sponsored: true,
};

describe("serveCampaigns: sponsored é sempre true, nunca decidido pela UI", () => {
  it("linha válida (sponsored: true) passa e o campo fica marcado no tipo", async () => {
    const rows = await serveCampaigns(fakeClient([VALID_ROW]), "list-1");
    expect(rows).toEqual([
      {
        campaignId: VALID_ROW.campaign_id,
        partnerId: VALID_ROW.partner_id,
        name: VALID_ROW.name,
        productLabel: VALID_ROW.product_label,
        creativeText: null,
        pricingModel: "cpm",
        sponsored: true,
      },
    ]);
  });

  it("se o banco algum dia devolver sponsored: false, o parse ESTOURA (nunca aparece sem o selo)", async () => {
    await expect(serveCampaigns(fakeClient([{ ...VALID_ROW, sponsored: false }]), "list-1")).rejects.toThrow();
  });

  it("se o banco omitir o campo sponsored, o parse também estoura", async () => {
    const withoutSponsored = Object.fromEntries(Object.entries(VALID_ROW).filter(([key]) => key !== "sponsored"));
    await expect(serveCampaigns(fakeClient([withoutSponsored]), "list-1")).rejects.toThrow();
  });
});
