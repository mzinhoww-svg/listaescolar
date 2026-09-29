import { beforeEach, describe, expect, it } from "vitest";

import { __resetRateLimitForTests } from "@/lib/rate-limit/memory-bucket";
import { leadCreateRateLimited } from "@/features/leads/rate-limit";

beforeEach(__resetRateLimitForTests);

describe("leadCreateRateLimited", () => {
  it("permite até o limite por IP+ator e recusa depois", () => {
    const h = new Headers({ "x-real-ip": "1.2.3.4" });
    for (let i = 0; i < 10; i++) expect(leadCreateRateLimited(h, "user-1")).toBe(false);
    expect(leadCreateRateLimited(h, "user-1")).toBe(true);
  });
  it("atores diferentes no mesmo IP têm baldes independentes", () => {
    const h = new Headers({ "x-real-ip": "1.2.3.4" });
    for (let i = 0; i < 10; i++) expect(leadCreateRateLimited(h, "user-1")).toBe(false);
    expect(leadCreateRateLimited(h, "user-1")).toBe(true);
    expect(leadCreateRateLimited(h, "user-2")).toBe(false);
  });
});
