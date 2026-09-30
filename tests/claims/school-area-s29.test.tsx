import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/escola", useRouter: () => ({ refresh: vi.fn() }) }));

import { buildSchoolRows } from "@/components/claims/my-school-rows";
import { MySchoolsTable } from "@/components/claims/MySchoolsTable";
import { SchoolPanelShell } from "@/components/claims/SchoolPanelShell";

const school = { schoolId: "s1", inep: "99001004", name: "Escola Demonstração 4", verificationStatus: "verified" as const, isDemo: true, memberRole: "owner" };

describe("UX-089 · escola com lista publicada continua podendo enviar outras séries", () => {
  it("a linha leva à lista publicada e oferece 'Enviar outra série' para a mesma escola", () => {
    const [row] = buildSchoolRows([school], [], new Set(["s1"]), new Map([["s1", { href: "/escolas/99001004/ef-5?ano=2027", gradeSlug: "ef-5" }]]));
    expect(row?.href).toBe("/escolas/99001004/ef-5?ano=2027");
    expect(row?.more).toEqual({ href: "/escola/listas/nova?escola=s1", label: "Enviar outra série" });
  });
  it("sem lista: a ação principal já é o envio, sem segunda ação", () => {
    const [row] = buildSchoolRows([school], [], new Set());
    expect(row?.href).toBe("/escola/listas/nova?escola=s1");
    expect(row?.more).toBeUndefined();
  });
  it("cartão e tabela mostram o link de envio de outra série", () => {
    render(<MySchoolsTable schools={[school]} claims={[]} withList={new Set(["s1"])} />);
    const links = screen.getAllByRole("link", { name: "Enviar outra série" });
    expect(links).toHaveLength(2); // cartão (celular) + tabela (desktop)
    for (const l of links) expect(l).toHaveAttribute("href", "/escola/listas/nova?escola=s1");
  });
});

describe("UX-090/093 · casca da escola", () => {
  it("todo item do menu é link com destino, sem itens repetidos nem sem destino, e 'Enviar lista' existe", () => {
    render(<SchoolPanelShell email="e@x.com" title="T" crumb="Painel" active="listas">{null}</SchoolPanelShell>);
    const nav = within(screen.getByRole("navigation", { name: "Portal da escola" }));
    const links = nav.getAllByRole("link");
    const labels = links.map((l) => l.textContent);
    expect(labels).toEqual(["Minhas escolas", "Enviar lista", "Buscar escola", "Minha conta"]);
    expect(new Set(links.map((l) => l.getAttribute("href"))).size).toBe(links.length);
    expect(nav.getByRole("link", { name: "Enviar lista" })).toHaveAttribute("aria-current", "page");
    expect(nav.queryByText(/papelarias parceiras|administradores/i)).toBeNull();
  });
  it("mostra o Menu no celular e o link Voltar quando a tela informa o destino", () => {
    render(<SchoolPanelShell email="e@x.com" title="T" crumb="Painel" back={{ href: "/escola", label: "Minhas escolas" }}>{null}</SchoolPanelShell>);
    expect(screen.getByRole("button", { name: "Menu" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Voltar para Minhas escolas/ })).toHaveAttribute("href", "/escola");
  });
});

describe("casca da escola: a logo leva ao site", () => {
  it("o cabeçalho da casca tem o link da logo para a página inicial (saída do painel)", () => {
    render(<SchoolPanelShell email="e@x.com" title="T" crumb="Painel">{null}</SchoolPanelShell>);
    const logo = screen.getByRole("link", { name: "ListaCerta, início" });
    expect(logo).toHaveAttribute("href", "/");
    expect(logo.closest("header")).not.toBeNull();
  });
});
