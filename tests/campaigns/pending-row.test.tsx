import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const decide = vi.fn(async (_i: unknown) => ({ ok: true as const }));
vi.mock("@/features/campaigns/admin-actions", () => ({ decideCampaignAction: (i: unknown) => decide(i) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { PendingCampaignRow } from "@/app/admin/campanhas/PendingCampaignRow";
import type { CampaignRow } from "@/features/campaigns/repository";

const c = { id: "c1", partnerId: "p1", name: "Volta às aulas", productLabel: "Mochilas", creativeText: "Mochila resistente", pricingModel: "cpc", bidCents: 50, dailyBudgetCents: null, totalBudgetCents: 10000, accruedTotalCents: 0, targetCategory: "mochila", targetGradeStages: null, targetCities: null, status: "pending_review", statusReason: null, pauseOrigin: null, decidedAt: null, isDemo: false, createdAt: "", updatedAt: "" } as CampaignRow;

describe("UX-118 campanha pendente", () => {
  it("mostra o criativo e não usa o Verde Certo no botão", () => {
    const { container } = render(<PendingCampaignRow campaign={c} />);
    expect(screen.getByText(/Mochila resistente/)).toBeInTheDocument();
    expect(container.innerHTML).not.toContain("bg-verde-certo");
  });
  it("aprovar só decide depois de confirmar, com o efeito escrito", async () => {
    const { container } = render(<PendingCampaignRow campaign={c} />);
    fireEvent.click(screen.getByRole("button", { name: "Aprovar" }));
    expect(decide).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/Sugestão patrocinada/);
    fireEvent.click(screen.getByRole("button", { name: "Aprovar campanha" }));
    await waitFor(() => expect(decide).toHaveBeenCalledWith({ campaignId: "c1", to: "approved", reason: undefined }));
  });
  it("recusar exige motivo dentro da confirmação", async () => {
    decide.mockClear();
    render(<PendingCampaignRow campaign={c} />);
    fireEvent.click(screen.getByRole("button", { name: "Recusar" }));
    fireEvent.click(screen.getByRole("button", { name: "Recusar campanha" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Informe o motivo");
    expect(decide).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Motivo da recusa/), { target: { value: "criativo enganoso" } });
    fireEvent.click(screen.getByRole("button", { name: "Recusar campanha" }));
    await waitFor(() => expect(decide).toHaveBeenCalledWith({ campaignId: "c1", to: "rejected", reason: "criativo enganoso" }));
  });
});
