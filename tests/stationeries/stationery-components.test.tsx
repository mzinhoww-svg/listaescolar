import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/papelaria/catalogo", useRouter: () => ({ replace: vi.fn() }) }));

import { AdminTable } from "@/components/stationeries/AdminTable";
import { CatalogTable } from "@/components/stationeries/CatalogTable";
import { ImportForm } from "@/components/stationeries/ImportForm";
import { PublicProfileView } from "@/components/stationeries/PublicProfileView";
import { RegistrationForm } from "@/components/stationeries/RegistrationForm";
import { StatusPanel } from "@/components/stationeries/StatusPanel";
import type { RegisterState } from "@/features/stationeries/form-data";

const MUNI = "11111111-1111-4111-8111-111111111111";
const noop = async (): Promise<void> => {};
const municipalities = [{ id: MUNI, name: "Cuiabá", uf: "MT" }];

const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("RegistrationForm", () => {
  const setup = (action = vi.fn(async (): Promise<RegisterState> => ({ status: "idle" }))) => {
    render(<RegistrationForm action={action} municipalities={municipalities} />);
    return action;
  };

  it("mostra o passo 1 e não deixa avançar com CNPJ inválido", async () => {
    setup();
    fill("Nome fantasia", "Papelaria Boa");
    fill("Razão social", "Boa Ltda");
    fill("CNPJ", "11.111.111/1111-11");
    fill("Município", MUNI);
    fill("Bairro da loja", "Centro");
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText("CNPJ inválido.")).toBeInTheDocument();
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Dados da loja");
  });

  it("com dados válidos avança; o teste do WhatsApp só abre wa.me", async () => {
    setup();
    fill("Nome fantasia", "Papelaria Boa");
    fill("Razão social", "Boa Ltda");
    fill("CNPJ", "11.222.333/0001-81");
    fill("Município", MUNI);
    fill("Bairro da loja", "Centro");
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Atendimento");
    expect(screen.queryByRole("link", { name: /Testar no WhatsApp/ })).not.toBeInTheDocument();
    fill("WhatsApp de atendimento", "(65) 99999-1234");
    const link = screen.getByRole("link", { name: /Testar no WhatsApp/ });
    expect(link.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/5565999991234\?text=/);
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("passo 2 exige retirada, entrega ou bairro", async () => {
    setup();
    fill("Nome fantasia", "Papelaria Boa");
    fill("Razão social", "Boa Ltda");
    fill("CNPJ", "11.222.333/0001-81");
    fill("Município", MUNI);
    fill("Bairro da loja", "Centro");
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fill("WhatsApp de atendimento", "(65) 99999-1234");
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText(/retirada, entrega ou ao menos um bairro/i)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Retirada na loja"));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("button", { name: "Enviar para análise" })).toBeInTheDocument();
  });

  it("texto de leads só com o conteúdo do design (sem números inventados)", () => {
    setup();
    expect(screen.getByText("Como você recebe leads")).toBeInTheDocument();
    expect(screen.queryByText(/grátis/i)).not.toBeInTheDocument();
  });
});

describe("StatusPanel", () => {
  const base = { id: "a", slug: "s", tradeName: "Boa", legalName: null, cnpj: "11222333000181", statusReason: null, municipalityId: MUNI, isDemo: false, createdAt: new Date(), updatedAt: new Date() };
  it("under_review: aguarda, sem botão de envio", () => {
    render(<StatusPanel stationery={{ ...base, status: "under_review" }} events={[]} resubmit={noop} />);
    expect(screen.getByTestId("status-label")).toHaveTextContent("Em análise");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Sem eventos ainda.")).toBeInTheDocument();
  });
  it("rejected: mostra o motivo e permite reenviar", () => {
    render(<StatusPanel stationery={{ ...base, status: "rejected", statusReason: "CNPJ divergente" }} events={[]} resubmit={noop} />);
    expect(screen.getByText(/CNPJ divergente/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reenviar para análise" })).toBeInTheDocument();
  });
});

describe("CatalogTable", () => {
  it("vazio", () => {
    render(<CatalogTable rows={[]} editHref={() => "#"} />);
    expect(screen.getByTestId("catalog-empty")).toBeInTheDocument();
  });
  it("preço com origem e data do preço; estoque informado", () => {
    render(
      <CatalogTable
        editHref={(id) => `/e/${id}`}
        rows={[{ id: "1", name: "Lápis HB", itemKey: "lapis hb", priceCents: 1290, priceSource: "informed_by_stationery", stock: "out_of_stock", isActive: true, priceUpdatedAt: new Date("2026-09-20T15:00:00Z") }]}
      />,
    );
    expect(screen.getByText("R$ 12,90")).toBeInTheDocument();
    expect(screen.getByText(/Informado pela papelaria · 20\/09\/2026/)).toBeInTheDocument();
    expect(screen.getByText("Em falta")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Editar" })).toHaveAttribute("href", "/e/1");
  });
});

describe("ImportForm", () => {
  it("mostra resultado e link de relatório baixável", async () => {
    const action = vi.fn(async () => ({ status: "done" as const, imported: 3, totalRows: 5, errorCount: 2, reportHref: "data:text/csv;charset=utf-8,x", reportName: "erros-catalogo.csv" }));
    render(<ImportForm action={action} />);
    const file = new File(["nome;preco\n"], "c.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Planilha CSV"), { target: { files: [file] } });
    fireEvent.submit(screen.getByRole("button", { name: "Importar" }).closest("form")!);
    await waitFor(() => expect(screen.getByTestId("import-result")).toHaveTextContent("3 de 5 linhas importadas. 2 com erro."));
    expect(screen.getByRole("link", { name: "Baixar relatório de erros" })).toHaveAttribute("download", "erros-catalogo.csv");
  });
  it("arquivo acima de 2 MB é recusado no cliente, sem enviar", () => {
    const action = vi.fn(async () => ({ status: "idle" as const }));
    render(<ImportForm action={action} />);
    const big = new File(["x"], "grande.csv", { type: "text/csv" });
    Object.defineProperty(big, "size", { value: 2 * 1024 * 1024 + 1 });
    fireEvent.change(screen.getByLabelText("Planilha CSV"), { target: { files: [big] } });
    expect(screen.getByRole("alert")).toHaveTextContent("passa de 2 MB");
    expect(screen.getByRole("button", { name: "Importar" })).toBeDisabled();
    expect(action).not.toHaveBeenCalled();
  });
  it("erro fatal mostra alerta", async () => {
    render(<ImportForm action={async () => ({ status: "error", message: "A planilha está vazia." })} />);
    fireEvent.change(screen.getByLabelText("Planilha CSV"), { target: { files: [new File(["x"], "c.csv")] } });
    fireEvent.submit(screen.getByRole("button", { name: "Importar" }).closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("A planilha está vazia.");
  });
});

describe("PublicProfileView", () => {
  const profile = {
    id: "a", slug: "boa", tradeName: "Papelaria Boa", municipalityId: MUNI, neighborhood: "Centro", offersPickup: true, offersDelivery: false,
    serviceRadiusKm: 0, openingHours: null, paymentMethods: ["pix"], whatsapp: "+5565999991234", isDemo: false, updatedAt: new Date(), areas: ["Centro"],
    catalog: [{ id: "1", name: "Lápis", itemKey: "lapis", priceCents: 150, priceSource: "informed_by_stationery", stock: "unknown" as const, isActive: true, priceUpdatedAt: new Date("2026-09-20T15:00:00Z") }],
  };
  it("só dados públicos, sem avaliações, selos ou prazos; CTA WhatsApp", () => {
    const { container } = render(<PublicProfileView profile={profile} />);
    expect(screen.getByRole("heading", { level: 1, name: "Papelaria Boa" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pedir lista pelo WhatsApp" }).getAttribute("href")).toContain("wa.me/5565999991234");
    expect(screen.getByText(/Informado pela papelaria · 20\/09\/2026/)).toBeInTheDocument();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/avalia|estrela|parceira|cnpj|prazo/i);
    expect(text).not.toContain("Demonstração");
  });
  it("demo tem selo; sem preços e sem WhatsApp: estados vazios honestos", () => {
    render(<PublicProfileView profile={{ ...profile, isDemo: true, catalog: [], whatsapp: null, paymentMethods: [] }} />);
    expect(screen.getByText("Demonstração")).toBeInTheDocument();
    expect(screen.getByTestId("public-catalog-empty")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp indisponível")).toBeInTheDocument();
    expect(screen.getByText("indisponível")).toBeInTheDocument();
  });
});

describe("AdminTable", () => {
  const row = { id: "a", tradeName: "Alfa", cnpj: "11222333000181", neighborhood: "Centro", whatsapp: "+5565999991234", status: "under_review" as const, isDemo: false, createdAt: new Date() };
  it("pendente: Aprovar e Recusar; CNPJ formatado", () => {
    render(<AdminTable rows={[row]} approve={noop} />);
    expect(screen.getByText("11.222.333/0001-81")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aprovar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Recusar" })).toHaveAttribute("href", "/admin/papelarias/a");
  });
  it("vazio", () => {
    render(<AdminTable rows={[]} approve={noop} />);
    expect(screen.getByTestId("admin-empty")).toBeInTheDocument();
  });
});
