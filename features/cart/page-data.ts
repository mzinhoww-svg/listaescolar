import "server-only";

import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentUser } from "@/features/auth/queries";
import { createClient } from "@/lib/supabase/server";

import { CART_STRATEGIES, type CartOption, type CartStrategy } from "./types";
import { loadCartView, readServiceEnv, type CartView } from "./service";

export async function requireUserOrLogin(nextPath: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(nextPath)}`);
  return user;
}

/** Login obrigatório; id inválido, carrinho inexistente ou alheio → 404 (sem distinguir). */
export async function requireCartView(cartId: string, nextPath: string): Promise<CartView> {
  const user = await requireUserOrLogin(nextPath);
  if (!z.uuid().safeParse(cartId).success) notFound();
  const client = await createClient();
  const view = await loadCartView(client, cartId, user.id, readServiceEnv());
  if (!view) notFound();
  return view;
}

export function parseStrategy(value: string | string[] | undefined): CartStrategy | null {
  const v = Array.isArray(value) ? value[0] : value;
  return CART_STRATEGIES.find((s) => s === v) ?? null;
}

/** Opção pedida; sem pedido, a primeira utilizável (ordem das estratégias), senão a primeira. */
export function chooseOption(options: CartOption[], wanted: CartStrategy | null): CartOption {
  const byWanted = wanted ? options.find((o) => o.strategy === wanted) : undefined;
  return (
    byWanted ??
    options.find((o) => o.status !== "unavailable" && o.totalCents !== null) ??
    options[0]!
  );
}
