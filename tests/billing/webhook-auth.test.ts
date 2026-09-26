import { describe, expect, it } from "vitest";

import { isAuthorizedPixWebhook, PIX_WEBHOOK_TOKEN_MIN_LENGTH } from "@/features/billing/webhook-auth";

const SECRET = "0123456789abcdef";

describe("isAuthorizedPixWebhook", () => {
  it("aceita o token certo", () => {
    expect(isAuthorizedPixWebhook(SECRET, SECRET)).toBe(true);
  });

  it("recusa token errado, ausente ou segredo curto/ausente", () => {
    expect(isAuthorizedPixWebhook("errado-errado-errado", SECRET)).toBe(false);
    expect(isAuthorizedPixWebhook(undefined, SECRET)).toBe(false);
    expect(isAuthorizedPixWebhook(SECRET, undefined)).toBe(false);
    expect(isAuthorizedPixWebhook(SECRET, "curto")).toBe(false);
  });

  it("PIX_WEBHOOK_TOKEN_MIN_LENGTH é 16", () => {
    expect(PIX_WEBHOOK_TOKEN_MIN_LENGTH).toBe(16);
  });
});
