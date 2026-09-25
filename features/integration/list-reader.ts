import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { isSessionActor } from "@/features/auth/actor";
import type { ListItem, ListReadOptions, ListReader, ListSnapshot } from "@/features/cart/ports";

import { callRpc, IntegrationReadError } from "./rpc";

const snapshotSchema = z
  .object({
    kind: z.enum(["official", "parent_copy"]),
    isDemo: z.boolean(),
    items: z.array(z.object({ id: z.string().min(1).max(80), name: z.string().min(1).max(500), quantity: z.number().int().positive() }).strict()).max(500),
  })
  .strict()
  .nullable();

/**
 * Leitor de listas do carrinho sobre `list_reader_get`: versão oficial publicada/superseded (pública) ou cópia do PRÓPRIO pai.
 * Alheia, inexistente e sem ator devolvem o mesmo `null`. Demonstração nunca sai do banco (leitor à parte, atrás da flag).
 */
export class SupabaseListReader implements ListReader {
  constructor(private readonly client: Pick<SupabaseClient, "rpc">) {}

  async getList(listId: string, options: ListReadOptions = {}): Promise<ListSnapshot | null> {
    if (!z.string().uuid().safeParse(listId).success) return null;
    const actor = options.actor ?? null;
    if (actor !== null && !isSessionActor(actor)) return null; // objeto forjado: recusa (mesma resposta de inexistente)
    const parsed = snapshotSchema.safeParse(await callRpc(this.client, "list_reader_get", { p_list_id: listId, p_actor_id: actor?.userId ?? null }, options.signal));
    if (!parsed.success) throw new IntegrationReadError("invalid_response");
    return parsed.data;
  }

  async getItems(listId: string, options: ListReadOptions = {}): Promise<ListItem[] | null> {
    return (await this.getList(listId, options))?.items ?? null;
  }
}
