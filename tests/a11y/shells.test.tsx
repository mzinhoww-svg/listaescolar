// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/papelaria" }));

import { AdminShell } from "@/components/admin/AdminShell";
import { PortalShell } from "@/components/b2b/PortalShell";
import { SchoolPanelShell } from "@/components/claims/SchoolPanelShell";
import { PANEL_NAV, PanelShell } from "@/components/stationeries/PanelShell";
import { SchoolShell } from "@/components/submissions/SchoolShell";

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

  it("SchoolPanelShell", () => {
    render(
      <SchoolPanelShell email="escola@x.com" title="Minhas escolas" crumb="Escola">
        <p>conteúdo</p>
      </SchoolPanelShell>,
    );
    expect(screen.getByText("Pular para o conteúdo")).toHaveAttribute("href", "#conteudo");
    expect(document.querySelector("main#conteudo")).not.toBeNull();
  });

  it("SchoolShell", () => {
    render(
      <SchoolShell email="escola@x.com">
        <p>conteúdo</p>
      </SchoolShell>,
    );
    expect(screen.getByText("Pular para o conteúdo")).toHaveAttribute("href", "#conteudo");
    expect(document.querySelector("main#conteudo")).not.toBeNull();
  });
});
