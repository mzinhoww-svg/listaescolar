// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/actor", () => ({ getSessionActor: vi.fn(async () => ({ userId: "u" })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const svc = vi.hoisted(() => vi.fn());
vi.mock("@/features/campaigns/wiring", () => ({
  getCampaignService: svc,
  getInsightsService: svc,
  getStatementService: svc,
  myPartnerId: svc,
}));

import { createCampaignAction, resumeCampaignAction, submitCampaignAction } from "@/features/campaigns/actions";

afterEach(() => vi.unstubAllEnvs());

describe("campanhas B2B pagas: desligadas por padrão", () => {
  it("sem B2B_CAMPAIGNS_ENABLED as ações de escrita respondem indisponível e nem tocam o serviço", async () => {
    vi.stubEnv("B2B_CAMPAIGNS_ENABLED", "");
    for (const r of [await createCampaignAction({} as never), await submitCampaignAction({} as never), await resumeCampaignAction({ campaignId: "x" })]) {
      expect(r).toMatchObject({ ok: false, code: "unavailable" });
    }
    expect(svc).not.toHaveBeenCalled();
  });
});
