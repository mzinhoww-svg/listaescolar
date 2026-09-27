import { describe, expect, it } from "vitest";
import { SIGNATURE_TOLERANCE_SECONDS, signPayload, verifySignature } from "@/features/webhooks/sign";

const SECRET = "whsec_teste_0123456789abcdef";
const BODY = JSON.stringify({ event: "list.published", data: { school: { inep: "51999901" } } });

describe("signPayload / verifySignature (aceite S25: assinatura verificável por teste)", () => {
  it("round-trip: assina e verifica com sucesso", () => {
    const now = 1_700_000_000;
    const header = signPayload(SECRET, now, BODY);
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(verifySignature(SECRET, header, BODY, { nowMs: now * 1000 })).toEqual({ ok: true });
  });

  it("corpo adulterado depois de assinado é recusado", () => {
    const now = 1_700_000_000;
    const header = signPayload(SECRET, now, BODY);
    expect(verifySignature(SECRET, header, BODY + "x", { nowMs: now * 1000 })).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("assinatura adulterada é recusada", () => {
    const now = 1_700_000_000;
    const header = signPayload(SECRET, now, BODY).replace(/v1=./, "v1=0");
    expect(verifySignature(SECRET, header, BODY, { nowMs: now * 1000 })).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("segredo errado é recusado", () => {
    const now = 1_700_000_000;
    const header = signPayload(SECRET, now, BODY);
    expect(verifySignature("outro-segredo", header, BODY, { nowMs: now * 1000 })).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("timestamp fora da tolerância (replay) é recusado, dentro é aceito", () => {
    const now = 1_700_000_000;
    const header = signPayload(SECRET, now, BODY);
    const justInside = (now + SIGNATURE_TOLERANCE_SECONDS) * 1000;
    const justOutside = (now + SIGNATURE_TOLERANCE_SECONDS + 1) * 1000;
    expect(verifySignature(SECRET, header, BODY, { nowMs: justInside })).toEqual({ ok: true });
    expect(verifySignature(SECRET, header, BODY, { nowMs: justOutside })).toEqual({ ok: false, reason: "timestamp_out_of_tolerance" });
  });

  it("cabeçalho malformado é recusado sem lançar", () => {
    expect(verifySignature(SECRET, "lixo", BODY)).toEqual({ ok: false, reason: "malformed_header" });
    expect(verifySignature(SECRET, "t=abc,v1=zz", BODY)).toEqual({ ok: false, reason: "malformed_header" });
  });
});
