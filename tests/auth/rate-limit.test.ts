import { beforeEach, describe, expect, it } from "vitest";

import { __resetRateLimitForTests } from "@/lib/rate-limit/memory-bucket";
import { loginRateLimited } from "@/features/auth/rate-limit";

beforeEach(__resetRateLimitForTests);

describe("loginRateLimited", () => {
  it("permite até o limite por IP e recusa depois", () => {
    const h = new Headers({ "x-real-ip": "1.2.3.4" });
    for (let i = 0; i < 5; i++) expect(loginRateLimited(h)).toBe(false);
    expect(loginRateLimited(h)).toBe(true);
  });
  it("IPs diferentes têm baldes independentes", () => {
    const a = new Headers({ "x-real-ip": "1.1.1.1" });
    const b = new Headers({ "x-real-ip": "2.2.2.2" });
    for (let i = 0; i < 5; i++) expect(loginRateLimited(a)).toBe(false);
    expect(loginRateLimited(a)).toBe(true);
    expect(loginRateLimited(b)).toBe(false);
  });
  it("sem cabeçalho de IP identificável, ainda limita (balde 'unknown')", () => {
    const h = new Headers();
    for (let i = 0; i < 5; i++) expect(loginRateLimited(h)).toBe(false);
    expect(loginRateLimited(h)).toBe(true);
  });
});
