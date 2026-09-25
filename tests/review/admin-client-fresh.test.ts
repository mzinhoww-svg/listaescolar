import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createAdminClient } from "@/lib/supabase/admin";

const seen: { signal: AbortSignal | null | undefined; cache: RequestCache | undefined }[] = [];
const fake = vi.fn(async (_u: unknown, init?: RequestInit) => {
  seen.push({ signal: init?.signal, cache: init?.cache });
  return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  seen.length = 0;
});

describe("createAdminClient({ fresh })", () => {
  it("fresh: toda leitura leva AbortSignal e no-store (sai da memoização de fetch da renderização)", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "k");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:1");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "p");
    vi.stubGlobal("fetch", fake);
    await createAdminClient({ fresh: true }).from("review_versions").select("id");
    await createAdminClient({ fresh: true }).from("review_versions").select("id");
    expect(seen).toHaveLength(2);
    for (const s of seen) {
      expect(s.signal).toBeInstanceOf(AbortSignal);
      expect(s.cache).toBe("no-store");
    }
    expect(seen[0]!.signal).not.toBe(seen[1]!.signal);
  });
  it("sem fresh: comportamento anterior (nenhum sinal imposto)", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "k");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:1");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "p");
    vi.stubGlobal("fetch", fake);
    await createAdminClient().from("review_versions").select("id");
    expect(seen[0]!.signal ?? null).toBeNull();
  });
});
