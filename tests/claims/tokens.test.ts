import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { emailTokenSchema } from "@/features/claims/schemas";
import { generateEmailToken, generateWhatsappCode, hashToken } from "@/features/claims/tokens";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const CLAIM = "3f2b8c1e-5d4a-4b6f-9c3d-1a2b3c4d5e6f";

describe("tokens", () => {
  it("token de e-mail: 43 chars base64url, distintos entre si", () => {
    const set = new Set(Array.from({ length: 50 }, generateEmailToken));
    expect(set.size).toBe(50);
    for (const t of set) expect(emailTokenSchema.safeParse(t).success).toBe(true);
  });
  it("código: sempre 6 dígitos, inclusive com zeros à esquerda", () => {
    const codes = Array.from({ length: 3000 }, generateWhatsappCode);
    for (const c of codes) expect(c).toMatch(/^[0-9]{6}$/);
    expect(codes.some((c) => c.startsWith("0"))).toBe(true);
  });
  it("hash de e-mail é sha256 hex do token, determinístico", () => {
    const t = generateEmailToken();
    expect(hashToken({ channel: "email", token: t })).toBe(sha(t));
    expect(hashToken({ channel: "email", token: t })).toBe(hashToken({ channel: "email", token: t }));
    expect(hashToken({ channel: "email", token: t })).toMatch(/^[0-9a-f]{64}$/);
  });
  it("hash do WhatsApp inclui a reivindicação e preserva zeros à esquerda", () => {
    expect(hashToken({ channel: "whatsapp", claimId: CLAIM, code: "004821" })).toBe(sha(`${CLAIM}:004821`));
    expect(hashToken({ channel: "whatsapp", claimId: CLAIM, code: "004821" })).not.toBe(hashToken({ channel: "whatsapp", claimId: CLAIM, code: "4821" }));
    expect(hashToken({ channel: "whatsapp", claimId: CLAIM, code: "123456" })).not.toBe(
      hashToken({ channel: "whatsapp", claimId: "00000000-0000-4000-8000-000000000000", code: "123456" }),
    );
  });
});
