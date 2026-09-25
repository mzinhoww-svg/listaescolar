import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { UPLOAD_BUCKET } from "./constants";
import type { NewSubmission, SubmissionStore } from "./ports";
import type { ExtractionResult } from "./schemas";
import { SubmissionError } from "./service";
import { rpcOf } from "./supabase-queue";

/**
 * Store sobre o cliente com a chave secreta (server-only): sobe o arquivo e cria consentimento, envio e job pela
 * função SQL `submissions_create` (uma transação). O consentimento já foi exigido em `submitList`; o banco exige de novo.
 */
export function createSupabaseStore(client: SupabaseClient): SubmissionStore {
  return {
    async createSubmission(input: NewSubmission) {
      const submissionId = crypto.randomUUID();
      const path = `${input.profileId}/${submissionId}/${input.fileName}`;
      const up = await client.storage
        .from(UPLOAD_BUCKET)
        .upload(path, input.bytes, { contentType: input.mime, upsert: false });
      if (up.error) throw new Error("upload");
      // Consentimento + envio + job numa única transação SQL: ou existe tudo, ou nada. Só o arquivo (fora do
      // banco) precisa ser desfeito à mão.
      const { data, error } = await rpcOf(client)("submissions_create", {
        p_id: submissionId,
        p_profile_id: input.profileId,
        p_source: input.source,
        p_school_id: input.schoolId ?? null,
        p_grade: input.grade,
        p_school_year: input.schoolYear,
        p_storage_path: path,
        p_file_name: input.fileName,
        p_mime_type: input.mime,
        p_size_bytes: input.sizeBytes,
        p_is_demo: input.isDemo,
        p_consent_purpose: input.consent.purpose,
        p_consent_text_version: input.consent.textVersion,
      });
      if (error || data !== submissionId) {
        await client.storage.from(UPLOAD_BUCKET).remove([path]);
        // D-002: o banco recusa envio de escola sem vínculo confirmado (hint estável); qualquer outro erro é genérico.
        if ((error as { hint?: unknown } | null)?.hint === "school_not_linked") throw new SubmissionError("school_not_linked");
        throw new Error("create");
      }
      return { submissionId };
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
