import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlanForm } from "@/app/admin/planos/PlanForm";
import { TierFields } from "@/app/admin/planos/TierFields";

describe("UX-117 /admin/planos", () => {
  it("mostra só as faixas preenchidas mais uma vazia, com cabeçalhos sem caixa alta", () => {
    const { container } = render(<TierFields tiers={[{ minItems: 1, maxItems: 10, priceCents: 100 }]} />);
    expect(container.querySelectorAll('input[name$=".minItems"]')).toHaveLength(2);
    expect(container.innerHTML).not.toContain("uppercase");
  });
  it("sem faixas: uma linha vazia", () => {
    const { container } = render(<TierFields tiers={[]} />);
    expect(container.querySelectorAll('input[name$=".minItems"]')).toHaveLength(1);
  });
  it("publicar pede confirmação com o efeito escrito", () => {
    const { container } = render(<PlanForm plan={null} />);
    expect(screen.getByRole("button", { name: "Salvar alterações" })).toHaveAttribute("type", "button");
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(container.textContent).toMatch(/valem para leads novos/);
    expect(container.querySelector('dialog button[type="submit"]')).not.toBeNull();
  });
});
