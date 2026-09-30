import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/b2b/actions", () => ({ createKeyAction: vi.fn(), rotateKeyAction: vi.fn(), revokeKeyAction: vi.fn() }));
vi.mock("@/features/campaigns/actions", () => ({ ownerTransitionCampaignAction: vi.fn(), resumeCampaignAction: vi.fn(), submitCampaignAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { KeyTable } from "@/app/b2b/api/KeyTable";
import { CampaignsTable } from "@/app/b2b/campanhas/CampaignsTable";

const KEY = { id: "k1", environment: "live" as const, publicId: "P", last4: "7f2a", scopes: ["schools:read"], status: "active" as const, expiresAt: null, createdAt: "2026-09-01T00:00:00Z", rotatedFromId: null, revokedAt: null, lastUsedOn: null };
const CAMP = {
  id: "c1", name: "Volta às aulas", productLabel: "Caderno", status: "approved", statusReason: null, pauseOrigin: null, pricingModel: "cpm", targetCategory: "cadernos", accruedTotalCents: 0, totalBudgetCents: 10000,
} as never;

describe("UX-125 · ações à vista a 390 px (cartões por linha)", () => {
  it("chaves: cada chave tem um cartão só do celular com Rotacionar e Revogar", () => {
    const { container } = render(<KeyTable keys={[KEY]} readOnly={false} />);
    const cards = container.querySelector("ul.md\\:hidden") as HTMLElement;
    expect(cards).not.toBeNull();
    expect(within(cards).getByRole("button", { name: "Rotacionar" })).toBeInTheDocument();
    expect(within(cards).getByRole("button", { name: "Revogar" })).toBeInTheDocument();
    expect(container.querySelector("div.hidden.md\\:block table")).not.toBeNull();
  });

  it("campanhas: Pausar e Concluir estão no cartão e abrem confirmação com o efeito escrito", () => {
    const { container } = render(<CampaignsTable campaigns={[CAMP]} />);
    const cards = container.querySelector("ul.md\\:hidden") as HTMLElement;
    expect(within(cards).getByRole("button", { name: "Pausar" })).toBeInTheDocument();
    expect(within(cards).getByRole("button", { name: "Concluir" })).toBeInTheDocument();
    expect(screen.getAllByText(/deixa de aparecer para as famílias/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/não pode ser reaberta/i).length).toBeGreaterThan(0);
  });
});
