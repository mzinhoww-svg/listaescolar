import { describe, expect, it } from "vitest";

import { REASON, availableMethods, isBrMobile } from "@/features/claims/channels";

const SENDER = { channels: { email: true, whatsapp: true } } as const;

describe("isBrMobile", () => {
  it.each([
    ["65999990001", true],
    ["5565999990001", true],
    ["(65) 99999-0001", true],
    ["+55 65 99999-0001", true],
    ["6533221100", false], // fixo
    ["556533221100", false],
    ["65899990001", false], // sem o 9
    ["0599990001", false],
    ["", false],
    [null, false],
    [undefined, false],
    ["abc", false],
  ])("%j -> %s", (phone, expected) => expect(isBrMobile(phone as string | null | undefined)).toBe(expected));
});

describe("availableMethods", () => {
  it("com sender e contatos: tudo disponível", () => {
    const m = availableMethods({ hasEmail: true, phone: "65999990001", sender: SENDER });
    expect(Object.values(m).every((x) => x.available)).toBe(true);
  });
  it("sender ausente: e-mail e WhatsApp indisponíveis com motivo; documentos sempre", () => {
    const m = availableMethods({ hasEmail: true, phone: "65999990001", sender: null });
    expect(m.institutional_email).toEqual({ available: false, reason: REASON.noSender });
    expect(m.institutional_whatsapp).toEqual({ available: false, reason: REASON.noSender });
    expect(m.documents).toEqual({ available: true });
  });
  it("sem e-mail ou com telefone fixo: motivo específico, sem revelar contato", () => {
    const m = availableMethods({ hasEmail: false, phone: "6533221100", sender: SENDER });
    expect(m.institutional_email).toEqual({ available: false, reason: REASON.noEmail });
    expect(m.institutional_whatsapp).toEqual({ available: false, reason: REASON.noMobile });
    expect(JSON.stringify(m)).not.toMatch(/6533221100|@/);
  });
  it("sender só de e-mail deixa o WhatsApp indisponível", () => {
    const m = availableMethods({ hasEmail: true, phone: "65999990001", sender: { channels: { email: true, whatsapp: false } } });
    expect(m.institutional_email.available).toBe(true);
    expect(m.institutional_whatsapp.available).toBe(false);
  });
});
