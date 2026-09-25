import { beforeEach, describe, expect, it, vi } from "vitest";

const getCart = vi.fn();
vi.mock("@/features/cart/repository", () => ({ getCart: (...a: unknown[]) => getCart(...a) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/features/leads/repository", () => ({ createLeadStore: () => ({}) }));
vi.mock("@/lib/site-url", () => ({ getSiteOrigin: () => "https://listacerta.example" }));
vi.mock("@/features/cart/service", () => ({ readServiceEnv: () => ({ DEMO_RETAILERS: undefined }) }));

import { LeadError } from "@/features/leads/errors";
import { getLeadService } from "@/features/leads/wiring";

const USER = "22222222-2222-4222-8222-222222222222";

describe("wiring do serviço de leads", () => {
  beforeEach(() => {
    getCart.mockResolvedValue({
      id: "55555555-5555-4555-8555-555555555555",
      ownerId: USER,
      listId: "66666666-6666-4666-8666-666666666666",
      isDemo: false,
      items: [{ name: "Lápis", itemKey: "lapis", quantity: 1 }],
    });
  });

  it("DEMO desligado: sem leitor de contexto, o pedido falha com list_unavailable", async () => {
    const svc = getLeadService();
    const err = await svc
      .createLead({ userId: USER, role: "parent" } as never, {
        cartId: "55555555-5555-4555-8555-555555555555",
        stationeryId: "44444444-4444-4444-8444-444444444444",
        consent: true,
        idempotencyKey: "77777777-7777-4777-8777-777777777777",
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LeadError);
    expect((err as LeadError).code).toBe("list_unavailable");
  });
});
