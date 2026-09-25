"use server";

import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/features/auth/queries";
import { chooseOptionSchema } from "@/features/cart/schemas";
import { chooseCartStrategy, readServiceEnv } from "@/features/cart/service";
import { createClient } from "@/lib/supabase/server";

/** "Escolher esta": grava a estratégia e o retrato das opções e segue para o checkout por loja. */
export async function chooseOptionAction(formData: FormData): Promise<void> {
  const parsed = chooseOptionSchema.safeParse({
    cartId: formData.get("cartId"),
    strategy: formData.get("strategy"),
  });
  if (!parsed.success) notFound();
  const { cartId, strategy } = parsed.data;
  const user = await getCurrentUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(`/carrinho/${cartId}`)}`);
  const client = await createClient();
  const result = await chooseCartStrategy(client, cartId, user.id, strategy, readServiceEnv());
  if (result === "not_found") notFound();
  if (result === "unavailable") redirect(`/carrinho/${cartId}?opcao=${strategy}`);
  redirect(`/carrinho/${cartId}/checkout?opcao=${strategy}`);
}
