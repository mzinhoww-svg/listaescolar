import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { isSessionActor, type SessionActor } from "@/features/auth/actor";

import type { ClaimErrorCode } from "./messages";
import type { ClaimTokenSender, EvidenceStorage } from "./ports";
import { PRIVACY_TEXT_VERSION, confirmInputSchema, decisionInputSchema, type ConfirmInput, type DecisionInput } from "./schemas";
import { sanitizeFileName, sniffEvidence } from "./files";
import { CLAIM_METHODS, type ClaimMethod, type ClaimStatus } from "./state";
import { generateEmailToken, generateWhatsappCode, hashToken } from "./tokens";
import type { ConfirmResult } from "./types";

/**
 * Repositório de ESCRITA das reivindicações (service role, injetável). Toda operação recebe um `SessionActor`
 * (marca de `getSessionActor`) e o `p_actor_id` vem sempre dele; nunca um id cru. O banco confere de novo
 * (papel e dono) nas funções SECURITY DEFINER. Erros do banco viram `ClaimRepositoryError` com código fixo:
 * a mensagem do Postgres nunca sobe para a tela.
 */
export class ClaimRepositoryError extends Error {
  constructor(
    readonly code: ClaimErrorCode,
    message: string,
    readonly pgCode?: string,
  ) {
    super(message);
    this.name = "ClaimRepositoryError";
  }
}

const fail = (code: ClaimErrorCode, what: string, pg?: string): ClaimRepositoryError =>
  new ClaimRepositoryError(code, `${what}: ${code}`, pg);

type PgError = { code?: string; message: string };

/** errcode + texto estável da função -> código fixo. O texto só classifica; nunca é exibido. */
function mapError(e: PgError, what: string): ClaimRepositoryError {
  switch (e.code) {
    case "P0002":
      return fail("not_found", what, e.code);
    case "42501":
      return fail("forbidden", what, e.code);
    case "22023":
      return fail("invalid_argument", what, e.code);
    case "23514":
      if (/escola (suspensa|verificada)|município não habilitado|escola .* não aceita/.test(e.message)) return fail("school_closed", what, e.code);
      if (/^aguarde/.test(e.message)) return fail("wait", what, e.code);
      if (/^limite de/.test(e.message)) return fail("limit", what, e.code);
      return fail("invalid_state", what, e.code);
    default:
      return fail("database", what, e.code);
  }
}

const uuid = z.uuid();
const issueRows = z.array(
  z.object({ token_id: z.uuid(), expires_at: z.string(), channel: z.enum(["email", "whatsapp"]), destination: z.string().min(1) }),
);
const confirmResult = z.enum(["confirmed", "expired", "invalid", "locked", "already_confirmed"]);
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
export type AddEvidenceArgs = { claimId: string; bytes: Uint8Array; declaredMime: string; originalName: string };
/** O entregador pode depender da escola da reivindicação (demo); `null` = sem provedor. */
export type SenderSource = ClaimTokenSender | null | ((school: { isDemo: boolean }) => ClaimTokenSender | null);
export type IssueTokenArgs = { claimId: string; sender: SenderSource; origin: string };
export type ClaimsDeps = {
  storage: EvidenceStorage;
  /** Só para teste: forçar colisão de hash. */
  generateEmailToken?: () => string;
  generateWhatsappCode?: () => string;
};

