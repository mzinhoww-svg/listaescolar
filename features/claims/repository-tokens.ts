import "server-only";

import { z } from "zod";

import { fail, mapError } from "./errors";
import type { ClaimTokenSender } from "./ports";
import type { ClaimsContext } from "./repository";
import { confirmInputSchema, type ConfirmInput } from "./schemas";
import { hashToken } from "./tokens";
import type { ConfirmResult } from "./types";
import type { SessionActor } from "@/features/auth/actor";

/**
 * Métodos de TOKEN extraídos de `repository.ts` (D-057, S18): emissão, confirmação e expiração. Mesmo contexto
 * compartilhado de `repository-evidence.ts`; comportamento idêntico ao arquivo original.
 */

const MAX_TOKEN_TRIES = 3;
const issueRows = z.array(
  z.object({ token_id: z.uuid(), expires_at: z.string(), channel: z.enum(["email", "whatsapp"]), destination: z.string().min(1) }),
);
const confirmResult = z.enum(["confirmed", "expired", "invalid", "locked", "already_confirmed"]);

/** O entregador pode depender da escola da reivindicação (demo); `null` = sem provedor. */
export type SenderSource = ClaimTokenSender | null | ((school: { isDemo: boolean }) => ClaimTokenSender | null);
/** `origin` só é calculada quando há entregador (função preguiçosa). */
export type IssueTokenArgs = { claimId: string; sender: SenderSource; origin: string | (() => string) };

export function createTokenMethods(ctx: ClaimsContext) {
  const { client, ownClaim, newEmailToken, newCode } = ctx;

  return {
    /**
     * Emite o token e o entrega ao contato REGISTRADO da escola (`destination` fica aqui e nunca é devolvido).
     * Sem entregador para o canal: nada é emitido. Falha na entrega: o token existe, mas o reivindicante só o
     * recebe pedindo outro (intervalo de 60 s do banco).
     */
    async issueToken(actor: SessionActor, a: IssueTokenArgs): Promise<{ channel: "email" | "whatsapp"; expiresAt: string; demo: boolean }> {
      ctx.assertActor(actor);
      const claim = await ownClaim(actor, a.claimId);
      if (claim.method === "documents") throw fail("invalid_state", "emitir token");
      const channel = claim.method === "institutional_email" ? "email" : "whatsapp";
      const sender = typeof a.sender === "function" ? a.sender({ isDemo: claim.schools.is_demo }) : a.sender;
      if (!sender?.channels[channel]) throw fail("delivery_unavailable", "emitir token");

      const origin = typeof a.origin === "function" ? a.origin() : a.origin;
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
        const context = { schoolName: claim.schools.name, inep: claim.schools.inep };
        try {
          if (channel === "email") {
            await sender.sendEmailLink(row.destination, `${origin}/escolas/${claim.schools.inep}/reivindicar/confirmar?token=${secret}`, context);
          } else {
            await sender.sendWhatsappCode(row.destination, secret, context);
          }
        } catch (e) {
          console.error("entrega de token de reivindicação", e instanceof Error ? e.name : "erro");
          throw fail("delivery_failed", "emitir token");
        }
        return { channel: row.channel, expiresAt: row.expires_at, demo: sender.demo === true };
      }
      throw fail("database", "emitir token");
    },

    /** Token errado, alheio, vencido ou bloqueado NUNCA levanta: devolve o resultado estável do banco. */
    async confirmToken(actor: SessionActor, input: ConfirmInput): Promise<ConfirmResult> {
      ctx.assertActor(actor);
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
      ctx.assertActor(actor);
      if (claimId === undefined) {
        ctx.assertAdmin(actor);
      } else if (actor.role !== "admin") {
        await ownClaim(actor, claimId);
      }
      const { data, error } = await client.rpc("claim_expire_tokens", { p_claim_id: claimId ?? null });
      if (error) throw mapError(error, "expirar tokens");
      return z.number().int().parse(data);
    },
  };
}
