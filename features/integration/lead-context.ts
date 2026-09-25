import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { LeadListContext, LeadListContextReader } from "@/features/leads/ports";

import { callRpc, IntegrationReadError } from "./rpc";

const contextSchema = z
  .object({
    schoolName: z.string().min(1).max(200),
    gradeLabel: z.string().min(1).max(60),
    schoolYear: z.number().int().min(2000).max(2100),
    items: z.array(z.object({ name: z.string().min(1).max(500), quantity: z.number().int().positive() }).strict()).max(500),
    isDemo: z.boolean(),
    municipalityId: z.string().uuid(),
  })
  .strict()
  .nullable();

/**
 * Contexto público da lista para o lead, sobre `lead_list_context`. Oficial: escola, série (rótulo de `grades`), ano, itens e
 * município da escola. Cópia do pai: escola/série/ano do envio; sem escola devolve `null` ("cotação indisponível para esta lista").
 */
export class SupabaseLeadListContextReader implements LeadListContextReader {
  constructor(private readonly client: Pick<SupabaseClient, "rpc">) {}

  async getContext(listId: string, options: { actorId?: string | null } = {}): Promise<LeadListContext | null> {
    if (!z.string().uuid().safeParse(listId).success) return null;
    const parsed = contextSchema.safeParse(await callRpc(this.client, "lead_list_context", { p_list_id: listId, p_actor_id: options.actorId ?? null }));
    if (!parsed.success) throw new IntegrationReadError("invalid_response");
    return parsed.data;
  }
}
