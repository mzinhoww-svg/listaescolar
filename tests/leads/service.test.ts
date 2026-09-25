import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionActor } from "@/features/stationeries/actor";
import { LeadError } from "@/features/leads/errors";
import { InMemoryLeadListContextReader } from "@/features/leads/memory-context-reader";
import { NoopLeadNotifier } from "@/features/leads/notifier";
import type { LeadCartReader, LeadNotifier, LeadStore, RequesterLead } from "@/features/leads/ports";
import { LeadService } from "@/features/leads/service";

const REQ = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const CART = "55555555-5555-4555-8555-555555555555";
const LIST = "66666666-6666-4666-8666-666666666666";
const STAT = "44444444-4444-4444-8444-444444444444";
const MUNI = "11111111-1111-4111-8111-111111111111";
const KEY = "77777777-7777-4777-8777-777777777777";
const NOW = new Date("2026-09-25T12:00:00Z");

const actorOf = (role: string, userId = REQ) => ({ userId, role }) as unknown as SessionActor;

const cartFor = (ownerId = REQ, over: Partial<{ listId: string | null; isDemo: boolean }> = {}) => ({
  id: CART,
  ownerId,
  listId: LIST as string | null,
  isDemo: false,
  items: [
    { name: "Caderno 96 folhas", itemKey: "caderno 96 folhas", quantity: 2 },
    { name: "Lápis HB", itemKey: "lapis hb", quantity: 12 },
  ],
  ...over,
});

const context = { schoolName: "Escola Demonstração", gradeLabel: "5º ano", schoolYear: 2027, items: [{ name: "Caderno", quantity: 1 }], isDemo: false };

function lead(over: Partial<RequesterLead> = {}): RequesterLead {
  return {
    id: "88888888-8888-4888-8888-888888888888",
    code: "LC-5TJ1",
    status: "received",
    stationeryId: STAT,
    cartId: CART,
    listId: LIST,
    schoolName: "Escola Demonstração",
    gradeLabel: "5º ano",
    schoolYear: 2027,
    itemCount: 2,
    expiresAt: new Date(NOW.getTime() + 3 * 86_400_000),
    createdAt: NOW,
    ...over,
  };
}

let store: { [K in keyof LeadStore]: ReturnType<typeof vi.fn> };
let carts: { getOwnedCart: ReturnType<typeof vi.fn> };
let notifier: { notifyNewLead: ReturnType<typeof vi.fn> };

function build(opts: { contexts?: InMemoryLeadListContextReader | null } = {}): LeadService {
  return new LeadService({
    store: store as unknown as LeadStore,
    carts: carts as unknown as LeadCartReader,
    contexts: opts.contexts === undefined ? new InMemoryLeadListContextReader(new Map([[LIST, context]])) : opts.contexts,
    notifier: notifier as unknown as LeadNotifier,
    now: () => NOW,
    siteOrigin: () => "https://listacerta.example",
  });
}

const input = (over: Record<string, unknown> = {}) => ({ cartId: CART, stationeryId: STAT, consent: true, idempotencyKey: KEY, ...over });

async function code(p: Promise<unknown>): Promise<string> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(LeadError);
  return (err as LeadError).code;
}

beforeEach(() => {
  store = {
    createLead: vi.fn(async () => ({ leadId: "88888888-8888-4888-8888-888888888888", code: "LC-5TJ1", created: true })),
    getStationeryPublic: vi.fn(async () => ({ id: STAT, name: "Papelaria Teste", municipalityId: MUNI, whatsapp: "+5565999990000", isDemo: false })),
    getForRequester: vi.fn(async () => lead()),
    transitionLead: vi.fn(async (_a: unknown, r: { to: string }) => r.to),
    markViewed: vi.fn(async () => "viewed"),
    recordWhatsappOpen: vi.fn(async () => true),
  };
  carts = { getOwnedCart: vi.fn(async (_a: unknown, id: string) => (id === CART ? cartFor() : null)) };
  notifier = { notifyNewLead: vi.fn(async () => undefined) };
});

