import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { OCR_JOB_KIND, UPLOAD_BUCKET } from "./constants";
import type { NewSubmission, SubmissionStore } from "./ports";
import type { ExtractionResult } from "./schemas";

const OPEN_STATES = ["submitted", "processing", "processing_async"];

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
          status: "processing",
          is_demo: input.isDemo,
        });
        if (row.error) throw new Error("insert");
        return { submissionId };
      } catch (e) {
        if (uploaded) await client.storage.from(UPLOAD_BUCKET).remove([path]);
        if (consentId) await client.from("consents").delete().eq("id", consentId);
        throw e;
      }
    },

    async setStatus(submissionId, status) {
      const { error } = await client
        .from("list_submissions")
        .update({ status })
        .eq("id", submissionId)
        .in("status", OPEN_STATES);
      if (error) throw new Error("setStatus");
    },

    /**
     * Resultado dentro do orçamento: job já `succeeded` (sem mensagem na fila, então nenhum worker o pega) +
     * ocr_jobs, para o status consultável devolver o resultado. Chave `sync:<envio>`: não colide com a do job assíncrono.
     */
    async recordSyncResult(submissionId: string, result: ExtractionResult, durationMs: number) {
      const job = await client
        .from("jobs")
        .insert({
          kind: OCR_JOB_KIND,
          payload: { submission_id: submissionId, sync: true },
          status: "succeeded",
          attempts: 1,
          idempotency_key: `sync:${submissionId}`,
          submission_id: submissionId,
        })
        .select("id")
        .single();
      if (job.error) throw new Error("recordSyncResult");
      const ocr = await client
        .from("ocr_jobs")
        .insert({ job_id: job.data.id, submission_id: submissionId, result, duration_ms: Math.round(durationMs) });
      if (ocr.error) throw new Error("recordSyncResult");
      const st = await client
        .from("list_submissions")
        .update({ status: "review_needed" })
        .eq("id", submissionId)
        .in("status", OPEN_STATES);
      if (st.error) throw new Error("recordSyncResult");
    },
  };
}
