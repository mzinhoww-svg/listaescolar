// S29 T12 · UX-036 e UX-038: ponte para a loja e checkout.
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, usePathname: () => "/" }));
vi.mock("@/features/auth/guard", () => ({ requireAccess: vi.fn(async () => ({ user: { id: "u" }, role: "parent" })) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
const getCart = vi.fn();
vi.mock("@/features/cart/repository", () => ({ getCart: (...a: unknown[]) => getCart(...a), getActiveRetailerBySlug: async () => ({ id: "r", slug: "amazon", name: "Amazon" }) }));
vi.mock("@/features/cart/affiliate", () => ({ buildRetailerRedirect: () => ({ affiliateApplied: false }) }));
vi.mock("@/features/cart/service", () => ({ initialsOf: () => "A", pickItem: (c: { items: unknown[] }) => c.items[0], readServiceEnv: () => ({}) }));
const requireCartView = vi.fn();
vi.mock("@/features/cart/page-data", async (orig) => ({ ...(await orig<typeof import("@/features/cart/page-data")>()), requireCartView: (...a: unknown[]) => requireCartView(...a) }));

import IrParaPage from "@/app/ir-para/[cartId]/[retailer]/page";
import CheckoutPage from "@/app/carrinho/[id]/checkout/page";

import { CART, option, priced, stores } from "./fixtures";

beforeEach(() => vi.clearAllMocks());

describe("/ir-para", () => {
  it("'Voltar ao carrinho' leva ao carrinho e tem alvo de 44 px", async () => {
    getCart.mockResolvedValue({ id: CART, ownerId: "u", items: [{ id: "abc", name: "Caderno" }] });
    render(await IrParaPage({ params: Promise.resolve({ cartId: CART, retailer: "amazon" }), searchParams: Promise.resolve({}) } as never));
    const back = screen.getByRole("link", { name: "Voltar ao carrinho" });
    expect(back).toHaveAttribute("href", `/carrinho/${CART}`);
    expect(back.className).toContain("min-h-11");
  });
});

describe("/carrinho/[id]/checkout", () => {
  it("o título da tela aparece uma vez", async () => {
    requireCartView.mockResolvedValue({
      cart: { id: CART, strategy: null, items: [{ id: "abc", itemKey: "caderno", name: "Caderno" }] },
      options: [option({ lines: [priced()] })],
      stores,
      openedSlugs: [],
    });
    render(await CheckoutPage({ params: Promise.resolve({ id: CART }), searchParams: Promise.resolve({}) } as never));
    const titles = screen.getAllByText("Comprar por loja");
    expect(titles).toHaveLength(1);
    expect(titles[0]!.tagName).toBe("H1");
  });
});
