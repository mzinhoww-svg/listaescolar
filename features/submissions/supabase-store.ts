import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { OCR_JOB_KIND, UPLOAD_BUCKET } from "./constants";
import type { NewSubmission, SubmissionStore } from "./ports";
import type { ExtractionResult } from "./schemas";
import { rpcOf } from "./supabase-queue";

/**
 * Store sobre o cliente com a chave secreta (server-only): grava consentimento, arquivo e envio de uma vez
 * e desfaz tudo se uma etapa falhar. O consentimento já foi exigido em `submitList`; o banco exige de novo.
 */
export function createSupabaseStore(client: SupabaseClient): SubmissionStore {
  return {
    async createSubmission(input: NewSubmission) {
      const submissionId = crypto.randomUUID();
      const path = `${input.profileId}/${submissionId}/${input.fileName}`;
      let consentId: string | null = null;
      let uploaded = false;
      try {
        const consent = await client
          .from("consents")
          .insert({
            profile_id: input.profileId,
            purpose: input.consent.purpose,
            text_version: input.consent.textVersion,
          })
          .select("id")
          .single();
        if (consent.error) throw new Error("consent");
        consentId = consent.data.id as string;

        const up = await client.storage
          .from(UPLOAD_BUCKET)
          .upload(path, input.bytes, { contentType: input.mime, upsert: false });
        if (up.error) throw new Error("upload");
        uploaded = true;

        const row = await client.from("list_submissions").insert({
          id: submissionId,
          submitted_by: input.profileId,
          source: input.source,
          school_id: input.schoolId ?? null,
          grade: input.grade,
          school_year: input.schoolYear,
          storage_path: path,
          file_name: input.fileName,
          mime_type: input.mime,
          size_bytes: input.sizeBytes,
          consent_id: consentId,
          is_demo: input.isDemo, // status nasce `submitted` (trigger list_submissions_check_insert)
        });
        if (row.error) throw new Error("insert");
        const moved = await client.from("list_submissions").update({ status: "processing" }).eq("id", submissionId);
        if (moved.error) throw new Error("update");
        // O job nasce com o envio: `running` com lease, chave = id do envio. Se o processo morrer daqui em diante,
        // jobs_requeue_stale o recoloca na fila depois da lease (nenhum envio fica preso em `processing`).
        const job = await client.from("jobs").insert({
          kind: OCR_JOB_KIND,
          payload: { submission_id: submissionId },
          status: "running",
          attempts: 1,
          locked_at: new Date().toISOString(),
          idempotency_key: submissionId,
          submission_id: submissionId,
        });
        if (job.error) throw new Error("job");
        return { submissionId };
      } catch (e) {
        await client.from("list_submissions").delete().eq("id", submissionId); // o job cai junto (cascade)
        if (uploaded) await client.storage.from(UPLOAD_BUCKET).remove([path]);
        if (consentId) await client.from("consents").delete().eq("id", consentId);
        throw e;
      }
    },

    async reject(submissionId, reason) {
      const { error } = await rpcOf(client)("submissions_reject", { p_submission_id: submissionId, p_error: reason });
      if (error) throw new Error("reject");
    },

    /** Uma única função SQL (transação): job succeeded + ocr_jobs + envio review_needed. */
    async recordSyncResult(submissionId: string, result: ExtractionResult, durationMs: number) {
      const { data, error } = await rpcOf(client)("submissions_record_sync_result", {
        p_submission_id: submissionId,
        p_result: result,
        p_duration_ms: Math.round(durationMs),
      });
      if (error || data !== true) throw new Error("recordSyncResult");
    },
  };
}
