import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
vi.mock("@/features/auth/queries", () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a), getCurrentRole: vi.fn() }));

const getSessionActor = vi.fn();
vi.mock("@/features/auth/actor", () => ({ getSessionActor: () => getSessionActor() }));

const requireAccess = vi.fn();
vi.mock("@/features/auth/guard", () => ({ requireAccess: (...a: unknown[]) => requireAccess(...a) }));

const getMyPartnerOverview = vi.fn();
const getMyPartnerHeader = vi.fn();
vi.mock("@/features/b2b/queries", () => ({
  getMyPartnerOverview: (...a: unknown[]) => getMyPartnerOverview(...a),
  getMyPartnerHeader: (...a: unknown[]) => getMyPartnerHeader(...a),
  isB2bMember: vi.fn(),
}));

vi.mock("@/features/b2b/actions", () => ({
  applyPartnerAction: vi.fn(),
  createKeyAction: vi.fn(),
  rotateKeyAction: vi.fn(),
  revokeKeyAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/b2b",
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import ParceirosPage from "@/app/parceiros/page";
import TermosPage from "@/app/parceiros/termos/page";
import DocsPage from "@/app/parceiros/docs/page";
import B2bLayout from "@/app/b2b/layout";
import B2bPage from "@/app/b2b/page";
import B2bApiPage from "@/app/b2b/api/page";
import B2bContaPage from "@/app/b2b/conta/page";
import B2bDocsPage from "@/app/b2b/docs/page";
import { B2B_TERMS_TEXT_VERSION } from "@/features/b2b/terms";

const sp = (o: Record<string, string> = {}) => Promise.resolve(o);
const ACTOR = { userId: "11111111-1111-4111-8111-111111111111", role: "parent" };

const OVERVIEW_BASE = {
  partnerId: "22222222-2222-4222-8222-222222222222",
  status: "active",
  plan: "regional",
  coverageUfs: ["MT"],
  limits: { testRatePerMinute: 60, testRatePerDay: 1000, liveRatePerMinute: 120, liveRatePerDay: 5000 },
  callsMonth: 340,
  callsToday: 12,
  errors4xxToday: 1,
  rateLimitedToday: 0,
  matchTotal: 100,
  matchMatched: 80,
  listsAvailableLive: 15,
  listsAvailableTest: 3,
  callsByDay: [{ day: "2026-09-25", count: 5 }],
  keys: [
    { id: "k1", environment: "live" as const, publicId: "PID1", last4: "7f2a", scopes: ["schools:read", "lists:read"], status: "active" as const, expiresAt: null, createdAt: "2026-09-01T00:00:00Z", rotatedFromId: null, revokedAt: null, lastUsedOn: "2026-09-25" },
  ],
  today: "2026-09-26",
};
const HEADER_BASE = {
  tradeName: "Loja Exemplo",
  legalName: "Loja Exemplo LTDA",
  cnpj: "11222333000181",
  contactName: "Fulano",
  partnerType: "retailer",
  coverageUfs: ["MT"],
  statusReason: null,
  isDemo: false,
  createdAt: "2026-09-01T00:00:00Z",
};

beforeEach(() => {
  for (const f of [getCurrentUser, getSessionActor, requireAccess, getMyPartnerOverview, getMyPartnerHeader]) f.mockReset();
  getSessionActor.mockResolvedValue(ACTOR);
  requireAccess.mockResolvedValue({ user: { email: "dono@listacerta.test" }, role: "parent" });
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

describe("/b2b (layout)", () => {
  it("sem vínculo (overview null) redireciona para /parceiros?cadastro=1", async () => {
    getMyPartnerOverview.mockResolvedValue(null);
    await expect(B2bLayout({ children: null })).rejects.toThrow("REDIRECT:/parceiros?cadastro=1");
  });

  it("com vínculo, mostra a casca com o nome da empresa e o status", async () => {
    getMyPartnerOverview.mockResolvedValue(OVERVIEW_BASE);
    getMyPartnerHeader.mockResolvedValue(HEADER_BASE);
    render(await B2bLayout({ children: <p>conteúdo</p> }));
    expect(screen.getByText(/Loja Exemplo/)).toBeInTheDocument();
    expect(screen.getByText("Ativa")).toBeInTheDocument();
    expect(screen.getByText("conteúdo")).toBeInTheDocument();
  });

  it("suspenso: mostra o aviso de somente leitura", async () => {
    getMyPartnerOverview.mockResolvedValue({ ...OVERVIEW_BASE, status: "suspended" });
    getMyPartnerHeader.mockResolvedValue(HEADER_BASE);
    render(await B2bLayout({ children: null }));
    expect(screen.getByText(/Conta suspensa/)).toBeInTheDocument();
  });
});

describe("/b2b (B2B01, Visão geral)", () => {
  it("parceiro ativo: KPIs com dado real, sem 'carrinhos atribuídos' nem 'proporções ilustrativas'", async () => {
    getMyPartnerOverview.mockResolvedValue(OVERVIEW_BASE);
    render(await B2bPage());
    expect(screen.getByText("340")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("Produção")).toBeInTheDocument();
    expect(screen.queryByText(/carrinhos atribuídos/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/proporções ilustrativas/i)).not.toBeInTheDocument();
  });

  it("sem chamadas de match: % indisponível, não zero inventado", async () => {
    getMyPartnerOverview.mockResolvedValue({ ...OVERVIEW_BASE, matchTotal: 0, matchMatched: 0 });
    render(await B2bPage());
    expect(screen.getByText("indisponível")).toBeInTheDocument();
  });

  it("overview indisponível: mensagem de erro, não quebra a página", async () => {
    getMyPartnerOverview.mockResolvedValue(null);
    render(await B2bPage());
    expect(screen.getByText(/Não foi possível carregar/)).toBeInTheDocument();
  });
});

describe("/b2b/api (B2B02)", () => {
  it("pendente: bloqueado, sem 'Nova chave'", async () => {
    getMyPartnerOverview.mockResolvedValue({ ...OVERVIEW_BASE, status: "pending", keys: [] });
    getMyPartnerHeader.mockResolvedValue(HEADER_BASE);
    render(await B2bApiPage());
    expect(screen.getByText(/Aguardando aprovação/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nova chave" })).not.toBeInTheDocument();
    expect(screen.getByText("Nenhuma chave ainda.")).toBeInTheDocument();
  });

  it("recusado: mostra o motivo", async () => {
    getMyPartnerOverview.mockResolvedValue({ ...OVERVIEW_BASE, status: "rejected", keys: [] });
    getMyPartnerHeader.mockResolvedValue({ ...HEADER_BASE, statusReason: "CNPJ não confere" });
    render(await B2bApiPage());
    expect(screen.getByText(/Cadastro recusado: CNPJ não confere/)).toBeInTheDocument();
  });

  it("ativo: mostra 'Nova chave' e a tabela com a chave existente", async () => {
    getMyPartnerOverview.mockResolvedValue(OVERVIEW_BASE);
    getMyPartnerHeader.mockResolvedValue(HEADER_BASE);
    render(await B2bApiPage());
    expect(screen.getByRole("button", { name: "Nova chave" })).toBeInTheDocument();
    expect(screen.getByText((t) => t.includes("lc_live_") && t.includes("7f2a"))).toBeInTheDocument();
  });
});

describe("/b2b/conta e /b2b/docs", () => {
  it("conta mostra dados do cadastro e a versão dos termos", async () => {
    getMyPartnerOverview.mockResolvedValue(OVERVIEW_BASE);
    getMyPartnerHeader.mockResolvedValue(HEADER_BASE);
    render(await B2bContaPage());
    expect(screen.getByText("Loja Exemplo")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(B2B_TERMS_TEXT_VERSION))).toBeInTheDocument();
  });

  it("docs do portal listam os endpoints reais", () => {
    render(B2bDocsPage());
    expect(screen.getByText("/v1/lists/{id}/items")).toBeInTheDocument();
  });
});
