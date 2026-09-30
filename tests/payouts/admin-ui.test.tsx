import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CommissionSettingsForm } from "@/components/payouts/CommissionSettingsForm";
import { PayoutKpiRow } from "@/components/payouts/PayoutKpiRow";

describe("UX-116 repasses do admin", () => {
  it("'já pago' não é verde de sucesso", () => {
    const { container } = render(<PayoutKpiRow pendingCents={0} schoolsWithRepasse={0} executedCents={0} />);
    expect(container.innerHTML).not.toContain("bg-verde-certo");
  });
  it("campos sem placeholder de valor: exemplo em texto de apoio, rótulos sem caixa alta", () => {
    const { container } = render(<CommissionSettingsForm settings={null} />);
    expect(container.querySelectorAll("input[placeholder]")).toHaveLength(0);
    expect(container.innerHTML).not.toContain("uppercase");
    expect(screen.getByText(/Exemplo: 10,00/)).toBeInTheDocument();
  });
});
