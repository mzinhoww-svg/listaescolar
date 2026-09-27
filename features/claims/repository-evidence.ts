import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { fail, mapError } from "./errors";
import { sanitizeFileName, sniffEvidence } from "./files";
import type { ClaimsContext } from "./repository";
import type { SessionActor } from "@/features/auth/actor";

/**
 * Métodos de EVIDÊNCIA extraídos de `repository.ts` (D-057, S18): upload, remoção e URL assinada. Recebem o
 * contexto compartilhado (`client`, `deps`, `assertActor`/`assertAdmin`/`ownClaim`) construído por
 * `createClaimsRepository`; comportamento idêntico ao arquivo original, só a posição do código mudou.
 */

const uuid = z.uuid();
const MAX_EVIDENCE_FILES = 5;
const SIGNED_URL_SECONDS = 60;

export type AddEvidenceArgs = { claimId: string; bytes: Uint8Array; declaredMime: string; originalName: string };

export function createEvidenceMethods(ctx: ClaimsContext) {
  const { client, deps, ownClaim } = ctx;

  return {
    /**
     * Um arquivo por chamada. Ordem: bytes -> dono, estado e contagem (antes de tocar no Storage) -> Storage ->
     * função do banco (que confere tudo de novo); o objeto sai se a função recusar.
     */
    async addEvidence(actor: SessionActor, a: AddEvidenceArgs): Promise<{ id: string }> {
      ctx.assertActor(actor);
      const sniff = sniffEvidence(a.bytes, a.declaredMime);
      if (!sniff.ok) throw fail(sniff.reason === "too_large" ? "file_too_large" : "invalid_file", "evidência");
      const claim = await ownClaim(actor, a.claimId);
      const accepts = (claim.status === "submitted" && claim.method === "documents") || claim.status === "insufficient_evidence";
      if (!accepts) throw fail("invalid_state", "evidência");
      const { count, error: countError } = await client.from("claim_evidence").select("id", { count: "exact", head: true }).eq("claim_id", claim.id);
      if (countError) throw mapError(countError, "evidência");
      if ((count ?? 0) >= MAX_EVIDENCE_FILES) throw fail("limit", "evidência");
      const path = `${claim.id}/${randomUUID()}.${sniff.ext}`;
      try {
        await deps.storage.put(path, a.bytes, sniff.mime);
      } catch {
        throw fail("storage", "evidência");
      }
      const { data, error } = await client.rpc("claim_add_evidence", {
        p_claim_id: claim.id,
        p_actor_id: actor.userId,
        p_storage_path: path,
        p_mime_type: sniff.mime,
        p_size_bytes: sniff.size,
        p_sha256: sniff.sha256,
        p_original_name: sanitizeFileName(a.originalName),
      });
      if (error) {
        await deps.storage.remove(path).catch(() => console.error("limpar objeto de evidência recusado"));
        throw mapError(error, "evidência");
      }
      return { id: uuid.parse(data) };
    },

    async removeEvidence(actor: SessionActor, evidenceId: string): Promise<void> {
      ctx.assertActor(actor);
      const { data, error } = await client.rpc("claim_remove_evidence", { p_evidence_id: uuid.parse(evidenceId), p_actor_id: actor.userId });
      if (error) throw mapError(error, "remover evidência");
      const path = z.string().parse(data);
      await deps.storage.remove(path).catch(() => console.error("remover objeto de evidência"));
    },

    /** URL assinada de 60 s da evidência (só admin). */
    async evidenceSignedUrl(actor: SessionActor, evidenceId: string): Promise<string> {
      ctx.assertAdmin(actor);
      const { data, error } = await client.from("claim_evidence").select("storage_path, original_name").eq("id", uuid.parse(evidenceId)).maybeSingle();
      if (error) throw mapError(error, "evidência");
      const path = z.object({ storage_path: z.string(), original_name: z.string() }).safeParse(data);
      if (!path.success) throw fail("not_found", "evidência");
      try {
        return await deps.storage.signedUrl(path.data.storage_path, SIGNED_URL_SECONDS, path.data.original_name);
      } catch {
        throw fail("storage", "evidência");
      }
    },
  };
}
