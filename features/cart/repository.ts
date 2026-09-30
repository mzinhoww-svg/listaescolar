import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { normalizeItemKey } from "./item-key";
import type { ListKind } from "./ports";
import { fail } from "./repository-shared";
import { CART_STRATEGIES, type CartStrategy } from "./types";

/**
 * D-057 (S18): este arquivo tinha 314 linhas. Dividido em `repository-shared.ts` (erro comum),
 * `repository-retailers.ts` (varejistas) e `repository-snapshots.ts` (preços, escolha e clique) — este arquivo
 * continua sendo o ÚNICO ponto de import (`@/features/cart/repository`) e reexporta os dois irmãos, mantendo o
 * CRUD de carrinho (que dá nome ao módulo).
 *
 * Todas as funções recebem o cliente (do usuário, para valer a RLS; ou admin, em rotinas de servidor).
 */
export { RepositoryError } from "./repository-shared";
export * from "./repository-retailers";
export * from "./repository-snapshots";

export type CartItemRow = {
  id: string;
  listItemId: string | null;
  name: string;
  itemKey: string;
  quantity: number;
};
export type CartRow = {
  id: string;
  ownerId: string;
  listId: string | null;
  strategy: CartStrategy;
  isDemo: boolean;
  items: CartItemRow[];
};

export type NewCartInput = {
  ownerId: string;
  listId: string | null;
  strategy?: CartStrategy;
  isDemo?: boolean;
  /** Origem de `listId` (S11): official | parent_copy | demo. Omitido = default do banco (`demo`). */
  listKind?: ListKind;
  items: { listItemId?: string | null; name: string; quantity: number }[];
  /** Uma chave por renderização do formulário: o mesmo (dono, chave) devolve o mesmo carrinho (`createCartOnce`). */
  idempotencyKey?: string;
};

/**
 * Criação idempotente por (dono, `idempotencyKey`): a segunda chamada (mesmo dono e chave, mesmo simultânea) não cria outro
 * carrinho e devolve o do primeiro com `created: false`; quem recebe `false` não repete o que só a criação faz (itens, retrato).
 */
export async function createCartOnce(client: SupabaseClient, input: NewCartInput & { idempotencyKey: string }): Promise<{ cartId: string; created: boolean }> {
  try {
    return { cartId: await createCart(client, input), created: true };
  } catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code;
    const dup = code === "23505" || /carts_owner_idempotency_key_uidx/.test(error instanceof Error ? error.message : "");
    if (!dup) throw error;
    const { data, error: readError } = await client
      .from("carts")
      .select("id")
      .eq("owner_id", input.ownerId)
      .eq("idempotency_key", input.idempotencyKey)
      .single();
    if (readError) fail("ler carrinho já criado", readError);
    return { cartId: z.uuid().parse(data.id), created: false };
  }
}

export async function createCart(client: SupabaseClient, input: NewCartInput): Promise<string> {
  const { data, error } = await client
    .from("carts")
    .insert({
      owner_id: input.ownerId,
      list_id: input.listId,
      strategy: input.strategy ?? "cheapest",
      is_demo: input.isDemo ?? false,
      ...(input.listKind ? { list_kind: input.listKind } : {}),
      ...(input.idempotencyKey ? { idempotency_key: input.idempotencyKey } : {}),
    })
    .select("id")
    .single();
  if (error) fail("criar carrinho", error);
  const cartId = z.uuid().parse(data.id);
  if (input.items.length > 0) {
    const { error: itemsError } = await client.from("cart_items").insert(
      input.items.map((i) => ({
        cart_id: cartId,
        list_item_id: i.listItemId ?? null,
        name: i.name,
        quantity: i.quantity,
      })),
    );
    if (itemsError) {
      // Sem carrinho pela metade; se o desfazer também falhar, o erro original leva os dois.
      const { error: undoError } = await client.from("carts").delete().eq("id", cartId);
      const suffix = undoError
        ? `; falha ao desfazer o carrinho ${cartId}: ${undoError.message}`
        : "";
      fail("criar itens do carrinho", {
        message: `${itemsError.message}${suffix}`,
        code: itemsError.code,
      });
    }
  }
  return cartId;
}

export type CartSummaryRow = {
  id: string;
  isDemo: boolean;
  strategy: CartStrategy;
  itemCount: number;
  createdAt: Date;
  /** Versão da lista de origem (polimórfica: pode ser cópia privada ou demonstração). */
  listId: string | null;
};

const cartSummaryRow = z.object({
  id: z.uuid(),
  is_demo: z.boolean(),
  strategy: z.enum(CART_STRATEGIES),
  created_at: z.coerce.date(),
  list_id: z.uuid().nullable(),
  cart_items: z.array(z.object({ id: z.uuid() })),
});

/**
 * Carrinhos do dono (S15, hub da família), mais recentes primeiro. `list_id` é polimórfico (oficial, cópia do pai
 * ou demonstração, sem FK — S12/S11) e por isso não é resolvido aqui: a tela linka para `/carrinho/{id}`.
 */
export async function listCartsForOwner(client: SupabaseClient, ownerId: string, limit = 20): Promise<CartSummaryRow[]> {
  const { data, error } = await client
    .from("carts")
    .select("id, is_demo, strategy, created_at, list_id, cart_items(id)")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail("listar carrinhos", error);
  return z
    .array(cartSummaryRow)
    .parse(data ?? [])
    .map((r) => ({ id: r.id, isDemo: r.is_demo, strategy: r.strategy, itemCount: r.cart_items.length, createdAt: r.created_at, listId: r.list_id }));
}

/** Carrinho com itens; sem acesso (RLS) ou inexistente → null (não distingue os dois casos). */
export async function getCart(client: SupabaseClient, cartId: string): Promise<CartRow | null> {
  const { data, error } = await client
    .from("carts")
    .select(
      "id, owner_id, list_id, strategy, is_demo, cart_items(id, list_item_id, name, quantity, created_at)",
    )
    .eq("id", cartId)
    .maybeSingle();
  if (error) fail("ler carrinho", error);
  if (!data) return null;
  const items = z
    .array(
      z.object({
        id: z.uuid(),
        list_item_id: z.uuid().nullable(),
        name: z.string(),
        quantity: z.number().int(),
        created_at: z.string(),
      }),
    )
    .parse(data.cart_items)
    .sort((a, b) =>
      a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1,
    );
  return {
    id: z.uuid().parse(data.id),
    ownerId: z.uuid().parse(data.owner_id),
    listId: z.uuid().nullable().parse(data.list_id),
    strategy: z.enum(CART_STRATEGIES).parse(data.strategy),
    isDemo: z.boolean().parse(data.is_demo),
    items: items.map((i) => ({
      id: i.id,
      listItemId: i.list_item_id,
      name: i.name,
      itemKey: normalizeItemKey(i.name),
      quantity: i.quantity,
    })),
  };
}
