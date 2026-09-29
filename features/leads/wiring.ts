import "server-only";

import { getCart } from "@/features/cart/repository";
import { readServiceEnv } from "@/features/cart/service";
import { emitServer } from "@/lib/analytics/server";
import { getSiteOrigin } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";

import { composeLeadContextReader } from "@/features/integration/compose";
import { KickLeadNotifier } from "./notifier";
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

/** Leitor de contexto da lista: banco real (oficial e cópia do próprio pai) e, atrás da regra fail-closed da S12, a demonstração. */
export function createContextReader(): LeadListContextReader {
  return composeLeadContextReader(createAdminClient(), readServiceEnv());
}

/** Origem da cobrança do lead (livro-razão da S21): só o tipo de lançamento, nunca valor nem saldo. */
async function readBillingSource(leadId: string): Promise<"free_lead" | "pass_lead" | "lead_debit" | null> {
  const { data } = await createAdminClient()
    .from("credit_ledger")
    .select("entry_type")
    .eq("lead_id", leadId)
    .in("entry_type", ["free_lead", "pass_lead", "lead_debit"])
    .limit(1)
    .maybeSingle();
  const t = data?.entry_type;
  return t === "free_lead" || t === "pass_lead" || t === "lead_debit" ? t : null;
}

/** Composição do serviço de leads (leitor de contexto real desde a S11). */
export function getLeadService(): LeadService {
  return new LeadService({
    store: createLeadStore(createAdminClient()),
    carts: createCartReader(),
    contexts: createContextReader(),
    notifier: new KickLeadNotifier(),
    now: () => new Date(),
    siteOrigin: () => getSiteOrigin(),
    analytics: { emit: emitServer, billingSource: readBillingSource },
  });
}
