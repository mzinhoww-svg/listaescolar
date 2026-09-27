import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { PayoutError } from "@/features/payouts/errors";
import { payoutErrorCode } from "@/features/payouts/messages";
import type { PayoutStore } from "@/features/payouts/ports";
import { PayoutService } from "@/features/payouts/service";
import type { SessionActor } from "@/features/stationeries/actor";

const ADMIN: SessionActor = { userId: randomUUID(), role: "admin" } as SessionActor;

function makeStore(over: Partial<PayoutStore> = {}): PayoutStore {
  const base: PayoutStore = {
    getActiveSettings: async () => null,
    publishSettings: async () => "settings-1",
    listSchoolConfigs: async () => [],
    publishSchoolConfig: async () => "config-1",
    confirmSale: async () => "sale-1",
    getSaleForLead: async () => null,
    listRecentSalePayments: async () => [],
    listConfirmableLeadsForStationery: async () => [],
    listPendingRepasses: async () => [],
    listBatches: async () => [],
    createBatch: async () => "batch-1",
    markBatchExecuted: async () => "batch-1",
    listDelinquency: async () => [],
    listSchoolOptions: async () => [],
    getPerformanceSummary: async () => ({ funnel: { sent: 0, opened: 0, attended: 0, sold: 0 }, ticketAverageCents: null, declaredCount: 0, confirmedCount: 0 }),
  };
  return { ...base, ...over };
}

describe("PayoutService.publishSettings", () => {
  it("dados inválidos são recusados antes de chamar o repositório", async () => {
    let called = false;
    const service = new PayoutService({ store: makeStore({ publishSettings: async () => ((called = true), "x") }) });
    await expect(service.publishSettings(ADMIN, { commissionBps: -1, graceDays: 5, blockDays: 15 })).rejects.toMatchObject({ code: "invalid_input" });
    expect(called).toBe(false);
  });

  it("blockDays <= graceDays é recusado (regra de negócio, não só tipo)", async () => {
    const service = new PayoutService({ store: makeStore() });
    await expect(service.publishSettings(ADMIN, { commissionBps: 1000, graceDays: 10, blockDays: 5 })).rejects.toBeInstanceOf(PayoutError);
  });

  it("dados válidos chegam ao repositório", async () => {
    let received: unknown = null;
    const service = new PayoutService({ store: makeStore({ publishSettings: async (_actor, input) => ((received = input), "id-1") }) });
    const id = await service.publishSettings(ADMIN, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
    expect(id).toBe("id-1");
    expect(received).toEqual({ commissionBps: 1000, graceDays: 5, blockDays: 15 });
  });
});

describe("PayoutService.publishSchoolConfig", () => {
  it("dados inválidos (schoolId não-uuid) são recusados", async () => {
    const service = new PayoutService({ store: makeStore() });
    await expect(
      service.publishSchoolConfig(ADMIN, { schoolId: "não-é-uuid", target: "apm", payoutBps: 100, beneficiaryName: "X", pixKey: "x@x.com", pixKeyKind: "email" }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("PayoutService.confirmSale", () => {
  it("propaga o erro do repositório (ex.: payout_unavailable) mapeado por código estável", async () => {
    const service = new PayoutService({
      store: makeStore({
        confirmSale: async () => {
          throw new PayoutError("comissão ainda não configurada", "payout_unavailable");
        },
      }),
    });
    const promise = service.confirmSale(ADMIN, { leadId: randomUUID(), schoolId: null });
    await expect(promise).rejects.toMatchObject({ code: "payout_unavailable" });
    await promise.catch((e: unknown) => expect(payoutErrorCode(e)).toBe("payout_unavailable"));
  });

  it("leadId inválido não chega ao repositório", async () => {
    let called = false;
    const service = new PayoutService({ store: makeStore({ confirmSale: async () => ((called = true), "x") }) });
    await expect(service.confirmSale(ADMIN, { leadId: "x", schoolId: null })).rejects.toMatchObject({ code: "invalid_input" });
    expect(called).toBe(false);
  });
});

describe("PayoutService.createBatch / markBatchExecuted", () => {
  it("nothing_due é propagado com o código estável", async () => {
    const service = new PayoutService({
      store: makeStore({
        createBatch: async () => {
          throw new PayoutError("nada pendente", "nothing_due");
        },
      }),
    });
    await expect(service.createBatch(ADMIN, { schoolId: randomUUID(), beneficiaryType: "school" })).rejects.toMatchObject({ code: "nothing_due" });
  });

  it("markBatchExecuted valida o formato do batchId antes de chamar o repositório", async () => {
    const service = new PayoutService({ store: makeStore() });
    await expect(service.markBatchExecuted(ADMIN, { batchId: "x" })).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("payoutErrorCode / errorMessageForCode", () => {
  it("erro desconhecido nunca ecoa a mensagem original", async () => {
    const code = payoutErrorCode(new Error("segredo interno do banco"));
    expect(code).toBe("desconhecido");
  });
});
