import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type SetAll = (
  items: { name: string; value: string; options?: object }[],
  h: Record<string, string>,
) => void;
let captured: SetAll;
const getUser = vi.fn();
const maybeSingle = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_u: string, _k: string, o: { cookies: { setAll: SetAll } }) => {
    captured = o.cookies.setAll;
    return {
      auth: {
        getUser: async () => {
          captured([{ name: "sb-token", value: "v1", options: { path: "/" } }], {
            "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
            Pragma: "no-cache",
          });
          return getUser();
        },
      },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
    };
  },
}));

import { updateSession } from "@/lib/supabase/proxy";

const req = (p: string) => new NextRequest(`http://127.0.0.1:3000${p}`);

function expectPropagated(res: Response) {
  expect(res.headers.get("cache-control")).toContain("no-store");
  expect(res.headers.get("pragma")).toBe("no-cache");
  expect(res.headers.get("set-cookie")).toContain("sb-token=v1");
}

describe("updateSession", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_x");
    getUser.mockReset();
    maybeSingle.mockReset();
  });

  it("next: cookies e cabeçalhos anti-cache", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u" } } });
    const res = await updateSession(req("/"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expectPropagated(res);
  });
  it("redirect ao login: cookies e cabeçalhos", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await updateSession(req("/admin"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/entrar?next=%2Fadmin");
    expectPropagated(res);
  });
  it("rewrite 403: cookies e cabeçalhos", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u" } } });
    maybeSingle.mockResolvedValue({ data: { role: "parent" } });
    const res = await updateSession(req("/admin"));
    expect(res.headers.get("x-middleware-rewrite")).toContain("/403");
    expectPropagated(res);
  });
  it("não chama getUser em /auth/callback e /auth/confirm", async () => {
    for (const p of ["/auth/callback?code=x", "/auth/confirm?token_hash=x"]) {
      const res = await updateSession(req(p));
      expect(res.headers.get("x-middleware-next")).toBe("1");
    }
    expect(getUser).not.toHaveBeenCalled();
  });
});
