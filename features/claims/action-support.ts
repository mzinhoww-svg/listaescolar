import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteOrigin } from "@/lib/site-url";

import { createSupabaseEvidenceStorage } from "./evidence-storage";
import { createClaimsRepository, type ClaimsRepository } from "./repository";
import { getClaimTokenSender } from "./senders";

/** Repositório de serviço para as Server Actions. Só chamar DEPOIS de validar sessão, papel e entrada. */
export function serviceClaimsRepository(): ClaimsRepository {
  const client = createAdminClient();
  return createClaimsRepository(client, { storage: createSupabaseEvidenceStorage(client) });
}

/** Entregador do ambiente para a escola da reivindicação (`null` fora da demonstração local). */
export const envSenderFor = (school: { isDemo: boolean }) =>
  getClaimTokenSender(
    { DEMO_CLAIM_DELIVERY: process.env.DEMO_CLAIM_DELIVERY, APP_ENV: process.env.APP_ENV, VERCEL_ENV: process.env.VERCEL_ENV },
    school,
  );

/** Origem canônica para o link de confirmação; nunca deriva de cabeçalho da requisição. */
export function linkOrigin(): string {
  return getSiteOrigin();
}

export const loginPath = (inep: string): string => `/entrar?next=${encodeURIComponent(`/escolas/${inep}/reivindicar`)}`;
