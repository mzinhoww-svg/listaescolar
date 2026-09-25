import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const chooseCartStrategy = vi.fn();
const redirectMock = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`);
});
const notFoundMock = vi.fn(() => {
  throw new Error("NOT_FOUND");
});

vi.mock("next/navigation", () => ({
  redirect: (to: string) => redirectMock(to),
  notFound: () => notFoundMock(),
}));
vi.mock("@/features/auth/queries", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/features/cart/service", () => ({
  chooseCartStrategy: (...a: unknown[]) => chooseCartStrategy(...a),
  readServiceEnv: () => ({}),
}));

import { chooseOptionAction } from "@/app/carrinho/[id]/actions";

const CART = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const run = (fd: FormData) =>
  chooseOptionAction(fd).then(
    () => "no-redirect",
    (e: Error) => e.message,
  );

describe("chooseOptionAction", () => {
  beforeEach(() => {
    for (const m of [getCurrentUser, chooseCartStrategy, redirectMock, notFoundMock]) m.mockClear();
    getCurrentUser.mockResolvedValue({ id: USER });
    chooseCartStrategy.mockResolvedValue("ok");
  });

  it("persiste e vai ao checkout da opção", async () => {
    expect(await run(form({ cartId: CART, strategy: "fewest_stores" }))).toBe(
      `REDIRECT:/carrinho/${CART}/checkout?opcao=fewest_stores`,
    );
    expect(chooseCartStrategy.mock.calls[0]?.slice(1, 4)).toEqual([CART, USER, "fewest_stores"]);
  });

  it("entrada inválida: 404, sem tocar no banco", async () => {
    expect(await run(form({ cartId: "x", strategy: "cheapest" }))).toBe("NOT_FOUND");
    expect(await run(form({ cartId: CART, strategy: "grátis" }))).toBe("NOT_FOUND");
    expect(chooseCartStrategy).not.toHaveBeenCalled();
  });

  it("anônimo: login, sem persistir", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await run(form({ cartId: CART, strategy: "cheapest" }))).toContain("REDIRECT:/entrar");
    expect(chooseCartStrategy).not.toHaveBeenCalled();
  });

  it("carrinho alheio/inexistente: 404; opção indisponível: volta ao carrinho", async () => {
    chooseCartStrategy.mockResolvedValue("not_found");
    expect(await run(form({ cartId: CART, strategy: "cheapest" }))).toBe("NOT_FOUND");
    chooseCartStrategy.mockResolvedValue("unavailable");
    expect(await run(form({ cartId: CART, strategy: "local_stationery" }))).toBe(
      `REDIRECT:/carrinho/${CART}?opcao=local_stationery`,
    );
  });
});