const MAX_TOKEN_TRIES = 3;
const SIGNED_URL_SECONDS = 60;

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

    /** Um arquivo por chamada: bytes conferidos ANTES do Storage; o objeto sai se a função recusar. */
    async addEvidence(actor: SessionActor, a: AddEvidenceArgs): Promise<{ id: string }> {
      assertActor(actor);
      const sniff = sniffEvidence(a.bytes, a.declaredMime);
      if (!sniff.ok) throw fail(sniff.reason === "too_large" ? "file_too_large" : "invalid_file", "evidência");
      const path = `${uuid.parse(a.claimId)}/${randomUUID()}.${sniff.ext}`;
      try {
        await deps.storage.put(path, a.bytes, sniff.mime);
      } catch {
        throw fail("storage", "evidência");
      }
      const { data, error } = await client.rpc("claim_add_evidence", {
        p_claim_id: a.claimId,
        p_actor_id: actor.userId,
        p_storage_path: path,
        p_mime_type: sniff.mime,
        p_size_bytes: sniff.size,
        p_sha256: sniff.sha256,
        p_original_name: sanitizeFileName(a.originalName),
      });
      if (error) {
        await deps.storage.remove(path).catch(() => undefined);
        throw mapError(error, "evidência");
      }
      return { id: uuid.parse(data) };
    },

    async removeEvidence(actor: SessionActor, evidenceId: string): Promise<void> {
      assertActor(actor);
      const { data, error } = await client.rpc("claim_remove_evidence", { p_evidence_id: uuid.parse(evidenceId), p_actor_id: actor.userId });
      if (error) throw mapError(error, "remover evidência");
      const path = z.string().parse(data);
      await deps.storage.remove(path).catch((e: unknown) => console.error("remover objeto de evidência", e));
    },

    async submitForReview(actor: SessionActor, a: { claimId: string; evidenceNote?: string | undefined }): Promise<void> {
      assertActor(actor);
      const { error } = await client.rpc("claim_submit_for_review", {
        p_claim_id: uuid.parse(a.claimId),
        p_actor_id: actor.userId,
        p_evidence_note: a.evidenceNote ?? null,
      });
      if (error) throw mapError(error, "enviar para análise");
    },

    /**
     * Emite o token e o entrega ao contato REGISTRADO da escola (`destination` fica aqui e nunca é devolvido).
     * Sem entregador para o canal: nada é emitido. Falha na entrega: o token existe, mas o reivindicante só o
     * recebe pedindo outro (intervalo de 60 s do banco).
     */
    async issueToken(actor: SessionActor, a: IssueTokenArgs): Promise<{ channel: "email" | "whatsapp"; expiresAt: string }> {
      assertActor(actor);
      const claim = await ownClaim(actor, a.claimId);
      if (claim.method === "documents") throw fail("invalid_state", "emitir token");
      const channel = claim.method === "institutional_email" ? "email" : "whatsapp";
      const sender = typeof a.sender === "function" ? a.sender({ isDemo: claim.schools.is_demo }) : a.sender;
      if (!sender?.channels[channel]) throw fail("delivery_unavailable", "emitir token");

      for (let attempt = 1; attempt <= MAX_TOKEN_TRIES; attempt++) {
        const secret = channel === "email" ? newEmailToken() : newCode();
        const hash = hashToken(channel === "email" ? { channel, token: secret } : { channel, claimId: claim.id, code: secret });
        const { data, error } = await client.rpc("claim_issue_token", { p_claim_id: claim.id, p_actor_id: actor.userId, p_token_hash: hash });
        if (error) {
          // hash repetido (mesmo código reemitido ou colisão): tenta com outro segredo
          if (error.code === "23505" && attempt < MAX_TOKEN_TRIES) continue;
          throw mapError(error, "emitir token");
        }
        const row = issueRows.parse(data)[0];
        if (!row) throw fail("database", "emitir token");
        const ctx = { schoolName: claim.schools.name, inep: claim.schools.inep };
        try {
          if (channel === "email") {
            await sender.sendEmailLink(row.destination, `${a.origin}/escolas/${claim.schools.inep}/reivindicar/confirmar?token=${secret}`, ctx);
          } else {
            await sender.sendWhatsappCode(row.destination, secret, ctx);
          }
        } catch (e) {
          console.error("entrega de token de reivindicação", e instanceof Error ? e.name : "erro");
          throw fail("delivery_failed", "emitir token");
        }
        return { channel: row.channel, expiresAt: row.expires_at };
      }
      throw fail("database", "emitir token");
    },

    /** Token errado, alheio, vencido ou bloqueado NUNCA levanta: devolve o resultado estável do banco. */
    async confirmToken(actor: SessionActor, input: ConfirmInput): Promise<ConfirmResult> {
      assertActor(actor);
      const parsed = confirmInputSchema.safeParse(input);
      if (!parsed.success) throw fail("invalid_argument", "confirmar token");
      const v = parsed.data;
      const { data, error } = await client.rpc("claim_confirm_token", {
        p_token_hash: hashToken(v.channel === "email" ? v : { channel: "whatsapp", claimId: v.claimId, code: v.code }),
        p_actor_id: actor.userId,
        p_claim_id: v.channel === "whatsapp" ? v.claimId : null,
      });
      if (error) throw mapError(error, "confirmar token");
      return confirmResult.parse(data);
    },

    /** Expiração preguiçosa. Com `claimId`: só a própria (ou admin); sem: varredura, só admin. */
    async expireTokens(actor: SessionActor, claimId?: string): Promise<number> {
      assertActor(actor);
      if (claimId === undefined) {
        assertAdmin(actor);
      } else if (actor.role !== "admin") {
        await ownClaim(actor, claimId);
      }
      const { data, error } = await client.rpc("claim_expire_tokens", { p_claim_id: claimId ?? null });
      if (error) throw mapError(error, "expirar tokens");
      return z.number().int().parse(data);
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

    /** URL assinada de 60 s da evidência (só admin). */
    async evidenceSignedUrl(actor: SessionActor, evidenceId: string): Promise<string> {
      assertAdmin(actor);
      const { data, error } = await client.from("claim_evidence").select("storage_path").eq("id", uuid.parse(evidenceId)).maybeSingle();
      if (error) throw mapError(error, "evidência");
      const path = z.object({ storage_path: z.string() }).safeParse(data);
      if (!path.success) throw fail("not_found", "evidência");
      try {
        return await deps.storage.signedUrl(path.data.storage_path, SIGNED_URL_SECONDS);
      } catch {
        throw fail("storage", "evidência");
      }
    },
  };
  return repo;
}

export type ClaimsRepository = ReturnType<typeof createClaimsRepository>;
