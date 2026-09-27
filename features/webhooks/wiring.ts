import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";

import * as repo from "./repository";
import { WebhookService, type WebhookRepository } from "./service";

// Composição real do serviço (mesmo padrão de `features/b2b/wiring.ts`).

function realRepository(): WebhookRepository {
  const client = createAdminClient();
  return {
    listMyEndpoints: (actor) => repo.listMyEndpoints(client, actor),
    createEndpoint: (actor, input) => repo.createEndpoint(client, actor, input),
    updateEndpoint: (actor, endpointId, input) => repo.updateEndpoint(client, actor, endpointId, input),
    rotateSecret: (actor, endpointId, secret) => repo.rotateSecret(client, actor, endpointId, secret),
    revealSecret: (actor, endpointId) => repo.revealSecret(client, actor, endpointId),
    listMyDeliveries: (actor, limit) => repo.listMyDeliveries(client, actor, limit),
    resendDelivery: (actor, deliveryId) => repo.resendDelivery(client, actor, deliveryId),
  };
}

export function getWebhookService(): WebhookService {
  return new WebhookService({
    repo: realRepository(),
    encryptionKey: () => {
      try {
        return getServerEnv().B2B_WEBHOOK_ENCRYPTION_KEY;
      } catch (error) {
        // Mesmo motivo de `features/b2b/wiring.ts::getB2bService`: `getServerEnv()` valida todo o
        // `serverSchema`, não só esta chave; sem log, "indisponível" não dá pista nenhuma.
        console.error("webhook encryption key/env", error instanceof Error ? error.name : "erro");
        return undefined;
      }
    },
  });
}
