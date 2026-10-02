// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AdminNav } from "@/components/admin/AdminNav";
import { SchoolPanelNav } from "@/components/claims/SchoolPanelNav";

describe("menus recolhíveis (revisão UX I5/menores)", () => {
  it("AdminNav: Esc fecha o menu e devolve o foco ao botão", () => {
    render(<AdminNav items={[{ href: "/admin", label: "Visão geral" }]} active="/admin" />);
    const btn = screen.getByRole("button", { name: "Menu" });
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(btn).toHaveFocus();
  });

  it("SchoolPanelNav: abre pelo botão, marca a página atual e fecha com Esc", () => {
    render(
      <SchoolPanelNav
        items={[
          { label: "Visão geral", href: "/escola" },
          { label: "Minhas escolas", href: "/escola", current: true },
        ]}
      />,
    );
    const btn = screen.getByRole("button", { name: "Menu" });
    expect(btn).toHaveAttribute("aria-controls", "school-menu");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Minhas escolas" })).toHaveAttribute("aria-current", "page");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(btn).toHaveFocus();
    expect(screen.getAllByRole("navigation")).toHaveLength(1);
  });
});
