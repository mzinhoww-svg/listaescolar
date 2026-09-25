import "server-only";

import { notFound } from "next/navigation";
import { z } from "zod";

import { requireAccess } from "@/features/auth/guard";
import { createClient } from "@/lib/supabase/server";

import { CART_STRATEGIES, type CartOption, type CartStrategy } from "./types";
import { loadCartView, readServiceEnv, type CartView } from "./service";

/** Login e papel pelo guard compartilhado; id inválido, carrinho inexistente ou alheio → 404 (sem distinguir). */
export async function requireCartView(cartId: string, nextPath: string): Promise<CartView> {
  const { user } = await requireAccess(nextPath);
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

const usable = (o: CartOption): boolean => o.status !== "unavailable" && o.totalCents !== null;

/**
 * Opção pedida na URL (mesmo indisponível: a tela diz isso); sem pedido, a estratégia gravada no
 * carrinho se ainda tiver preço; senão a primeira utilizável (ordem das estratégias), senão a primeira.
 */
export function chooseOption(
  options: CartOption[],
  wanted: CartStrategy | null,
  persisted: CartStrategy | null = null,
): CartOption {
  const byWanted = wanted ? options.find((o) => o.strategy === wanted) : undefined;
  const byPersisted = persisted
    ? options.find((o) => o.strategy === persisted && usable(o))
    : undefined;
  return byWanted ?? byPersisted ?? options.find(usable) ?? options[0]!;
}
