import { describe, expect, it } from "vitest";

import { DEMO_LIST_ID } from "@/features/cart/memory-list-reader";
import { createDemoLeadListContextReader } from "@/features/leads/demo-context-reader";
import { InMemoryLeadListContextReader } from "@/features/leads/memory-context-reader";

describe("leitor de contexto de demonstração", () => {
  it("fail-closed: sem flag, em produção ou com Supabase remoto fora da Vercel, não existe", () => {
    expect(createDemoLeadListContextReader({})).toBeNull();
    expect(createDemoLeadListContextReader({ DEMO_RETAILERS: "1", VERCEL_ENV: "production" })).toBeNull();
    expect(createDemoLeadListContextReader({ DEMO_RETAILERS: "1", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" })).toBeNull();
  });

  it("com a flag em ambiente local devolve a lista demo, marcada is_demo", async () => {
    const reader = createDemoLeadListContextReader({ DEMO_RETAILERS: "1", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" });
    expect(reader).not.toBeNull();
    await expect(reader?.getContext(DEMO_LIST_ID)).resolves.toMatchObject({ schoolName: "Escola Demonstração", isDemo: true });
    await expect(reader?.getContext("00000000-0000-4000-8000-000000000000")).resolves.toBeNull();
  });
});

describe("InMemoryLeadListContextReader", () => {
  it("devolve cópia (mutação não vaza)", async () => {
    const ctx = { schoolName: "E", gradeLabel: "G", schoolYear: 2027, items: [{ name: "x", quantity: 1 }], isDemo: false };
    const reader = new InMemoryLeadListContextReader(new Map([["a", ctx]]));
    const got = await reader.getContext("a");
    got?.items.push({ name: "y", quantity: 2 });
    expect((await reader.getContext("a"))?.items).toHaveLength(1);
  });
});
