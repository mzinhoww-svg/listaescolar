import { beforeEach, describe, expect, it } from "vitest";

import { widgetRateLimited } from "@/features/widget/route-helpers";
import { __resetRateLimitForTests } from "@/lib/rate-limit/memory-bucket";

beforeEach(__resetRateLimitForTests);

const req = (ip: string) => new Request("http://x.test/api/widget/config", { headers: { "x-real-ip": ip } });

describe("widgetRateLimited (reverificação S19, N4b)", () => {
  it("30/min por IP+parceiro", () => {
    for (let i = 0; i < 30; i++) expect(widgetRateLimited(req("1.1.1.1"), "p1")).toBe(false);
    expect(widgetRateLimited(req("1.1.1.1"), "p1")).toBe(true);
  });
  it("girar o parceiro não escapa do teto por IP (120/min)", () => {
    for (let i = 0; i < 120; i++) expect(widgetRateLimited(req("2.2.2.2"), `p${i}`)).toBe(false);
    expect(widgetRateLimited(req("2.2.2.2"), "novo")).toBe(true);
    expect(widgetRateLimited(req("3.3.3.3"), "novo")).toBe(false);
  });
});
