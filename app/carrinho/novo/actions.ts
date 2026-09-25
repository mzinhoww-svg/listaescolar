"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/features/auth/queries";
import { createCart } from "@/features/cart/repository";
import { createCartSchema } from "@/features/cart/schemas";
import { getListReader, readServiceEnv } from "@/features/cart/service";
import { createClient } from "@/lib/supabase/server";

/** Cria o carrinho relendo a lista no servidor (nada de itens vindos do formulário). */
export async function createCartAction(formData: FormData): Promise<void> {
  const parsed = createCartSchema.safeParse({ listId: formData.get("listId") });
  if (!parsed.success) redirect("/carrinho/novo?erro=lista");
  const { listId } = parsed.data;
  const user = await getCurrentUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(`/carrinho/novo?lista=${listId}`)}`);
  const reader = getListReader(readServiceEnv());
  const items = reader ? await reader.getItems(listId) : null;
  if (!items || items.length === 0) redirect("/carrinho/novo?erro=lista");
  const client = await createClient();
  const cartId = await createCart(client, {
    ownerId: user.id,
    listId,
    // Leitor de demonstração: o carrinho nasce marcado como demonstração.
    isDemo: true,
    items: items.map((i) => ({ listItemId: i.id, name: i.name, quantity: i.quantity })),
  });
  redirect(`/carrinho/${cartId}`);
}
