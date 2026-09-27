import { describe, expect, it } from "vitest";

import { confirmPurchaseInputSchema, disputeOpenInputSchema, disputeResolveInputSchema, reviewInputSchema } from "@/features/conversion/schemas";

const LEAD_ID = "11111111-1111-4111-8111-111111111111";
const DISPUTE_ID = "22222222-2222-4222-8222-222222222222";

describe("features/conversion/schemas", () => {
  it("confirmPurchaseInputSchema aceita as 3 respostas e recusa qualquer outra", () => {
    for (const answer of ["bought_here", "not_yet", "bought_elsewhere"]) {
      expect(confirmPurchaseInputSchema.safeParse({ leadId: LEAD_ID, answer }).success).toBe(true);
    }
    expect(confirmPurchaseInputSchema.safeParse({ leadId: LEAD_ID, answer: "sim" }).success).toBe(false);
    expect(confirmPurchaseInputSchema.safeParse({ leadId: "não-é-uuid", answer: "bought_here" }).success).toBe(false);
  });

  it("reviewInputSchema: nota 1..5, etiquetas do vocabulário fixo, comentário vazio vira null", () => {
    expect(reviewInputSchema.safeParse({ leadId: LEAD_ID, rating: 0, tags: [], comment: null }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ leadId: LEAD_ID, rating: 6, tags: [], comment: null }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ leadId: LEAD_ID, rating: 5, tags: ["nota_10"], comment: null }).success).toBe(false);
    const ok = reviewInputSchema.safeParse({ leadId: LEAD_ID, rating: 5, tags: ["bom_atendimento"], comment: "" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.comment).toBeNull();
  });

  it("disputeOpenInputSchema: só os 4 motivos fixos", () => {
    expect(disputeOpenInputSchema.safeParse({ leadId: LEAD_ID, reason: "wrong_number", detail: null }).success).toBe(true);
    expect(disputeOpenInputSchema.safeParse({ leadId: LEAD_ID, reason: "nao_gostei", detail: null }).success).toBe(false);
  });

  it("disputeResolveInputSchema: só accepted/rejected", () => {
    expect(disputeResolveInputSchema.safeParse({ disputeId: DISPUTE_ID, decision: "accepted", reason: null }).success).toBe(true);
    expect(disputeResolveInputSchema.safeParse({ disputeId: DISPUTE_ID, decision: "aceito", reason: null }).success).toBe(false);
  });
});
