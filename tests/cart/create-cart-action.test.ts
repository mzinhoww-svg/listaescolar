// Carrinho a partir de lista real (S11): origem (`list_kind`), `is_demo`, FK de item e a mesma resposta para cópia alheia.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
const getCurrentUser = vi.fn();
vi.mock("@/features/auth/queries", () => ({ getCurrentUser: () => getCurrentUser() }));
const getSessionActor = vi.fn();
vi.mock("@/features/auth/actor", () => ({ getSessionActor: () => getSessionActor() }));
const createCart = vi.fn();
vi.mock("@/features/cart/repository", () => ({ createCart: (...a: unknown[]) => createCart(...a) }));
const getList = vi.fn();
const snapshotCartOptions = vi.fn();
vi.mock("@/features/cart/service", () => ({
  getListReader: () => ({ getList: (...a: unknown[]) => getList(...a) }),
  readServiceEnv: () => ({}),
  snapshotCartOptions: (...a: unknown[]) => snapshotCartOptions(...a),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ tag: "user-client" }) }));

import { createCartAction } from "@/app/carrinho/novo/actions";

const ME = "22222222-2222-4222-8222-222222222222";
const LIST = "66666666-6666-4666-8666-666666666666";
const CART = "55555555-5555-4555-8555-555555555555";
const ACTOR = { userId: ME, role: "parent" };
const form = (listId: string = LIST) => {
  const fd = new FormData();
  fd.set("listId", listId);
  return fd;
};
const items = [
  { id: "77777777-7777-4777-8777-777777777771", name: "Caderno", quantity: 2 },
  { id: "77777777-7777-4777-8777-777777777772", name: "Lápis", quantity: 12 },
];

beforeEach(() => {
  for (const m of [getCurrentUser, getSessionActor, createCart, getList, snapshotCartOptions]) m.mockReset();
  getCurrentUser.mockResolvedValue({ id: ME });
  getSessionActor.mockResolvedValue(ACTOR);
  createCart.mockResolvedValue(CART);
});

describe("createCartAction (S11)", () => {
  it("lista oficial: list_kind official, is_demo false e os itens apontam para list_items", async () => {
    getList.mockResolvedValue({ kind: "official", isDemo: false, items });
    await expect(createCartAction(form())).rejects.toThrow(`REDIRECT:/carrinho/${CART}`);
    expect(getList).toHaveBeenCalledWith(LIST, { actor: ACTOR });
    expect(createCart.mock.calls[0]![1]).toMatchObject({ ownerId: ME, listId: LIST, listKind: "official", isDemo: false });
    expect(createCart.mock.calls[0]![1].items.map((i: { listItemId: string | null }) => i.listItemId)).toEqual(items.map((i) => i.id));
  });

  it("cópia do PRÓPRIO pai: parent_copy, is_demo false e sem list_item_id (a FK é de itens oficiais)", async () => {
    getList.mockResolvedValue({ kind: "parent_copy", isDemo: false, items: items.map((i, n) => ({ ...i, id: `${LIST}:${n + 1}` })) });
    await expect(createCartAction(form())).rejects.toThrow("REDIRECT:/carrinho/");
    expect(createCart.mock.calls[0]![1]).toMatchObject({ listKind: "parent_copy", isDemo: false });
    expect(createCart.mock.calls[0]![1].items.every((i: { listItemId: string | null }) => i.listItemId === null)).toBe(true);
  });

  it("demonstração: demo e is_demo true; sem list_item_id", async () => {
    getList.mockResolvedValue({ kind: "demo", isDemo: true, items });
    await expect(createCartAction(form())).rejects.toThrow("REDIRECT:/carrinho/");
    expect(createCart.mock.calls[0]![1]).toMatchObject({ listKind: "demo", isDemo: true });
    expect(createCart.mock.calls[0]![1].items.every((i: { listItemId: string | null }) => i.listItemId === null)).toBe(true);
  });

  it("cópia alheia e lista inexistente: a MESMA resposta (lista não encontrada), sem criar carrinho", async () => {
    getList.mockResolvedValue(null);
    const a = await createCartAction(form()).catch((e: Error) => e.message);
    const b = await createCartAction(form("99999999-9999-4999-8999-999999999999")).catch((e: Error) => e.message);
    expect(a).toBe(`REDIRECT:/carrinho/novo?lista=${LIST}&erro=lista`);
    expect(b).toBe("REDIRECT:/carrinho/novo?lista=99999999-9999-4999-8999-999999999999&erro=lista");
    expect(createCart).not.toHaveBeenCalled();
  });

  it("sem sessão: vai para o login e não lê a lista", async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(createCartAction(form())).rejects.toThrow("REDIRECT:/entrar?next=");
    expect(getList).not.toHaveBeenCalled();
  });
});
