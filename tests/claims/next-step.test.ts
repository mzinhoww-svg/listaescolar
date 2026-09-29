import { describe, expect, it } from "vitest";

import { nextStep } from "@/features/claims/next-step";
import { CLAIM_STATUSES, type ClaimStatus } from "@/features/claims/state";

const PROMISE = /\b(em até|em \d+ (dia|hora)|24 ?h|48 ?h|amanhã|hoje)\b/i;

describe("nextStep", () => {
  const table: Array<[ClaimStatus, boolean, string, string]> = [
    ["submitted", false, "Conclua o pedido", "Concluir o pedido"],
    ["awaiting_verification", false, "Prepare a lista da escola", "Ver o status do pedido"],
    ["token_expired", false, "Peça um novo código", "Pedir novo código"],
    ["insufficient_evidence", false, "Envie mais evidências", "Enviar evidências"],
    ["rejected", false, "Pedido recusado", "Ver o motivo e pedir de novo"],
    ["approved", false, "Envie a lista da escola", "Enviar a lista"],
    ["approved", true, "Sua lista está publicada", "Ver a lista publicada"],
  ];

  it.each(table)("%s (lista: %s)", (status, hasList, title, cta) => {
    const s = nextStep(status, hasList);
    expect(s.title).toContain(title);
    expect(s.cta).toBe(cta);
    expect(s.body.length).toBeGreaterThan(10);
  });

  it("cobre todos os estados e nunca promete prazo", () => {
    for (const status of CLAIM_STATUSES) {
      for (const hasList of [false, true]) {
        const s = nextStep(status, hasList);
        expect(`${s.title} ${s.body} ${s.cta}`).not.toMatch(PROMISE);
      }
    }
  });
});
