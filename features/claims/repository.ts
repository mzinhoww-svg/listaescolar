import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { isSessionActor, type SessionActor } from "@/features/auth/actor";

import { ClaimRepositoryError, fail, mapError } from "./errors";
import type { EvidenceStorage } from "./ports";
import { createEvidenceMethods } from "./repository-evidence";
import { createTokenMethods } from "./repository-tokens";
import { PRIVACY_TEXT_VERSION, decisionInputSchema, type DecisionInput } from "./schemas";
import { CLAIM_METHODS, type ClaimMethod, type ClaimStatus } from "./state";
import { generateEmailToken, generateWhatsappCode } from "./tokens";

/**
 * Repositório de ESCRITA das reivindicações (service role, injetável). Toda operação recebe um `SessionActor`
 * (marca de `getSessionActor`) e o `p_actor_id` vem sempre dele; nunca um id cru. O banco confere de novo
 * (papel e dono) nas funções SECURITY DEFINER. Erros: ver `errors.ts`.
 *
 * D-057 (S18): os métodos de evidência e de token foram extraídos para `repository-evidence.ts` e
 * `repository-tokens.ts` (arquivos-irmãos), que recebem o `ClaimsContext` construído aqui e devolvem os métodos
 * já ligados ao `client`/`deps` desta chamada — comportamento runtime idêntico ao arquivo único anterior, só a
 * posição do código mudou. Este arquivo continua sendo o único ponto de import (`./repository`).
 */
export { ClaimRepositoryError };

const uuid = z.uuid();
const claimRow = z.object({
  id: z.uuid(),
  claimant_id: z.uuid(),
  method: z.enum(CLAIM_METHODS),
  status: z.string(),
  schools: z.object({ inep: z.string(), name: z.string(), is_demo: z.boolean() }),
});

export type CreateClaimArgs = {
  schoolId: string;
  method: ClaimMethod;
  claimantName: string;
  claimantRoleTitle: string;
  evidenceNote?: string | undefined;
};
export type ClaimsDeps = {
  storage: EvidenceStorage;
  /** Só para teste: forçar colisão de hash. */
  generateEmailToken?: () => string;
  generateWhatsappCode?: () => string;
};

/** Contexto compartilhado entre este arquivo e `repository-evidence.ts`/`repository-tokens.ts`. */
export type ClaimsContext = {
  client: SupabaseClient;
  deps: ClaimsDeps;
  assertActor: (actor: unknown) => asserts actor is SessionActor;
  assertAdmin: (actor: unknown) => asserts actor is SessionActor;
  ownClaim: (actor: SessionActor, claimId: string) => Promise<z.infer<typeof claimRow>>;
  newEmailToken: () => string;
  newCode: () => string;
};

export function createClaimsRepository(client: SupabaseClient, deps: ClaimsDeps) {
  const newEmailToken = deps.generateEmailToken ?? generateEmailToken;
  const newCode = deps.generateWhatsappCode ?? generateWhatsappCode;

  function assertActor(actor: unknown): asserts actor is SessionActor {
    if (!isSessionActor(actor)) throw fail("forbidden", "ator");
  }
  function assertAdmin(actor: unknown): asserts actor is SessionActor {
    assertActor(actor);
    if (actor.role !== "admin") throw fail("forbidden", "papel");
  }

  /** Reivindicação do próprio ator (service role lê; não é dono = não encontrada, sem revelar existência). */
  async function ownClaim(actor: SessionActor, claimId: string) {
    const { data, error } = await client
      .from("claims")
      .select("id, claimant_id, method, status, schools!inner(inep, name, is_demo)")
      .eq("id", uuid.parse(claimId))
      .maybeSingle();
    if (error) throw mapError(error, "reivindicação");
    const parsed = claimRow.safeParse(data);
    if (!parsed.success || parsed.data.claimant_id !== actor.userId) throw fail("not_found", "reivindicação");
    return parsed.data;
  }

  const ctx: ClaimsContext = { client, deps, assertActor, assertAdmin, ownClaim, newEmailToken, newCode };

  const repo = {
    async createClaim(actor: SessionActor, a: CreateClaimArgs): Promise<string> {
      assertActor(actor);
      if (actor.role !== "parent" && actor.role !== "school_member") throw fail("forbidden", "papel");
      const { data, error } = await client.rpc("claim_create", {
        p_school_id: a.schoolId,
        p_claimant_id: actor.userId,
        p_method: a.method,
        p_claimant_name: a.claimantName,
        p_claimant_role_title: a.claimantRoleTitle,
        p_evidence_note: a.evidenceNote ?? null,
        p_privacy_text_version: PRIVACY_TEXT_VERSION,
      });
      if (error) throw mapError(error, "criar reivindicação");
      return uuid.parse(data);
    },

    ...createEvidenceMethods(ctx),
    ...createTokenMethods(ctx),

    async submitForReview(actor: SessionActor, a: { claimId: string; evidenceNote?: string | undefined }): Promise<void> {
      assertActor(actor);
      const { error } = await client.rpc("claim_submit_for_review", {
        p_claim_id: uuid.parse(a.claimId),
        p_actor_id: actor.userId,
        p_evidence_note: a.evidenceNote ?? null,
      });
      if (error) throw mapError(error, "enviar para análise");
    },

    /** Decisão humana. TS confere `role === 'admin'`; a função SQL confere `profiles.role` do ator de novo. */
    async decide(actor: SessionActor, input: DecisionInput): Promise<ClaimStatus> {
      assertAdmin(actor);
      const parsed = decisionInputSchema.safeParse(input);
      if (!parsed.success) throw fail("invalid_argument", "decidir");
      const { data, error } = await client.rpc("claim_decide", {
        p_claim_id: parsed.data.claimId,
        p_to: parsed.data.to,
        p_actor_id: actor.userId,
        p_reason: parsed.data.reason ?? null,
      });
      if (error) throw mapError(error, "decidir");
      return z.enum(["approved", "insufficient_evidence", "rejected"]).parse(data);
    },
  };
  return repo;
}

export type ClaimsRepository = ReturnType<typeof createClaimsRepository>;
export type { AddEvidenceArgs } from "./repository-evidence";
export type { IssueTokenArgs, SenderSource } from "./repository-tokens";
