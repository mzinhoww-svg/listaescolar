import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ActivationChecklist } from "@/components/stationeries/ActivationChecklist";
import { LeadCards } from "@/components/leads/LeadCards";
import { KpiRow } from "@/components/leads/KpiRow";
import { computeActivation } from "@/features/stationeries/activation";
import type { StationeryLead } from "@/features/leads/repository";

const ID = "11111111-1111-4111-8111-111111111111";
const lead: StationeryLead = {
  id: ID, code: "LC-5TJ1", status: "received", listId: ID, stationeryId: ID, schoolName: "Escola Demonstração", gradeLabel: "5º ano",
  schoolYear: 2027, neighborhood: null, itemCount: 3, expiresAt: new Date("2026-10-01T00:00:00Z"), quotedTotalCents: null, quotedAt: null,
  declaredSaleCents: null, declaredAt: null, closeReason: null, isDemo: false, createdAt: new Date("2026-09-25T14:48:00Z"), saleDeclaredAt: null,
};

describe("ActivationChecklist", () => {
  it("mostra só passos calculados e destaca o próximo", () => {
    render(<ActivationChecklist activation={computeActivation({ hasProfile: true, areasCount: 0, catalogCount: 0, leadsReceived: 0 })} />);
    expect(screen.getByText("1 de 4 passos feitos.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Informar os bairros atendidos" }).getAttribute("href")).toBe("/papelaria/areas");
  });

  it("some quando tudo foi concluído", () => {
    const { container } = render(<ActivationChecklist activation={computeActivation({ hasProfile: true, areasCount: 1, catalogCount: 1, leadsReceived: 1 })} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("lead no celular", () => {
  it("a ação principal é um botão de 48 px no cartão", () => {
    render(<LeadCards rows={[lead]} now={new Date("2026-09-25T15:00:00Z")} />);
    const a = screen.getByRole("link", { name: "Abrir LC-5TJ1 (cartão)" });
    expect(a.textContent).toBe("Abrir e responder o pedido");
    expect(a.className).toContain("h-12");
  });

  it("zero vendas não usa verde", () => {
    const { container } = render(<KpiRow kpis={{ newCount: 0, awaitingCount: 0, soldThisWeek: 0, declaredMonthCents: null }} />);
    expect(container.innerHTML).not.toContain("bg-verde-certo");
  });
});
