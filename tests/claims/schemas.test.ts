import { describe, expect, it } from "vitest";

import { PRIVACY_TEXT_VERSION, claimQueueFilterSchema, confirmInputSchema, createClaimInputSchema, decisionInputSchema, emailTokenSchema, submitInputSchema, whatsappCodeSchema } from "@/features/claims/schemas";

const ok = { method: "documents", claimantName: "Maria Silva", claimantRoleTitle: "Diretora", privacyAck: "on" };
const ID = "3f2b8c1e-5d4a-4b6f-9c3d-1a2b3c4d5e6f";

describe("createClaimInputSchema", () => {
  it("aceita o caso comum e normaliza", () => {
    const r = createClaimInputSchema.parse({ ...ok, claimantName: "  Maria Silva  ", evidenceNote: "  " });
    expect(r.claimantName).toBe("Maria Silva");
    expect(r.evidenceNote).toBeUndefined();
    expect(r.privacyAck).toBe(true);
  });
  it.each([
    ["nome curto", { claimantName: "M" }],
    ["nome longo", { claimantName: "x".repeat(121) }],
    ["cargo curto", { claimantRoleTitle: "D" }],
    ["cargo longo", { claimantRoleTitle: "x".repeat(81) }],
    ["nota com 501", { evidenceNote: "x".repeat(501) }],
    ["aceite ausente", { privacyAck: undefined }],
    ["aceite off", { privacyAck: "off" }],
    ["método inválido", { method: "sms" }],
  ])("recusa %s", (_n, patch) => {
    expect(createClaimInputSchema.safeParse({ ...ok, ...patch }).success).toBe(false);
  });
  it("nota com 500 e nome com 120 passam", () => {
    expect(createClaimInputSchema.safeParse({ ...ok, evidenceNote: "x".repeat(500), claimantName: "x".repeat(120) }).success).toBe(true);
  });
  it("versão do texto é constante do servidor", () => expect(PRIVACY_TEXT_VERSION).toMatch(/^claim-v\d+$/));
});

describe("decisionInputSchema", () => {
  it("aprovar não exige motivo", () => expect(decisionInputSchema.safeParse({ claimId: ID, to: "approved" }).success).toBe(true));
  it.each([["", false], ["ab", false], ["abc", true], ["x".repeat(500), true], ["x".repeat(501), false]])("recusar com motivo de %j chars: %s", (reason, valid) => {
    expect(decisionInputSchema.safeParse({ claimId: ID, to: "rejected", reason }).success).toBe(valid);
  });
  it("pedir evidência exige motivo; destino fora da lista é recusado", () => {
    expect(decisionInputSchema.safeParse({ claimId: ID, to: "insufficient_evidence" }).success).toBe(false);
    expect(decisionInputSchema.safeParse({ claimId: ID, to: "submitted", reason: "abc" }).success).toBe(false);
    expect(decisionInputSchema.safeParse({ claimId: "x", to: "approved" }).success).toBe(false);
  });
});

describe("token e código", () => {
  it("token de e-mail: 43 chars base64url", () => {
    expect(emailTokenSchema.safeParse("A".repeat(43)).success).toBe(true);
    expect(emailTokenSchema.safeParse("A".repeat(42)).success).toBe(false);
    expect(emailTokenSchema.safeParse("A".repeat(42) + "+").success).toBe(false);
    expect(emailTokenSchema.safeParse("A".repeat(42) + "=").success).toBe(false);
  });
  it("código: 6 dígitos (zeros à esquerda ok), sem letras", () => {
    expect(whatsappCodeSchema.safeParse("004821").success).toBe(true);
    for (const bad of ["12345", "1234567", "12345a", "abcdef", ""]) expect(whatsappCodeSchema.safeParse(bad).success).toBe(false);
  });
  it("confirmação: e-mail exige token; whatsapp exige reivindicação + código", () => {
    expect(confirmInputSchema.safeParse({ channel: "email", token: "A".repeat(43) }).success).toBe(true);
    expect(confirmInputSchema.safeParse({ channel: "whatsapp", code: "123456" }).success).toBe(false);
    expect(confirmInputSchema.safeParse({ channel: "whatsapp", claimId: ID, code: "12a456" }).success).toBe(false);
    expect(confirmInputSchema.safeParse({ channel: "whatsapp", claimId: ID, code: "123456" }).success).toBe(true);
  });
  it("envio e fila", () => {
    expect(submitInputSchema.safeParse({ claimId: ID }).success).toBe(true);
    expect(claimQueueFilterSchema.parse({}).limit).toBe(50);
    expect(claimQueueFilterSchema.safeParse({ status: "x" }).success).toBe(false);
  });
});
