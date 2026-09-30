import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionActor = vi.fn();
vi.mock("@/features/auth/actor", () => ({ getSessionActor: () => getSessionActor() }));
const getMyPartnerHeader = vi.fn();
vi.mock("@/features/b2b/queries", () => ({ getMyPartnerHeader: (...a: unknown[]) => getMyPartnerHeader(...a) }));
const listMyCampaigns = vi.fn();
const getMyPartnerId = vi.fn();
vi.mock("@/features/campaigns/queries", () => ({
  listMyCampaigns: (...a: unknown[]) => listMyCampaigns(...a),
  getMyPartnerId: (...a: unknown[]) => getMyPartnerId(...a),
}));
vi.mock("@/features/campaigns/actions", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));

import CampanhasPage from "@/app/b2b/campanhas/page";
import NovaPage from "@/app/b2b/campanhas/nova/page";

const ACTOR = { userId: "11111111-1111-4111-8111-111111111111", role: "parent" };

beforeEach(() => {
  for (const f of [getSessionActor, getMyPartnerHeader, listMyCampaigns, getMyPartnerId]) f.mockReset();
  getSessionActor.mockResolvedValue(ACTOR);
  getMyPartnerId.mockResolvedValue("22222222-2222-4222-8222-222222222222");
  listMyCampaigns.mockResolvedValue([]);
});

describe("UX-123 · campanha é do tipo marca", () => {
  it("varejista em /b2b/campanhas: explica o tipo, sem 'Nova campanha' e sem 'Você não tem acesso'", async () => {
    getMyPartnerHeader.mockResolvedValue({ partnerType: "retailer" });
    render(await CampanhasPage());
    expect(screen.getByText(/campanhas são para parceiros do tipo marca/i)).toBeInTheDocument();
    expect(screen.getByText(/Seu cadastro é do tipo varejista/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /nova campanha/i })).toBeNull();
    expect(screen.queryByText(/não tem acesso/i)).toBeNull();
  });

  it("varejista em /b2b/campanhas/nova: mesma explicação, sem formulário", async () => {
    getMyPartnerHeader.mockResolvedValue({ partnerType: "edtech" });
    render(await NovaPage());
    expect(screen.getByText(/Seu cadastro é do tipo edtech/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enviar/i })).toBeNull();
  });

  it("marca continua vendo 'Nova campanha'", async () => {
    getMyPartnerHeader.mockResolvedValue({ partnerType: "brand" });
    render(await CampanhasPage());
    expect(screen.getByRole("link", { name: /nova campanha/i })).toBeInTheDocument();
  });
});
