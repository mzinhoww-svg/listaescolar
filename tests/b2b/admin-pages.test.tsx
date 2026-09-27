import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAccess = vi.fn();
vi.mock("@/features/auth/guard", () => ({ requireAccess: (...a: unknown[]) => requireAccess(...a) }));

const getSessionActor = vi.fn();
vi.mock("@/features/auth/actor", () => ({ getSessionActor: () => getSessionActor() }));

const listPartnersForAdmin = vi.fn();
const getPartnerForAdmin = vi.fn();
const getPartnerHeaderForAdmin = vi.fn();
const listPartnerEventsForAdmin = vi.fn();
vi.mock("@/features/b2b/queries", () => ({
  listPartnersForAdmin: (...a: unknown[]) => listPartnersForAdmin(...a),
  getPartnerForAdmin: (...a: unknown[]) => getPartnerForAdmin(...a),
  getPartnerHeaderForAdmin: (...a: unknown[]) => getPartnerHeaderForAdmin(...a),
  listPartnerEventsForAdmin: (...a: unknown[]) => listPartnerEventsForAdmin(...a),
}));

vi.mock("@/app/admin/parceiros/actions", () => ({ decidePartnerAction: vi.fn(), adminRevokeKeyAction: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/parceiros",
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import AdminParceirosPage from "@/app/admin/parceiros/page";
import AdminParceiroDetailPage from "@/app/admin/parceiros/[id]/page";
import { DecisionForm } from "@/app/admin/parceiros/[id]/DecisionForm";
import {
  PARTNER_LIVE_RATE_PER_DAY,
  PARTNER_LIVE_RATE_PER_MINUTE,
  PARTNER_TEST_RATE_PER_DAY,
  PARTNER_TEST_RATE_PER_MINUTE,
} from "@/features/b2b/limits";

const sp = (o: Record<string, string> = {}) => Promise.resolve(o);

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
  for (const f of [requireAccess, getSessionActor, listPartnersForAdmin, getPartnerForAdmin, getPartnerHeaderForAdmin, listPartnerEventsForAdmin]) f.mockReset();
  getSessionActor.mockResolvedValue({ userId: "admin-1", role: "admin" });
});

describe("/admin/parceiros", () => {
  const ROW = { id: "p1", tradeName: "Empresa A", partnerType: "retailer", plan: "regional", status: "active" };

  it("passa pelo guard de /admin/parceiros", async () => {
    requireAccess.mockRejectedValue(new Error("REDIRECT:/403"));
    await expect(AdminParceirosPage({ searchParams: sp() })).rejects.toThrow("REDIRECT:/403");
    expect(listPartnersForAdmin).not.toHaveBeenCalled();
  });

  it("lista parceiros e mostra 'Pendentes (N)' pelo dado real", async () => {
    requireAccess.mockResolvedValue({ user: { email: "a@listacerta.test" }, role: "admin" });
    listPartnersForAdmin.mockResolvedValue([ROW, { ...ROW, id: "p2", tradeName: "Empresa B", status: "pending" }]);
    getPartnerForAdmin.mockResolvedValue(OVERVIEW_BASE);
    render(await AdminParceirosPage({ searchParams: sp() }));
    expect(screen.getByRole("link", { name: /Pendentes \(1\)/ })).toBeInTheDocument();
    expect(screen.getByText("Empresa A")).toBeInTheDocument();
  });

  it("aba Pendentes filtra pelo status", async () => {
    requireAccess.mockResolvedValue({ user: { email: "a@listacerta.test" }, role: "admin" });
    listPartnersForAdmin.mockResolvedValue([ROW, { ...ROW, id: "p2", tradeName: "Empresa B", status: "pending" }]);
    getPartnerForAdmin.mockResolvedValue(OVERVIEW_BASE);
    render(await AdminParceirosPage({ searchParams: sp({ aba: "pendentes" }) }));
    expect(screen.getByText("Empresa B")).toBeInTheDocument();
    expect(screen.queryByText("Empresa A")).not.toBeInTheDocument();
  });

  it("erro ao listar: mensagem de retry, nenhuma linha quebra a página", async () => {
    requireAccess.mockResolvedValue({ user: { email: "a@listacerta.test" }, role: "admin" });
    listPartnersForAdmin.mockRejectedValue(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(await AdminParceirosPage({ searchParams: sp() }));
    spy.mockRestore();
    expect(screen.getByRole("alert")).toHaveTextContent(/Não foi possível carregar/);
  });
});

describe("/admin/parceiros/[id]", () => {
  const props = (id = "22222222-2222-4222-8222-222222222222", q: Record<string, string> = {}) => ({ params: Promise.resolve({ id }), searchParams: sp(q) });

  it("id inválido é 404", async () => {
    requireAccess.mockResolvedValue({ user: { email: "a@listacerta.test" }, role: "admin" });
    await expect(AdminParceiroDetailPage(props("nao-uuid"))).rejects.toThrow("NOT_FOUND");
  });

  it("parceiro inexistente é 404", async () => {
    requireAccess.mockResolvedValue({ user: { email: "a@listacerta.test" }, role: "admin" });
    getPartnerForAdmin.mockResolvedValue(null);
    getPartnerHeaderForAdmin.mockResolvedValue(null);
    listPartnerEventsForAdmin.mockResolvedValue([]);
    await expect(AdminParceiroDetailPage(props())).rejects.toThrow("NOT_FOUND");
  });

  it("parceiro pendente: decisão mostra aprovar sandbox/produção e recusar", async () => {
    requireAccess.mockResolvedValue({ user: { email: "a@listacerta.test" }, role: "admin" });
    getPartnerForAdmin.mockResolvedValue({ ...OVERVIEW_BASE, status: "pending" });
    getPartnerHeaderForAdmin.mockResolvedValue(HEADER_BASE);
    listPartnerEventsForAdmin.mockResolvedValue([{ id: "e1", eventType: "applied", fromStatus: null, toStatus: "pending", actorRole: "owner", reason: null, createdAt: "2026-09-01T00:00:00Z" }]);
    render(await AdminParceiroDetailPage(props()));
    expect(screen.getByLabelText("Aprovar em sandbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aprovar em sandbox" })).toBeInTheDocument();
    expect(screen.getByLabelText("Recusar")).toBeInTheDocument();
    expect(screen.getByText("Cadastro enviado")).toBeInTheDocument();
  });

  it("?ok=1 mostra confirmação; ?erro= mostra a mensagem do serviço", async () => {
    requireAccess.mockResolvedValue({ user: { email: "a@listacerta.test" }, role: "admin" });
    getPartnerForAdmin.mockResolvedValue(OVERVIEW_BASE);
    getPartnerHeaderForAdmin.mockResolvedValue(HEADER_BASE);
    listPartnerEventsForAdmin.mockResolvedValue([]);
    render(await AdminParceiroDetailPage(props(undefined, { erro: "transition_not_allowed" })));
    expect(screen.getByRole("alert")).toHaveTextContent("Esta mudança de status não é permitida agora.");
  });
});

// Revisão de segurança da Task 3, Important #2: suspender (e recusar) exigem confirmação de fato, não só um
// aviso entre aspas no rótulo do motivo.
describe("DecisionForm — confirmação para suspender/recusar", () => {
  it("suspender: o botão principal abre a confirmação; a action só roda depois de confirmar", () => {
    const action = vi.fn();
    render(<DecisionForm partnerId="p1" status="active" action={action} />);
    fireEvent.click(screen.getByLabelText("Suspender"));
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "teste de suspensão" } });
    fireEvent.click(screen.getByRole("button", { name: "Suspender" }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByText(/revoga as chaves na hora/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Suspender agora" }));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("recusar: mesma confirmação, com o texto de recusa", () => {
    const action = vi.fn();
    render(<DecisionForm partnerId="p1" status="pending" action={action} />);
    fireEvent.click(screen.getByLabelText("Recusar"));
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "CNPJ não confere" } });
    fireEvent.click(screen.getByRole("button", { name: "Recusar" }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByText(/definitivo para esta solicitação/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recusar agora" }));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("aprovar (sem confirmação): o clique no botão principal já envia, sem diálogo", () => {
    const action = vi.fn();
    render(<DecisionForm partnerId="p1" status="pending" action={action} />);
    fireEvent.click(screen.getByLabelText("Aprovar em sandbox"));
    fireEvent.change(screen.getByLabelText("Plano"), { target: { value: "regional" } });
    fireEvent.click(screen.getByRole("button", { name: "Aprovar em sandbox" }));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("aprovar sem editar os campos de limite: os valores enviados são o padrão de negócio, nunca o mínimo (1)", () => {
    // Achado da re-revisão: `defaultValue={range.min}` deixava o parceiro aprovado com 1 req/min e 1 req/dia
    // quando o admin não editava os campos. `features/b2b/limits.ts` agora tem um `default` separado de `min`.
    const action = vi.fn();
    render(<DecisionForm partnerId="p1" status="pending" action={action} />);
    fireEvent.click(screen.getByLabelText("Aprovar em produção"));
    fireEvent.change(screen.getByLabelText("Plano"), { target: { value: "regional" } });
    fireEvent.click(screen.getByRole("button", { name: "Aprovar em produção" }));
    expect(action).toHaveBeenCalledTimes(1);
    const sent = action.mock.calls[0]![0] as FormData;
    expect(sent.get("testRatePerMinute")).toBe(String(PARTNER_TEST_RATE_PER_MINUTE.default));
    expect(sent.get("testRatePerDay")).toBe(String(PARTNER_TEST_RATE_PER_DAY.default));
    expect(sent.get("liveRatePerMinute")).toBe(String(PARTNER_LIVE_RATE_PER_MINUTE.default));
    expect(sent.get("liveRatePerDay")).toBe(String(PARTNER_LIVE_RATE_PER_DAY.default));
    for (const field of ["testRatePerMinute", "testRatePerDay", "liveRatePerMinute", "liveRatePerDay"]) {
      expect(sent.get(field)).not.toBe("1");
    }
  });

  it("cancelar na confirmação não envia nada", () => {
    const action = vi.fn();
    render(<DecisionForm partnerId="p1" status="active" action={action} />);
    fireEvent.click(screen.getByLabelText("Suspender"));
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "teste" } });
    fireEvent.click(screen.getByRole("button", { name: "Suspender" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(action).not.toHaveBeenCalled();
  });
});