describe("LeadService.createLead", () => {
  it("sem consentimento: consent_required e nada é chamado", async () => {
    for (const consent of [false, undefined, "on", "true", 1, null]) {
      expect(await code(build().createLead(actorOf("parent"), input({ consent })))).toBe("consent_required");
    }
    expect(carts.getOwnedCart).not.toHaveBeenCalled();
    expect(store.createLead).not.toHaveBeenCalled();
    expect(notifier.notifyNewLead).not.toHaveBeenCalled();
  });

  it("só parent cria lead", async () => {
    for (const role of ["school_member", "stationery_member", "admin", "system"]) {
      expect(await code(build().createLead(actorOf(role), input()))).toBe("forbidden");
    }
    expect(store.createLead).not.toHaveBeenCalled();
  });

  it("entrada inválida ou com campo extra (itens do cliente): invalid_input", async () => {
    for (const bad of [input({ cartId: "x" }), input({ stationeryId: "" }), input({ idempotencyKey: "nope" }), input({ items: [{ name: "x", quantity: 1 }] }), input({ requesterId: OTHER }), input({ isDemo: true }), null, "x"]) {
      expect(await code(build().createLead(actorOf("parent"), bad))).toBe("invalid_input");
    }
    expect(store.createLead).not.toHaveBeenCalled();
  });

  it("carrinho inexistente ou alheio: o mesmo erro", async () => {
    carts.getOwnedCart.mockResolvedValue(null);
    const missing = await code(build().createLead(actorOf("parent"), input()));
    const foreign = await code(build().createLead(actorOf("parent", OTHER), input()));
    expect(missing).toBe("not_found");
    expect(foreign).toBe(missing);
    expect(store.createLead).not.toHaveBeenCalled();
  });

  it("sem leitor de contexto, sem lista no carrinho ou lista desconhecida: list_unavailable", async () => {
    expect(await code(build({ contexts: null }).createLead(actorOf("parent"), input()))).toBe("list_unavailable");
    carts.getOwnedCart.mockResolvedValue(cartFor(REQ, { listId: null }));
    expect(await code(build().createLead(actorOf("parent"), input()))).toBe("list_unavailable");
    carts.getOwnedCart.mockResolvedValue(cartFor());
    expect(await code(build({ contexts: new InMemoryLeadListContextReader(new Map()) }).createLead(actorOf("parent"), input()))).toBe("list_unavailable");
    expect(store.createLead).not.toHaveBeenCalled();
  });

  it("papelaria indisponível (não active ou inexistente): stationery_unavailable", async () => {
    store.getStationeryPublic.mockResolvedValue(null);
    expect(await code(build().createLead(actorOf("parent"), input()))).toBe("stationery_unavailable");
    expect(store.createLead).not.toHaveBeenCalled();
  });

  it("cria com itens relidos do servidor (carrinho), snapshot do contexto e is_demo derivado", async () => {
    const res = await build().createLead(actorOf("parent"), input({ neighborhood: "  Centro  " }));
    expect(res).toEqual({ leadId: "88888888-8888-4888-8888-888888888888", code: "LC-5TJ1", created: true });
    expect(store.createLead).toHaveBeenCalledTimes(1);
    const [, rec] = store.createLead.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(rec).toMatchObject({
      cartId: CART,
      listId: LIST,
      stationeryId: STAT,
      schoolName: "Escola Demonstração",
      gradeLabel: "5º ano",
      schoolYear: 2027,
      municipalityId: MUNI,
      neighborhood: "Centro",
      idempotencyKey: KEY,
      isDemo: false,
      items: [
        { name: "Caderno 96 folhas", itemKey: "caderno 96 folhas", quantity: 2 },
        { name: "Lápis HB", itemKey: "lapis hb", quantity: 12 },
      ],
    });
    expect(typeof rec.consentTextVersion).toBe("string");
    expect(rec.consentTextVersion).not.toBe("");
  });

  it("is_demo acompanha carrinho ou papelaria demo; contexto demo com resto real é recusado", async () => {
    carts.getOwnedCart.mockResolvedValue(cartFor(REQ, { isDemo: true }));
    await build().createLead(actorOf("parent"), input());
    expect((store.createLead.mock.calls[0] as [unknown, { isDemo: boolean }])[1].isDemo).toBe(true);

    store.createLead.mockClear();
    carts.getOwnedCart.mockResolvedValue(cartFor());
    store.getStationeryPublic.mockResolvedValue({ id: STAT, name: "P", municipalityId: MUNI, whatsapp: "+5565999990000", isDemo: true });
    await build().createLead(actorOf("parent"), input());
    expect((store.createLead.mock.calls[0] as [unknown, { isDemo: boolean }])[1].isDemo).toBe(true);

    store.createLead.mockClear();
    store.getStationeryPublic.mockResolvedValue({ id: STAT, name: "P", municipalityId: MUNI, whatsapp: "+5565999990000", isDemo: false });
    const demoCtx = new InMemoryLeadListContextReader(new Map([[LIST, { ...context, isDemo: true }]]));
    expect(await code(build({ contexts: demoCtx }).createLead(actorOf("parent"), input()))).toBe("invalid_input");
    expect(store.createLead).not.toHaveBeenCalled();
  });

  it("notifica depois do sucesso, só quando criou, e a falha do notificador não desfaz", async () => {
    await build().createLead(actorOf("parent"), input());
    expect(notifier.notifyNewLead).toHaveBeenCalledWith({ stationeryId: STAT, leadId: "88888888-8888-4888-8888-888888888888", code: "LC-5TJ1" });
    const order: string[] = [];
    store.createLead.mockImplementation(async () => {
      order.push("store");
      return { leadId: "88888888-8888-4888-8888-888888888888", code: "LC-5TJ1", created: true };
    });
    notifier.notifyNewLead.mockImplementation(async () => {
      order.push("notify");
    });
    await build().createLead(actorOf("parent"), input());
    expect(order).toEqual(["store", "notify"]);

    notifier.notifyNewLead.mockClear();
    store.createLead.mockResolvedValue({ leadId: "88888888-8888-4888-8888-888888888888", code: "LC-5TJ1", created: false });
    await build().createLead(actorOf("parent"), input());
    expect(notifier.notifyNewLead).not.toHaveBeenCalled();

    store.createLead.mockResolvedValue({ leadId: "88888888-8888-4888-8888-888888888888", code: "LC-5TJ1", created: true });
    notifier.notifyNewLead.mockRejectedValue(new Error("push fora do ar"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(build().createLead(actorOf("parent"), input())).resolves.toMatchObject({ created: true });
    spy.mockRestore();
  });

  it("falha do repositório não notifica e propaga", async () => {
    store.createLead.mockRejectedValue(new LeadError("x", "rate_limited"));
    expect(await code(build().createLead(actorOf("parent"), input()))).toBe("rate_limited");
    expect(notifier.notifyNewLead).not.toHaveBeenCalled();
  });

  it("NoopLeadNotifier não faz nada e não falha", async () => {
    await expect(new NoopLeadNotifier().notifyNewLead({ stationeryId: STAT, leadId: "x", code: "LC-5TJ1" })).resolves.toBeUndefined();
  });
});

describe("LeadService.openWhatsapp", () => {
  it("monta wa.me com o número da papelaria e registra a abertura", async () => {
    const res = await build().openWhatsapp(actorOf("parent"), "lc-5tj1");
    const url = new URL(res.url);
    expect(url.host).toBe("wa.me");
    expect(url.pathname).toBe("/5565999990000");
    expect(decodeURIComponent(url.searchParams.get("text") ?? "")).toContain("Código: LC-5TJ1");
    expect(decodeURIComponent(url.searchParams.get("text") ?? "")).toContain("https://listacerta.example/papelaria/leads/LC-5TJ1");
    expect(store.getForRequester).toHaveBeenCalledWith(expect.anything(), "LC-5TJ1");
    expect(store.recordWhatsappOpen).toHaveBeenCalledTimes(1);
  });

  it("código inválido ou lead alheio: not_found; só parent", async () => {
    expect(await code(build().openWhatsapp(actorOf("parent"), "xx"))).toBe("not_found");
    store.getForRequester.mockResolvedValue(null);
    expect(await code(build().openWhatsapp(actorOf("parent"), "LC-5TJ1"))).toBe("not_found");
    expect(await code(build().openWhatsapp(actorOf("stationery_member"), "LC-5TJ1"))).toBe("forbidden");
    expect(store.recordWhatsappOpen).not.toHaveBeenCalled();
  });

  it("lead encerrado ou vencido não abre e não registra", async () => {
    store.getForRequester.mockResolvedValue(lead({ status: "cancelled" }));
    expect(await code(build().openWhatsapp(actorOf("parent"), "LC-5TJ1"))).toBe("invalid_state");
    store.getForRequester.mockResolvedValue(lead({ expiresAt: new Date(NOW.getTime() - 1000) }));
    expect(await code(build().openWhatsapp(actorOf("parent"), "LC-5TJ1"))).toBe("expired");
    expect(store.recordWhatsappOpen).not.toHaveBeenCalled();
  });

  it("papelaria sem número ou não active: whatsapp_unavailable/stationery_unavailable; nada é registrado", async () => {
    store.getStationeryPublic.mockResolvedValue(null);
    expect(await code(build().openWhatsapp(actorOf("parent"), "LC-5TJ1"))).toBe("stationery_unavailable");
    store.getStationeryPublic.mockResolvedValue({ id: STAT, name: "P", municipalityId: MUNI, whatsapp: "não é número", isDemo: false });
    expect(await code(build().openWhatsapp(actorOf("parent"), "LC-5TJ1"))).toBe("whatsapp_unavailable");
    expect(store.recordWhatsappOpen).not.toHaveBeenCalled();
  });

  it("falha ao registrar (ex.: venceu agora) não entrega o link", async () => {
    store.recordWhatsappOpen.mockRejectedValue(new LeadError("x", "expired"));
    expect(await code(build().openWhatsapp(actorOf("parent"), "LC-5TJ1"))).toBe("expired");
  });
});

describe("LeadService transições", () => {
  it("cancelLead: como solicitante, só parent", async () => {
    await build().cancelLead(actorOf("parent"), { code: "lc-5tj1" });
    expect(store.transitionLead).toHaveBeenCalledWith(expect.anything(), { code: "LC-5TJ1", to: "cancelled", as: "parent" });
    expect(await code(build().cancelLead(actorOf("school_member"), { code: "LC-5TJ1" }))).toBe("forbidden");
    expect(await code(build().cancelLead(actorOf("parent"), { code: "zzz" }))).toBe("not_found");
  });

  it("updateStatus: só in_progress, quote_sent, awaiting_customer; valor em reais só em quote_sent", async () => {
    await build().updateStatus(actorOf("stationery_member"), { code: "LC-5TJ1", to: "quote_sent", amount: "R$ 1.234,50" });
    expect(store.transitionLead).toHaveBeenLastCalledWith(expect.anything(), { code: "LC-5TJ1", to: "quote_sent", as: "stationery", amountCents: 123_450 });
    await build().updateStatus(actorOf("stationery_member"), { code: "LC-5TJ1", to: "in_progress" });
    expect(store.transitionLead).toHaveBeenLastCalledWith(expect.anything(), { code: "LC-5TJ1", to: "in_progress", as: "stationery" });
    for (const to of ["converted", "declined", "cancelled", "expired", "received", "viewed", "nope"]) {
      expect(await code(build().updateStatus(actorOf("stationery_member"), { code: "LC-5TJ1", to }))).toBe("invalid_input");
    }
    expect(await code(build().updateStatus(actorOf("stationery_member"), { code: "LC-5TJ1", to: "in_progress", amount: "10,00" }))).toBe("invalid_input");
    expect(await code(build().updateStatus(actorOf("stationery_member"), { code: "LC-5TJ1", to: "quote_sent", amount: "12,5x" }))).toBe("amount_invalid");
  });

  it("papéis sem relação com papelaria são recusados; parent (dono) e admin passam ao banco", async () => {
    for (const role of ["school_member", "system"]) {
      expect(await code(build().updateStatus(actorOf(role), { code: "LC-5TJ1", to: "in_progress" }))).toBe("forbidden");
    }
    await build().updateStatus(actorOf("parent"), { code: "LC-5TJ1", to: "in_progress" });
    await build().updateStatus(actorOf("admin"), { code: "LC-5TJ1", to: "in_progress" });
    expect(store.transitionLead).toHaveBeenCalledTimes(2);
  });

  it("declareSale: valor opcional; inválido é amount_invalid", async () => {
    await build().declareSale(actorOf("stationery_member"), { code: "LC-5TJ1", amount: "" });
    expect(store.transitionLead).toHaveBeenLastCalledWith(expect.anything(), { code: "LC-5TJ1", to: "converted", as: "stationery" });
    await build().declareSale(actorOf("stationery_member"), { code: "LC-5TJ1", amount: "99,90" });
    expect(store.transitionLead).toHaveBeenLastCalledWith(expect.anything(), { code: "LC-5TJ1", to: "converted", as: "stationery", amountCents: 9990 });
    for (const amount of ["-5", "0", "abc", "999999999,00"]) {
      expect(await code(build().declareSale(actorOf("stationery_member"), { code: "LC-5TJ1", amount }))).toBe("amount_invalid");
    }
  });

  it("closeLost: motivo do conjunto fechado", async () => {
    await build().closeLost(actorOf("stationery_member"), { code: "LC-5TJ1", reason: "price" });
    expect(store.transitionLead).toHaveBeenLastCalledWith(expect.anything(), { code: "LC-5TJ1", to: "declined", as: "stationery", reason: "price" });
    for (const reason of ["", "texto livre", undefined, "PRICE"]) {
      expect(await code(build().closeLost(actorOf("stationery_member"), { code: "LC-5TJ1", reason }))).toBe("reason_required");
    }
  });

  it("lead que expirou durante a operação: expired (nunca sucesso silencioso)", async () => {
    store.transitionLead.mockResolvedValue("expired");
    expect(await code(build().cancelLead(actorOf("parent"), { code: "LC-5TJ1" }))).toBe("expired");
    expect(await code(build().updateStatus(actorOf("stationery_member"), { code: "LC-5TJ1", to: "in_progress" }))).toBe("expired");
  });

  it("markViewed devolve o status; expired vira erro expired", async () => {
    expect(await build().markViewed(actorOf("stationery_member"), "LC-5TJ1")).toBe("viewed");
    store.markViewed.mockResolvedValue("expired");
    expect(await build().markViewed(actorOf("stationery_member"), "LC-5TJ1")).toBe("expired");
    expect(await code(build().markViewed(actorOf("stationery_member"), "??"))).toBe("not_found");
  });
});
