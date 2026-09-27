import { beforeEach, describe, expect, it } from "vitest";
import { __resetRateLimitForTests, checkRateLimit } from "@/lib/rate-limit/memory-bucket";

beforeEach(__resetRateLimitForTests);

describe("checkRateLimit", () => {
  it("permite até o limite e recusa depois, dentro da mesma janela", () => {
    const t = 0;
    for (let i = 0; i < 5; i++) expect(checkRateLimit("k1", 5, 1000, t)).toBe(true);
    expect(checkRateLimit("k1", 5, 1000, t)).toBe(false);
  });

  it("janela nova reseta a contagem", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("k1", 5, 1000, 0);
    expect(checkRateLimit("k1", 5, 1000, 0)).toBe(false);
    expect(checkRateLimit("k1", 5, 1000, 1001)).toBe(true);
  });

  it("chaves diferentes têm baldes independentes", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("a", 5, 1000, 0);
    expect(checkRateLimit("a", 5, 1000, 0)).toBe(false);
    expect(checkRateLimit("b", 5, 1000, 0)).toBe(true);
  });
});
