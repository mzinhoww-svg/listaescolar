import { describe, expect, it } from "vitest";

import { composeCloseReason, isValidObservationCode, LIST_CLOSE_REASONS } from "@/features/lists/close-reasons";

describe("composeCloseReason (revisão de segurança S16: motivo de arquivamento só por código)", () => {
  it("sem observação: só o código", () => {
    expect(composeCloseReason("denuncia_procedente")).toBe("denuncia_procedente");
  });
  it("com observação: código + ':' + observação, em minúsculas", () => {
    expect(composeCloseReason("outro", "E2E_S16")).toBe("outro:e2e_s16");
  });
  it("observação vazia/nula conta como ausente", () => {
    expect(composeCloseReason("duplicada", "")).toBe("duplicada");
    expect(composeCloseReason("duplicada", null)).toBe("duplicada");
  });
  it("todo código do vocabulário compõe uma string válida (sem espaço)", () => {
    for (const code of LIST_CLOSE_REASONS) expect(composeCloseReason(code)).not.toMatch(/\s/);
  });
});

describe("isValidObservationCode", () => {
  it.each(["denuncia_123", "abc", "a1.b-c"])("aceita %s", (v) => expect(isValidObservationCode(v)).toBe(true));
  it.each(["com espaço", "Maria Silva", "1abc", "", "café"])("recusa %s", (v) => expect(isValidObservationCode(v)).toBe(false));
});
