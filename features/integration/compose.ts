import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createCompositeListReader, createDemoListReader } from "@/features/cart/memory-list-reader";
import type { DemoEnv } from "@/features/cart/demo-provider";
import type { ListReader } from "@/features/cart/ports";
import { createDemoLeadListContextReader } from "@/features/leads/demo-context-reader";
import type { LeadListContext, LeadListContextReader } from "@/features/leads/ports";

import type { ListPublisher, PublicationContextReader } from "../../supabase/functions/_shared/publication/ports";
import { SupabaseLeadListContextReader } from "./lead-context";
import { createRealListPublisher } from "./list-publisher";
import { SupabaseListReader } from "./list-reader";
import { createRealPublicationContextReader } from "./publication-context";

type Rpc = Pick<SupabaseClient, "rpc">;

/** As duas portas reais da publicação (service role, server-only). As portas em memória continuam SÓ para local/dev (composition.ts). */
export function createRealPublicationPorts(client: Rpc, opts: { now?: () => Date } = {}): { publisher: ListPublisher; context: PublicationContextReader } {
  return { publisher: createRealListPublisher(client), context: createRealPublicationContextReader(client, opts) };
}

/** Leitor de listas do carrinho: banco real primeiro; a demonstração só entra atrás da regra fail-closed da S12. */
export function composeListReader(client: Rpc, env: DemoEnv): ListReader {
  const demo = createDemoListReader(env);
  return createCompositeListReader([new SupabaseListReader(client), ...(demo ? [demo] : [])]);
}

/** Leitor de contexto do lead: banco real primeiro; demonstração atrás da mesma regra. */
export function composeLeadContextReader(client: Rpc, env: DemoEnv): LeadListContextReader {
  const real = new SupabaseLeadListContextReader(client);
  const demo = createDemoLeadListContextReader(env);
  return {
    async getContext(listId: string, options?: { actorId?: string | null }): Promise<LeadListContext | null> {
      return (await real.getContext(listId, options)) ?? (demo ? await demo.getContext(listId) : null);
    },
  };
}
