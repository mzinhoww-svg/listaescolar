import { describe, expect, it } from "vitest";

import { billingTermsText, BILLING_TERMS_TEXT_VERSION } from "@/features/billing/terms";
import type { ActivePlan } from "@/features/billing/ports";

const PLAN: ActivePlan = {
  id: "p1",
  version: 1,
  freeLeads: 2,
  freeLeadsValidityDays: 90,
  seasonStartMonth: 11,
  seasonEndMonth: 3,
  tiers: [
    { minItems: 1, maxItems: 20, priceCents: 500 },
    { minItems: 21, maxItems: null, priceCents: 900 },
  ],
  packages: [{ id: "k1", amountCents: 5000 }],
  pass: { priceCents: 30000, includedLeads: 40, maxInstallments: 3 },
};

describe("billingTermsText", () => {
  it("menciona débito só na entrega, faixas do plano e créditos sem validade", () => {
    const text = billingTermsText(PLAN);
    expect(text).toContain("entregue");
    expect(text).toContain("R$ 5,00");
    expect(text).toContain("R$ 9,00");
    expect(text).toContain("não têm validade");
    expect(text).toContain("R$ 300,00");
    expect(text).not.toMatch(/prazo de \d/i);
  });

  it("sem passe, não menciona valor de passe", () => {
    const text = billingTermsText({ ...PLAN, pass: null });
    expect(text).not.toContain("passe de temporada custa");
  });

  it("versão do texto é uma constante estável", () => {
    expect(BILLING_TERMS_TEXT_VERSION).toBe("billing-terms-v1");
  });
});
