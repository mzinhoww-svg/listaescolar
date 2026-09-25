import { describe, expect, it } from "vitest";

import { LEAD_CONSENT_STATIONERY_SEES, LEAD_CONSENT_TEXT_VERSION } from "@/features/leads/consent";

describe("texto de consentimento", () => {
  it("diz que a papelaria vê o bairro informado (o grant por coluna inclui neighborhood)", () => {
    expect(LEAD_CONSENT_STATIONERY_SEES).toMatch(/bairro informado/);
  });
  it("versão nova depois de mudar o texto", () => {
    expect(LEAD_CONSENT_TEXT_VERSION).not.toBe("lead-whatsapp-2026-09");
  });
});
