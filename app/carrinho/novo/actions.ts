"use server";

import { redirect } from "next/navigation";

import { getSessionActor } from "@/features/auth/actor";
import { getCurrentUser } from "@/features/auth/queries";
import { createCartOnce } from "@/features/cart/repository";
import { createCartSchema } from "@/features/cart/schemas";
import { getListReader, readServiceEnv, snapshotCartOptions } from "@/features/cart/service";
import { createClient } from "@/lib/supabase/server";

/**
 * Cria o carrinho relendo a lista no servidor (nada de itens vindos do formulário). A origem (`list_kind`) e o `is_demo` vêm do
 * leitor: lista oficial e cópia do PRÓPRIO pai nascem reais (`is_demo = false`); demonstração nasce `is_demo = true`. Cópia alheia
 * e lista inexistente têm a mesma resposta ("lista não encontrada").
 */
export async function createCartAction(formData: FormData): Promise<void> {
  const parsed = createCartSchema.safeParse({ listId: formData.get("listId"), idempotencyKey: formData.get("idempotencyKey") });
  if (!parsed.success) redirect("/carrinho/novo?erro=lista");
  const { listId, idempotencyKey } = parsed.data;
  // Vindo de "Pedir preço à papelaria do bairro" (lista publicada): segue direto para o pedido de cotação.
  const toQuote = formData.get("destino") === "cotacao";
  const user = await getCurrentUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(`/carrinho/novo?lista=${listId}${toQuote ? "&destino=cotacao" : ""}`)}`);
  const actor = await getSessionActor();
  const list = await getListReader(readServiceEnv()).getList(listId, { actor });
  if (!list || list.items.length === 0) redirect(`/carrinho/novo?lista=${listId}&erro=lista`);
  const client = await createClient();
  const { cartId, created } = await createCartOnce(client, {
    idempotencyKey,
    ownerId: user.id,
    listId,
    listKind: list.kind,
    isDemo: list.isDemo,
    // cart_items.list_item_id tem FK para list_items: só versão oficial aponta para item de lista; cópia do pai e demonstração não.
    items: list.items.map((i) => ({ listItemId: list.kind === "official" ? i.id : null, name: i.name, quantity: i.quantity })),
  });
  // Retrato inicial das opções (preço, origem e data) para consulta posterior.
  // Reenvio (toque duplo, duas abas): o carrinho é o do primeiro envio, que já faz o retrato; não repete.
  if (created) await snapshotCartOptions(client, cartId, user.id, readServiceEnv());
  redirect(toQuote ? `/cotacao/nova?carrinho=${cartId}` : `/carrinho/${cartId}`);
}
