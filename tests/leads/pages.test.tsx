import { beforeEach, describe, expect, it, vi } from "vitest";

const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound: () => notFound(), usePathname: () => "/", redirect: vi.fn() }));
const getOwnerContext = vi.fn();
vi.mock("@/features/stationeries/session", () => ({ getOwnerContext: (...a: unknown[]) => getOwnerContext(...a) }));
const getStationeryLead = vi.fn();
const estimateOwnCatalog = vi.fn();
vi.mock("@/features/leads/queries", () => ({
  getStationeryLead: (...a: unknown[]) => getStationeryLead(...a),
  estimateOwnCatalog: (...a: unknown[]) => estimateOwnCatalog(...a),
  listStationeryLeads: vi.fn(),
}));
const markViewed = vi.fn();
vi.mock("@/features/leads/wiring", () => ({ getLeadService: () => ({ markViewed }) }));
vi.mock("@/features/leads/actions", () => ({ closeLostAction: vi.fn(), declareSaleAction: vi.fn(), updateLeadStatusAction: vi.fn() }));

import LeadPage from "@/app/papelaria/leads/[code]/page";

const STAT = "11111111-1111-4111-8111-111111111111";
const ctx = { userId: "u", role: "stationery_member", actor: { userId: "u", role: "stationery_member" }, stationery: { id: STAT, status: "active" } };
const props = (code: string, sp: Record<string, string> = {}) => ({ params: Promise.resolve({ code }), searchParams: Promise.resolve(sp) }) as never;

describe("página de detalhe do lead da papelaria", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOwnerContext.mockResolvedValue(ctx);
    markViewed.mockResolvedValue("viewed");
  });

  it("código inexistente e código alheio dão o MESMO 404 (a leitura devolve null)", async () => {
    getStationeryLead.mockResolvedValue(null);
    await expect(LeadPage(props("LC-5TJ1"))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(LeadPage(props("LC-8HN4"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(2);
  });

  it("o stationeryId vem SEMPRE da sessão, nunca da query", async () => {
    getStationeryLead.mockResolvedValue(null);
    await LeadPage(props("LC-5TJ1", { stationeryId: "99999999-9999-4999-8999-999999999999" })).catch(() => undefined);
    expect(getStationeryLead).toHaveBeenCalledWith(ctx.actor, STAT, "LC-5TJ1");
  });

  it("código malformado é 404 sem consultar nada", async () => {
    await expect(LeadPage(props("../x"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getStationeryLead).not.toHaveBeenCalled();
    expect(markViewed).not.toHaveBeenCalled();
  });

  it("sem papelaria vinculada é 404", async () => {
    getOwnerContext.mockResolvedValue(null);
    await expect(LeadPage(props("LC-5TJ1"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("abrir marca visto antes de ler; falha em marcar não impede a leitura", async () => {
    markViewed.mockRejectedValue(new Error("boom"));
    getStationeryLead.mockResolvedValue(null);
    await LeadPage(props("LC-5TJ1")).catch(() => undefined);
    expect(markViewed).toHaveBeenCalledWith(ctx.actor, "LC-5TJ1");
    expect(getStationeryLead).toHaveBeenCalled();
  });
});
