import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => getUser() },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  }),
}));

import { proxy } from "@/proxy";

const req = (p: string) => new NextRequest(`http://127.0.0.1:3000${p}`);

describe("proxy: cabeçalhos de segurança e CSP (S19)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_x");
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: null } });
  });

  it("aplica CSP com nonce diferente a cada requisição, sem 'unsafe-inline' em script-src", async () => {
    const res1 = await proxy(req("/"));
    const res2 = await proxy(req("/"));
    const csp1 = res1.headers.get("Content-Security-Policy");
    const csp2 = res2.headers.get("Content-Security-Policy");
    expect(csp1).toBeTruthy();
    expect(csp1).not.toBe(csp2);
    const scriptSrc = (csp1 as string).split(";").find((d) => d.trim().startsWith("script-src"));
    expect(scriptSrc).not.toContain("unsafe-inline");
  });

  it("aplica os cabeçalhos base (HSTS, nosniff, Referrer-Policy, COOP)", async () => {
    const res = await proxy(req("/entrar"));
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Strict-Transport-Security")).toMatch(/max-age=/);
    expect(res.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
  });

  it("não aplica CSP em /api/widget/** nem em /widget.js (S25, sem iframe)", async () => {
    const widgetApi = await proxy(req("/api/widget/config"));
    const widgetJs = await proxy(req("/widget.js"));
    expect(widgetApi.headers.get("Content-Security-Policy")).toBeNull();
    expect(widgetJs.headers.get("Content-Security-Policy")).toBeNull();
  });
});
