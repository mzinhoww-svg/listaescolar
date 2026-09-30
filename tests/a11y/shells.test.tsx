// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/papelaria" }));

import { AdminShell } from "@/components/admin/AdminShell";
import { PortalShell } from "@/components/b2b/PortalShell";
import { SchoolPanelShell } from "@/components/claims/SchoolPanelShell";
import { PANEL_NAV, PanelShell } from "@/components/stationeries/PanelShell";

/**
 * S18 (estados e a11y): as cinco cascas autenticadas do produto (papelaria, admin, B2B, escola × 2) ganharam
 * skip-link ("Pular para o conteúdo") e `<main id="conteudo">` — antes desta fatia só o layout do site público
 * (`app/(site)/layout.tsx`) tinha skip-link; quem navega por teclado/leitor de tela em qualquer área autenticada
 * tinha que passar por toda a barra lateral antes de chegar ao conteúdo.
 */
describe("skip-link e landmark #conteudo nas cascas autenticadas", () => {
  it("PanelShell (papelaria/admin)", () => {
    render(
      <PanelShell badge="Papelaria" nav={PANEL_NAV} email="dona@papelaria.com">
        <p>conteúdo</p>
      </PanelShell>,
    );
    expect(screen.getByText("Pular para o conteúdo")).toHaveAttribute("href", "#conteudo");
    expect(document.querySelector("main#conteudo")).not.toBeNull();
  });

  it("UX-083: casca da papelaria compacta a 390 px (logo, selo e conta na mesma faixa), menu com indício de rolagem e Sair como Button", () => {
    const { container } = render(
      <PanelShell badge="Papelaria" nav={PANEL_NAV} email="dona@papelaria.com">
        <p>conteúdo</p>
      </PanelShell>,
    );
    const aside = container.querySelector("aside")!;
    expect(aside.className).toMatch(/flex-row/);
    expect(aside.className).toMatch(/md:flex-col/);
    expect(screen.getByRole("navigation", { name: "Navegação" }).className).toMatch(/mask-image/);
    // Ordem no desktop: logo, selo, menu, conta (no fim). No celular: logo, selo, conta, menu.
    const cls = (el: Element | null) => el?.className ?? "";
    expect(cls(aside.querySelector("header"))).toMatch(/md:order-1/);
    expect(cls(aside.querySelector("span.bg-verde-certo"))).toMatch(/md:order-2/);
    expect(cls(screen.getByRole("navigation", { name: "Navegação" }))).toMatch(/md:order-3/);
    expect(cls(screen.getByRole("button", { name: "Sair" }).closest("div.order-3"))).toMatch(/md:order-4[\s\S]*md:mt-auto/);
    const sair = screen.getByRole("button", { name: "Sair" });
    expect(sair.className).toMatch(/h-11/);
    expect(sair.className).toMatch(/rounded-botao/);
  });

  it("AdminShell", () => {
    render(
      <AdminShell active="/admin" email="admin@listacerta.com.br" breadcrumb="Admin" title="Visão geral">
        <p>conteúdo</p>
      </AdminShell>,
    );
    expect(screen.getByText("Pular para o conteúdo")).toHaveAttribute("href", "#conteudo");
    expect(document.querySelector("main#conteudo")).not.toBeNull();
  });

  it("PortalShell (B2B)", () => {
    render(
      <PortalShell tradeName="Parceiro" status="active" email="parceiro@b2b.com">
        <p>conteúdo</p>
      </PortalShell>,
    );
    expect(screen.getByText("Pular para o conteúdo")).toHaveAttribute("href", "#conteudo");
    expect(document.querySelector("main#conteudo")).not.toBeNull();
  });

  it("UX-126: casca B2B compacta a 390 px (logo, selo e conta na mesma faixa), menu com indício de rolagem e Sair como Button", () => {
    const { container } = render(
      <PortalShell tradeName="Parceiro" status="active" email="parceiro@b2b.com">
        <p>conteúdo</p>
      </PortalShell>,
    );
    const aside = container.querySelector("aside")!;
    expect(aside.className).toMatch(/flex-row/);
    expect(aside.className).toMatch(/md:flex-col/);
    expect(screen.getByRole("navigation", { name: "Navegação" }).className).toMatch(/mask-image/);
    const sair = screen.getByRole("button", { name: "Sair" });
    expect(sair.className).toMatch(/h-11/);
    expect(sair.className).toMatch(/rounded-botao/);
  });

  it("UX-123: só parceiro do tipo marca vê Campanhas no menu", () => {
    const { rerender } = render(
      <PortalShell tradeName="Loja" status="active" email="a@b.com" partnerType="retailer">
        <p>x</p>
      </PortalShell>,
    );
    expect(screen.queryByRole("link", { name: "Campanhas" })).toBeNull();
    expect(screen.getByRole("link", { name: "Insights" })).toBeInTheDocument();
    rerender(
      <PortalShell tradeName="Marca" status="active" email="a@b.com" partnerType="brand">
        <p>x</p>
      </PortalShell>,
    );
    expect(screen.getByRole("link", { name: "Campanhas" })).toBeInTheDocument();
  });

  it("SchoolPanelShell", () => {
    render(
      <SchoolPanelShell email="escola@x.com" title="Minhas escolas" crumb="Escola">
        <p>conteúdo</p>
      </SchoolPanelShell>,
    );
    expect(screen.getByText("Pular para o conteúdo")).toHaveAttribute("href", "#conteudo");
    expect(document.querySelector("main#conteudo")).not.toBeNull();
  });
});
