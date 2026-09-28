import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SessionActor } from "@/features/auth/actor";

import { fail, requireActor } from "./repository-shared";

// D-158 (S19): extraído de repository.ts — ver nota em repository-shared.ts.
// ---------------------------------------------------------------------------
// Cadastro (B2B00)
// ---------------------------------------------------------------------------

export type ApplyPartnerPayload = {
  tradeName: string;
  legalName: string;
  cnpj: string; // já validado (DV) e normalizado (14 posições [0-9A-Z]) pelo serviço
  contactName: string;
  partnerType: "retailer" | "brand" | "edtech";
  coverageUfs: readonly string[] | null;
};

export async function applyPartner(client: SupabaseClient, actor: SessionActor, payload: ApplyPartnerPayload, termsVersion: string): Promise<{ partnerId: string }> {
  requireActor(actor);
  const { data, error } = await client.rpc("b2b_partner_apply", {
    p_actor_id: actor.userId,
    p_payload: {
      trade_name: payload.tradeName,
      legal_name: payload.legalName,
      cnpj: payload.cnpj,
      contact_name: payload.contactName,
      partner_type: payload.partnerType,
      coverage_ufs: payload.coverageUfs,
    },
    p_terms_version: termsVersion,
  });
  if (error) fail("cadastrar parceiro", error);
  return { partnerId: z.uuid().parse(data) };
}
