import "server-only";

import { getCart } from "@/features/cart/repository";
import { readServiceEnv } from "@/features/cart/service";
import { getSiteOrigin } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";

import { createDemoLeadListContextReader } from "./demo-context-reader";
import { NoopLeadNotifier } from "./notifier";
import type { LeadCartReader, LeadListContextReader } from "./ports";
import { createLeadStore } from "./repository";
import { LeadService } from "./service";

/** Carrinho do próprio solicitante (service_role só no servidor; dono conferido; alheio e inexistente = `null`). */
export function createCartReader(): LeadCartReader {
  return {
    async getOwnedCart(actor, cartId) {
      const cart = await getCart(createAdminClient(), cartId);
      if (!cart || cart.ownerId !== actor.userId) return null;
      return {
        id: cart.id,
        ownerId: cart.ownerId,
        listId: cart.listId,
        isDemo: cart.isDemo,
        items: cart.items.map((i) => ({ name: i.name, itemKey: i.itemKey, quantity: i.quantity })),
      };
    },
  };
}

/** Leitor de contexto da lista (só demonstração até a S11). `null` com a flag desligada: nada de lista inventada. */
export function createContextReader(): LeadListContextReader | null {
  return createDemoLeadListContextReader(readServiceEnv());
}

/** Composição do serviço de leads. O leitor de contexto real (listas) é da S11; hoje só o de demonstração. */
export function getLeadService(): LeadService {
  return new LeadService({
    store: createLeadStore(createAdminClient()),
    carts: createCartReader(),
    contexts: createContextReader(),
    notifier: new NoopLeadNotifier(),
    now: () => new Date(),
    siteOrigin: () => getSiteOrigin(),
  });
}
