import { describe, expect, it } from "vitest";

import { rateLimitHeaders, retryAfterSeconds } from "@/features/b2b/api/rate-headers";

describe("rateLimitHeaders", () => {
  it("monta os três cabeçalhos a partir da janela mais restritiva", () => {
    const resetAt = new Date("2026-09-26T12:01:00Z");
    const headers = rateLimitHeaders({ limit: 60, remaining: 12, resetAt });
    expect(headers).toEqual({
      "X-RateLimit-Limit": "60",
      "X-RateLimit-Remaining": "12",
      "X-RateLimit-Reset": String(Math.floor(resetAt.getTime() / 1000)),
    });
  });

  it("remaining nunca é negativo", () => {
    const headers = rateLimitHeaders({ limit: 10, remaining: -3, resetAt: new Date() });
    expect(headers["X-RateLimit-Remaining"]).toBe("0");
  });
});

describe("retryAfterSeconds", () => {
  it("segundos até o fim da janela, arredondado para cima", () => {
    const now = new Date("2026-09-26T12:00:00.200Z");
    const resetAt = new Date("2026-09-26T12:00:05.000Z");
    expect(retryAfterSeconds(resetAt, now)).toBe(5);
  });

  it("nunca negativo (janela já vencida)", () => {
    const now = new Date("2026-09-26T12:00:10Z");
    const resetAt = new Date("2026-09-26T12:00:00Z");
    expect(retryAfterSeconds(resetAt, now)).toBe(0);
  });
});
