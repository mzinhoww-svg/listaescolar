import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  createKeyAction: vi.fn(),
  rotateKeyAction: vi.fn(),
  revokeKeyAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/b2b",
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

import B2bLayout from "@/app/b2b/layout";
import B2bPage from "@/app/b2b/page";
import B2bApiPage from "@/app/b2b/api/page";
import B2bContaPage from "@/app/b2b/conta/page";
import B2bDocsPage from "@/app/b2b/docs/page";
import { B2B_TERMS_TEXT_VERSION } from "@/features/b2b/terms";

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
  for (const f of [getSessionActor, requireAccess, getMyPartnerOverview, getMyPartnerHeader]) f.mockReset();
  getSessionActor.mockResolvedValue(ACTOR);
  requireAccess.mockResolvedValue({ user: { email: "dono@listacerta.test" }, role: "parent" });
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

  it("UX-127: singular em '1 lista', 'indisponível' em corpo normal e próximo passo 'Criar a chave'", async () => {
    getMyPartnerOverview.mockResolvedValue({ ...OVERVIEW_BASE, listsAvailableLive: 1, matchTotal: 0, matchMatched: 0, keys: [] });
    render(await B2bPage());
    expect(screen.getByText(/lista disponível na sua região/)).toBeInTheDocument();
    expect(screen.queryByText(/1 listas/)).toBeNull();
    const nd = screen.getByText("indisponível");
    expect(nd.className).not.toMatch(/text-\[32px\]/);
    expect(screen.getByRole("link", { name: "Criar a chave" })).toHaveAttribute("href", "/b2b/api");
  });

  it("UX-127: sandbox não usa o verde de 'resolvido' e plano ausente não vira 'sem plano'", async () => {
    getMyPartnerOverview.mockResolvedValue({ ...OVERVIEW_BASE, status: "sandbox", plan: null });
    render(await B2bPage());
    expect(screen.getByText("Sandbox").className).not.toMatch(/bg-verde-certo/);
    expect(screen.queryByText(/sem plano/i)).toBeNull();
    expect(screen.getByText(/Plano ainda não definido/)).toBeInTheDocument();
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
    expect(screen.getAllByText((t) => t.includes("lc_live_") && t.includes("7f2a")).length).toBeGreaterThan(0);
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
