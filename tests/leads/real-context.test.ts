// Lead a partir de carrinho de lista REAL (S11): escola, série, ano e município vêm do leitor real, sem inventar nada.
import { describe, expect, it, vi } from "vitest";

import { SupabaseLeadListContextReader } from "@/features/integration/lead-context";
import { LeadError } from "@/features/leads/errors";
import type { LeadCartReader, LeadNotifier, LeadStore } from "@/features/leads/ports";
import { LeadService } from "@/features/leads/service";
import type { SessionActor } from "@/features/stationeries/actor";

const REQ = "22222222-2222-4222-8222-222222222222";
const CART = "55555555-5555-4555-8555-555555555555";
const LIST = "66666666-6666-4666-8666-666666666666";
const STAT = "44444444-4444-4444-8444-444444444444";
const MUNI = "11111111-1111-4111-8111-111111111111";
const actor = { userId: REQ, role: "parent" } as unknown as SessionActor;
const rpcReturning = (data: unknown) => ({ rpc: vi.fn(() => ({ then: (r: (v: unknown) => unknown) => r({ data, error: null }) })) }) as never;

function service(contextData: unknown, isDemo = false) {
  const createLead = vi.fn<(actor: unknown, record: unknown) => Promise<{ leadId: string; code: string; created: boolean }>>(async () => ({ leadId: "88888888-8888-4888-8888-888888888888", code: "LC-5TJ1", created: true }));
  const client = rpcReturning(contextData);
  const svc = new LeadService({
    store: { createLead, getStationeryPublic: async () => ({ id: STAT, name: "Papelaria", municipalityId: MUNI, whatsapp: null, isDemo }) } as unknown as LeadStore,
    carts: { getOwnedCart: async () => ({ id: CART, ownerId: REQ, listId: LIST, isDemo, items: [{ name: "Caderno", itemKey: "caderno", quantity: 2 }] }) } as LeadCartReader,
    contexts: new SupabaseLeadListContextReader(client),
    notifier: { notifyNewLead: async () => undefined } as LeadNotifier,
    now: () => new Date("2026-09-25T12:00:00Z"),
    siteOrigin: () => "https://listacerta.example",
  });
  return { svc, createLead, client };
}
const input = { cartId: CART, stationeryId: STAT, consent: true, idempotencyKey: "77777777-7777-4777-8777-777777777777" };

describe("lead com contexto real", () => {
  it("grava escola, série, ano e município reais do leitor e passa o ator (cópia do pai só do dono)", async () => {
    const { svc, createLead, client } = service({ schoolName: "Escola Modelo", gradeLabel: "4º ano", schoolYear: 2027, items: [{ name: "Caderno", quantity: 2 }], isDemo: false, municipalityId: MUNI });
    await svc.createLead(actor, input);
    expect(createLead.mock.calls[0]![1]).toMatchObject({ schoolName: "Escola Modelo", gradeLabel: "4º ano", schoolYear: 2027, municipalityId: MUNI, isDemo: false });
    expect((client as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith("lead_list_context", { p_list_id: LIST, p_actor_id: REQ });
  });

  it("cópia sem escola (contexto nulo): list_unavailable, nada é gravado", async () => {
    const { svc, createLead } = service(null);
    const err = await svc.createLead(actor, input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LeadError);
    expect((err as LeadError).code).toBe("list_unavailable");
    expect(createLead).not.toHaveBeenCalled();
  });

  it("contexto de demonstração num pedido real é recusado", async () => {
    const { svc } = service({ schoolName: "Escola X", gradeLabel: "4º ano", schoolYear: 2027, items: [], isDemo: true, municipalityId: MUNI });
    const err = await svc.createLead(actor, input).catch((e: unknown) => e);
    expect((err as LeadError).code).toBe("invalid_input");
  });
});
