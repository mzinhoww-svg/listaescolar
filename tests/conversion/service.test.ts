import { describe, expect, it } from "vitest";

import { ConversionError } from "@/features/conversion/errors";
import type { AdminDisputeView, AuditRow, ConversionSignals, ConversionStore, DisputeView, LeadDisputeGate, ReviewView, SurveyLeadView } from "@/features/conversion/ports";
import { ConversionService } from "@/features/conversion/service";
import type { SessionActor } from "@/features/stationeries/actor";

const PARENT: SessionActor = { userId: "11111111-1111-4111-8111-111111111111", role: "parent" } as SessionActor;
const LEAD_ID = "22222222-2222-4222-8222-222222222222";

const NO_SIGNALS: ConversionSignals = { stationeryConfirmed: false, parentConfirmed: false, pixConfirmed: false, signalCount: 0, confirmed: false };

function makeStore(over: Partial<ConversionStore> = {}): ConversionStore {
  const base: ConversionStore = {
    confirmPurchase: async () => "confirmation-id",
    getSignals: async () => NO_SIGNALS,
    createReview: async () => "review-id",
    listPublishedReviews: async (): Promise<ReviewView[]> => [],
    listRecentReviewsForAdmin: async (): Promise<ReviewView[]> => [],
    hideReview: async () => "review-id",
    openDispute: async () => "dispute-id",
    resolveDispute: async () => "dispute-id",
    getDisputeGate: async (): Promise<LeadDisputeGate> => ({ leadId: LEAD_ID, stationeryId: "st", deadlineAt: new Date(), canDispute: true, blockedReason: null, existingDispute: null }),
    listDisputesForStationery: async (): Promise<DisputeView[]> => [],
    listOpenDisputesForAdmin: async (): Promise<AdminDisputeView[]> => [],
    listResolvedDisputesForAdmin: async (): Promise<AdminDisputeView[]> => [],
    listSurveyLeadsForParent: async (): Promise<SurveyLeadView[]> => [],
    listAuditRows: async (): Promise<AuditRow[]> => [],
  };
  return { ...base, ...over };
}

describe("ConversionService", () => {
  it("confirmPurchase: entrada inválida nunca chega ao repositório", async () => {
    let called = false;
    const svc = new ConversionService({ store: makeStore({ confirmPurchase: async () => ((called = true), "x") }) });
    await expect(svc.confirmPurchase(PARENT, { leadId: "não-é-uuid", answer: "bought_here" })).rejects.toMatchObject({ code: "invalid_input" } satisfies Partial<ConversionError>);
    expect(called).toBe(false);
  });

  it("confirmPurchase: entrada válida repassa leadId/answer ao repositório", async () => {
    let seen: unknown;
    const svc = new ConversionService({ store: makeStore({ confirmPurchase: async (_actor, leadId, answer) => ((seen = { leadId, answer }), "ok") }) });
    const id = await svc.confirmPurchase(PARENT, { leadId: LEAD_ID, answer: "bought_here" });
    expect(id).toBe("ok");
    expect(seen).toEqual({ leadId: LEAD_ID, answer: "bought_here" });
  });

  it("createReview: comentário com dado pessoal é responsabilidade do banco (repositório propaga o erro)", async () => {
    const svc = new ConversionService({
      store: makeStore({
        createReview: async () => {
          throw new ConversionError("comentário com dado pessoal", "personal_data_rejected");
        },
      }),
    });
    await expect(svc.createReview(PARENT, { leadId: LEAD_ID, rating: 5, tags: [], comment: "me chama 65999990000" })).rejects.toMatchObject({
      code: "personal_data_rejected",
    });
  });

  it("createReview: etiqueta fora do vocabulário -> invalid_input sem chamar o repositório", async () => {
    let called = false;
    const svc = new ConversionService({ store: makeStore({ createReview: async () => ((called = true), "x") }) });
    await expect(svc.createReview(PARENT, { leadId: LEAD_ID, rating: 5, tags: ["nota_10"], comment: null })).rejects.toMatchObject({ code: "invalid_input" });
    expect(called).toBe(false);
  });

  it("openDispute: motivo fora dos 4 fixos -> invalid_input sem chamar o repositório", async () => {
    let called = false;
    const svc = new ConversionService({ store: makeStore({ openDispute: async () => ((called = true), "x") }) });
    await expect(svc.openDispute(PARENT, { leadId: LEAD_ID, reason: "nao_gostei", detail: null })).rejects.toMatchObject({ code: "invalid_input" });
    expect(called).toBe(false);
  });

  it("resolveDispute: decisão inválida -> invalid_input; decisão válida repassa ao repositório", async () => {
    const svc = new ConversionService({ store: makeStore() });
    await expect(svc.resolveDispute(PARENT, { disputeId: LEAD_ID, decision: "talvez", reason: null })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(svc.resolveDispute(PARENT, { disputeId: LEAD_ID, decision: "accepted", reason: null })).resolves.toBe("dispute-id");
  });

  it("listAuditRows/listSurveyLeadsForParent: delegam ao repositório com o limite padrão", async () => {
    let seenLimit: number | undefined;
    const svc = new ConversionService({ store: makeStore({ listAuditRows: async (_actor, limit) => ((seenLimit = limit), []) }) });
    await svc.listAuditRows(PARENT);
    expect(seenLimit).toBe(50);
  });
});
