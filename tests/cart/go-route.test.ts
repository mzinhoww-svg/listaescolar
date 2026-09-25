import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const getCart = vi.fn();
const getActiveRetailerBySlug = vi.fn();
const recordClick = vi.fn();
const createClient = vi.fn();

vi.mock("@/features/auth/queries", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: (h?: Headers) => createClient(h),
}));
vi.mock("@/features/cart/repository", () => ({
  getCart: (...a: unknown[]) => getCart(...a),
  getActiveRetailerBySlug: (...a: unknown[]) => getActiveRetailerBySlug(...a),
  recordClick: (...a: unknown[]) => recordClick(...a),
}));

import { GET } from "@/app/ir-para/[cartId]/[retailer]/go/route";

const CART = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const ITEM1 = "33333333-3333-4333-8333-333333333331";
const ITEM2 = "33333333-3333-4333-8333-333333333332";
const RETAILER_ID = "44444444-4444-4444-8444-444444444444";

// Varejista de teste (fixture), não é dado real.
const retailer = {
  id: RETAILER_ID,
  slug: "amazon",
  name: "Amazon",
  baseUrl: "https://www.amazon.com.br",
  searchUrlTemplate: "https://www.amazon.com.br/s?k={query}",
  affiliateKind: "amazon" as const,
  isActive: true,
};
const cart = {
  id: CART,
  ownerId: USER,
  listId: null,
  strategy: "cheapest" as const,
  isDemo: true,
  items: [
    {
      id: ITEM1,
      listItemId: null,
      name: "Caderno 96 folhas",
      itemKey: "caderno 96 folhas",
      quantity: 2,
    },
    {
      id: ITEM2,
      listItemId: null,
      name: "Lápis & cola #1",
      itemKey: "lapis & cola #1",
      quantity: 1,
    },
  ],
};

const call = (retailerSlug = "amazon", qs = "", cartId = CART) =>
  GET(new Request(`http://localhost/ir-para/${cartId}/${retailerSlug}/go${qs}`), {
    params: Promise.resolve({ cartId, retailer: retailerSlug }),
  });

describe("GET /ir-para/[cartId]/[retailer]/go", () => {
  beforeEach(() => {
    for (const m of [getCurrentUser, getCart, getActiveRetailerBySlug, recordClick, createClient])
      m.mockReset();
    vi.unstubAllEnvs();
    vi.stubEnv("AMAZON_ASSOCIATE_TAG", "");
    getCurrentUser.mockResolvedValue({ id: USER });
    createClient.mockImplementation(async (h?: Headers) => {
      h?.set("Set-Cookie", "sb=1");
      return {};
    });
    getCart.mockResolvedValue(cart);
    getActiveRetailerBySlug.mockResolvedValue(retailer);
    recordClick.mockResolvedValue("click-id");
  });

  it("anônimo: 307 para o login, sem registrar clique", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toBe(
      `/entrar?next=${encodeURIComponent(`/ir-para/${CART}/amazon`)}`,
    );
    expect(recordClick).not.toHaveBeenCalled();
    expect(getCart).not.toHaveBeenCalled();
  });

  it("parâmetros inválidos: 404", async () => {
    expect((await call("AMAZON")).status).toBe(404);
    expect((await call("amazon", "", "nao-uuid")).status).toBe(404);
    expect(recordClick).not.toHaveBeenCalled();
  });

  it("carrinho inexistente ou sem acesso (RLS): 404", async () => {
    getCart.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(recordClick).not.toHaveBeenCalled();
  });

  it("carrinho de outro dono: 404 mesmo que a RLS o devolvesse (admin)", async () => {
    getCart.mockResolvedValue({ ...cart, ownerId: "99999999-9999-4999-8999-999999999999" });
    expect((await call()).status).toBe(404);
    expect(recordClick).not.toHaveBeenCalled();
  });

  it("varejista desconhecido ou inativo: 404", async () => {
    getActiveRetailerBySlug.mockResolvedValue(null);
    expect((await call("naoexiste")).status).toBe(404);
    expect(recordClick).not.toHaveBeenCalled();
  });

  it("carrinho sem itens: 404", async () => {
    getCart.mockResolvedValue({ ...cart, items: [] });
    expect((await call()).status).toBe(404);
  });

  it("sucesso sem ID de afiliado: 307, Location simples, clique com affiliateApplied=false", async () => {
    const res = await call();
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toBe("https://www.amazon.com.br/s?k=Caderno%2096%20folhas");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Set-Cookie")).toBe("sb=1");
    expect(recordClick).toHaveBeenCalledTimes(1);
    expect(recordClick.mock.calls[0]?.[1]).toEqual({
      cartId: CART,
      retailerId: RETAILER_ID,
      profileId: USER,
      affiliateApplied: false,
      targetUrl: "https://www.amazon.com.br/s?k=Caderno%2096%20folhas",
    });
  });

  it("com ID de afiliado: tag na URL e affiliateApplied=true", async () => {
    vi.stubEnv("AMAZON_ASSOCIATE_TAG", "listacerta-20");
    const res = await call();
    expect(res.headers.get("Location")).toContain("tag=listacerta-20");
    expect(recordClick.mock.calls[0]?.[1]).toMatchObject({ affiliateApplied: true });
  });

  it("item escolhido do carrinho é codificado (&, #, espaço)", async () => {
    const res = await call("amazon", `?item=${ITEM2}`);
    expect(res.headers.get("Location")).toBe(
      "https://www.amazon.com.br/s?k=L%C3%A1pis%20%26%20cola%20%231",
    );
  });

  it("item de fora do carrinho e parâmetros de destino são ignorados (sem open redirect)", async () => {
    const outro = "33333333-3333-4333-8333-333333333399";
    const res = await call("amazon", `?item=${outro}&url=https://evil.example&to=//evil.example`);
    const location = res.headers.get("Location") ?? "";
    expect(new URL(location).hostname).toBe("www.amazon.com.br");
    expect(location).not.toContain("evil");
    expect(location).toContain("Caderno");
  });

  it("clique duplo registra dois cliques", async () => {
    await call();
    await call();
    expect(recordClick).toHaveBeenCalledTimes(2);
  });

  it("falha ao registrar o clique: 303 para a tela com ?erro=clique, sem ir à loja, e loga", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    recordClick.mockRejectedValue(new Error("boom"));
    const res = await call("amazon", `?item=${ITEM2}`);
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe(`/ir-para/${CART}/amazon?item=${ITEM2}&erro=clique`);
    expect(res.headers.get("Location")).not.toContain("amazon.com.br");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("template inseguro no cadastro: 404 sem clique", async () => {
    getActiveRetailerBySlug.mockResolvedValue({
      ...retailer,
      searchUrlTemplate: "https://{query}.evil.example/",
    });
    expect((await call()).status).toBe(404);
    expect(recordClick).not.toHaveBeenCalled();
  });
});
