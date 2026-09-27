import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";

import { generateApiKey } from "./keys/format";
import { hashSecret } from "./keys/hash";
import * as repo from "./repository";
import { B2bService, type B2bRepository } from "./service";

// Composição real do serviço (Ruling S24 · Task 2: arquivo extra fora da lista nominal do brief, mesmo padrão de
// `features/leads/wiring.ts`). Cada Server Action chama `getB2bService()` e nunca importa `repository.ts` direto.

function realRepository(): B2bRepository {
  const client = createAdminClient();
  return {
    applyPartner: (actor, payload, termsVersion) => repo.applyPartner(client, actor, payload, termsVersion),
    myPartnerId: (actor) => repo.myPartnerId(client, actor),
    getMyPartner: (actor) => repo.getMyPartner(client, actor),
    getKeyEnvironment: (keyId) => repo.getKeyEnvironment(client, keyId),
    createKey: (actor, partnerId, input) => repo.createKey(client, actor, partnerId, input),
    rotateKey: (actor, input) => repo.rotateKey(client, actor, input),
    revokeKey: (actor, keyId, reason) => repo.revokeKey(client, actor, keyId, reason),
    listPartners: (actor, filter) => repo.listPartners(client, actor, filter),
    getPartner: (actor, partnerId) => repo.getPartner(client, actor, partnerId),
    decide: (actor, partnerId, input) => repo.decide(client, actor, partnerId, input),
    adminRevokeKey: (actor, keyId, reason) => repo.adminRevokeKey(client, actor, keyId, reason),
    partnerHeader: (partnerId) => repo.partnerHeader(client, partnerId),
    listPartnerEvents: (partnerId) => repo.listPartnerEvents(client, partnerId),
  };
}

export function getB2bService(): B2bService {
  return new B2bService({
    repo: realRepository(),
    generateKey: generateApiKey,
    hashSecret,
    pepper: () => {
      try {
        return getServerEnv().B2B_API_KEY_PEPPER;
      } catch (error) {
        // Mesmo motivo de `features/b2b/api/handler.ts::realPepper`: `getServerEnv()` valida todo o
        // `serverSchema`, não só o pepper; sem log, "emissão indisponível" no portal não dá pista nenhuma.
        console.error("b2b pepper/env", error instanceof Error ? error.name : "erro");
        return undefined;
      }
    },
    now: () => new Date(),
  });
}
