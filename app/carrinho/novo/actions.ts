"use server";

import { redirect } from "next/navigation";

import { getSessionActor } from "@/features/auth/actor";
import { getCurrentUser } from "@/features/auth/queries";
import { createCart } from "@/features/cart/repository";
import { createCartSchema } from "@/features/cart/schemas";
import { getListReader, readServiceEnv, snapshotCartOptions } from "@/features/cart/service";
import { createClient } from "@/lib/supabase/server";

/**
 * Cria o carrinho relendo a lista no servidor (nada de itens vindos do formulário). A origem (`list_kind`) e o `is_demo` vêm do
 * leitor: lista oficial e cópia do PRÓPRIO pai nascem reais (`is_demo = false`); demonstração nasce `is_demo = true`. Cópia alheia
 * e lista inexistente têm a mesma resposta ("lista não encontrada").
 */
export async function createCartAction(formData: FormData): Promise<void> {
  const parsed = createCartSchema.safeParse({ listId: formData.get("listId") });
  if (!parsed.success) redirect("/carrinho/novo?erro=lista");
  const { listId } = parsed.data;
  const user = await getCurrentUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(`/carrinho/novo?lista=${listId}`)}`);
  const actor = await getSessionActor();
  const list = await getListReader(readServiceEnv()).getList(listId, { actor });
  if (!list || list.items.length === 0) redirect(`/carrinho/novo?lista=${listId}&erro=lista`);
  const client = await createClient();
  const cartId = await createCart(client, {
    ownerId: user.id,
    listId,
    listKind: list.kind,
    isDemo: list.isDemo,
    // cart_items.list_item_id tem FK para list_items: só versão oficial aponta para item de lista; cópia do pai e demonstração não.
    items: list.items.map((i) => ({ listItemId: list.kind === "official" ? i.id : null, name: i.name, quantity: i.quantity })),
  });
  // Retrato inicial das opções (preço, origem e data) para consulta posterior.
  await snapshotCartOptions(client, cartId, user.id, readServiceEnv());
  redirect(`/carrinho/${cartId}`);
}
