import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
vi.mock("@/features/auth/queries", () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a), getCurrentRole: vi.fn() }));

const getSessionActor = vi.fn();
vi.mock("@/features/auth/actor", () => ({ getSessionActor: () => getSessionActor() }));

const getMyPartnerHeader = vi.fn();
vi.mock("@/features/b2b/queries", () => ({
  getMyPartnerHeader: (...a: unknown[]) => getMyPartnerHeader(...a),
  getMyPartnerOverview: vi.fn(),
  isB2bMember: vi.fn(),
}));

const isB2bFeatureEnabled = vi.fn();
vi.mock("@/features/b2b/features", () => ({ isB2bFeatureEnabled: (...a: unknown[]) => isB2bFeatureEnabled(...a) }));

vi.mock("@/features/b2b/actions", () => ({ applyPartnerAction: vi.fn() }));

import ParceirosPage from "@/app/parceiros/page";
import TermosPage from "@/app/parceiros/termos/page";
import DocsPage from "@/app/parceiros/docs/page";
import { B2B_TERMS_TEXT_VERSION } from "@/features/b2b/terms";

const sp = (o: Record<string, string> = {}) => Promise.resolve(o);
const ACTOR = { userId: "11111111-1111-4111-8111-111111111111", role: "parent" };

beforeEach(() => {
  for (const f of [getCurrentUser, getSessionActor, getMyPartnerHeader]) f.mockReset();
  isB2bFeatureEnabled.mockReset().mockReturnValue(false);
  getSessionActor.mockResolvedValue(ACTOR);
});

describe("/parceiros (B2B00)", () => {
  it("sem login: 'Entrar para enviar' em vez do formulário", async () => {
    getCurrentUser.mockResolvedValue(null);
    render(await ParceirosPage({ searchParams: sp() }));
    expect(screen.getByRole("link", { name: "Entrar para enviar" })).toHaveAttribute("href", `/entrar?next=${encodeURIComponent("/parceiros#cadastro")}`);
    expect(screen.queryByRole("button", { name: "Enviar" })).not.toBeInTheDocument();
  });

  it("com login: mostra o formulário com o e-mail da conta, somente leitura", async () => {
    getCurrentUser.mockResolvedValue({ email: "dono@listacerta.test" });
    render(await ParceirosPage({ searchParams: sp() }));
    expect(screen.getByRole("button", { name: "Enviar" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("dono@listacerta.test")).toBeDisabled();
  });

  it("?erro= mostra a mensagem de serviço traduzida", async () => {
    getCurrentUser.mockResolvedValue({ email: "dono@listacerta.test" });
    render(await ParceirosPage({ searchParams: sp({ erro: "duplicate_cnpj" }) }));
    expect(screen.getByRole("alert")).toHaveTextContent("Este CNPJ já está cadastrado.");
  });

  it("recursos fora desta fatia (widget, checagem Procon) aparecem com selo Em breve", async () => {
    getCurrentUser.mockResolvedValue(null);
    render(await ParceirosPage({ searchParams: sp() }));
    expect(screen.getAllByText("Em breve").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Respondemos em/)).not.toBeInTheDocument();
    expect(screen.queryByText("parceiros@listacerta.com.br")).not.toBeInTheDocument();
  });

  it("selo Em breve some sozinho quando a flag do recurso liga (B2B_FEATURES), sem mexer nos outros recursos", async () => {
    getCurrentUser.mockResolvedValue(null);
    isB2bFeatureEnabled.mockImplementation((flag: string) => flag === "widget");
    render(await ParceirosPage({ searchParams: sp() }));
    const widgetItem = screen.getByText("Widget pronto para o seu site").closest("li");
    const skuItem = screen.getByText("Sugestão patrocinada separada da lista").closest("li");
    expect(widgetItem).not.toBeNull();
    expect(skuItem).not.toBeNull();
    expect(widgetItem!.textContent).not.toMatch(/em breve/i);
    expect(skuItem!.textContent).toMatch(/em breve/i);
  });

  it("com login e sem vínculo, não mostra 'Ir para o portal' (mostra o formulário)", async () => {
    getCurrentUser.mockResolvedValue({ email: "dono@listacerta.test" });
    getMyPartnerHeader.mockResolvedValue(null);
    render(await ParceirosPage({ searchParams: sp() }));
    expect(screen.queryByRole("link", { name: "Ir para o portal" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeInTheDocument();
  });

  it("quem já é parceiro vê 'Ir para o portal' em vez do formulário de cadastro", async () => {
    getCurrentUser.mockResolvedValue({ email: "dono@listacerta.test" });
    getMyPartnerHeader.mockResolvedValue({
      tradeName: "Loja Exemplo",
      legalName: "x",
      cnpj: "x",
      contactName: "x",
      partnerType: "retailer",
      coverageUfs: null,
      statusReason: null,
      isDemo: false,
      createdAt: "2026-01-01",
    });
    render(await ParceirosPage({ searchParams: sp() }));
    expect(screen.getByText(/Loja Exemplo já está cadastrada/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir para o portal" })).toHaveAttribute("href", "/b2b");
    expect(screen.queryByRole("button", { name: "Enviar" })).not.toBeInTheDocument();
  });

  it("'Entrar no portal' aparece no topo para qualquer visitante, apontando para /b2b", async () => {
    getCurrentUser.mockResolvedValue(null);
    render(await ParceirosPage({ searchParams: sp() }));
    expect(screen.getByRole("link", { name: "Entrar no portal" })).toHaveAttribute("href", "/b2b");
  });
});

describe("/parceiros/termos e /parceiros/docs", () => {
  it("termos mostram a versão vigente e o aviso preliminar", () => {
    render(TermosPage());
    expect(screen.getByText(`Versão: ${B2B_TERMS_TEXT_VERSION}`)).toBeInTheDocument();
    expect(screen.getAllByText(/não constitui parecer jurídico/).length).toBeGreaterThan(0);
  });

  it("docs públicas listam os 6 endpoints do contrato", () => {
    render(DocsPage());
    expect(screen.getByText("/v1/carts/match")).toBeInTheDocument();
    expect(screen.getByText("/v1/schools")).toBeInTheDocument();
  });
});
