import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createRpcWorkerJobs,
  createRpcWorkerQueue,
  toWorkerJobRow,
  type RpcFn,
  type WorkerDeps,
  type WorkerInput,
} from "../../supabase/functions/_shared/worker-core";
import { OCR_JOB_KIND, UPLOAD_BUCKET } from "./constants";
import type { JobQueue } from "./ports";

export function rpcOf(client: SupabaseClient): RpcFn {
  return (fn, args) => client.rpc(fn, args) as unknown as ReturnType<RpcFn>;
}

/**
 * Enfileira via public.jobs_enqueue (idempotente por envio). `kick` acorda a Edge Function (best effort);
 * o pg_cron do minuto seguinte cobre qualquer falha.
 */
export function createJobQueue(
  client: SupabaseClient,
  opts: { kick?: { url: string; secret: string } } = {},
): JobQueue {
  return {
    async enqueue(submissionId) {
      const { data, error } = await rpcOf(client)("jobs_enqueue", {
        p_kind: OCR_JOB_KIND,
        p_payload: { submission_id: submissionId },
        p_idempotency_key: submissionId,
        p_submission_id: submissionId,
      });
      if (error || typeof data !== "string") throw new Error("enqueue");
      if (opts.kick) {
        try {
          await fetch(opts.kick.url, {
            method: "POST",
            headers: { "x-worker-secret": opts.kick.secret },
            signal: AbortSignal.timeout(1_500),
          });
        } catch {
          // best effort
        }
      }
      return { jobId: data };
    },
  };
}

/** Leitura do arquivo do envio no storage (chave secreta). */
export function createInputLoader(client: SupabaseClient): WorkerDeps["loadInput"] {
  return async (submissionId): Promise<WorkerInput | null> => {
    const { data: sub } = await client
      .from("list_submissions")
      .select("storage_path, mime_type, file_name, grade, school_year")
      .eq("id", submissionId)
      .maybeSingle();
    if (!sub) return null;
    const file = await client.storage.from(UPLOAD_BUCKET).download(sub.storage_path as string);
    if (file.error || !file.data) return null;
    return {
      bytes: new Uint8Array(await file.data.arrayBuffer()),
      mime: sub.mime_type as string,
      fileName: sub.file_name as string,
      grade: (sub.grade as string | null) ?? undefined,
      schoolYear: (sub.school_year as number | null) ?? undefined,
    };
  };
}

/** Peças do worker em Node (testes de integração, scripts de E2E). */
export function createNodeWorker(client: SupabaseClient) {
  const rpc = rpcOf(client);
  const jobs = createRpcWorkerJobs(rpc, async (id) => {
    const { data } = await client
      .from("jobs")
      .select("id, status, attempts, max_attempts, submission_id, run_after")
      .eq("id", id)
      .maybeSingle();
    return data ? toWorkerJobRow(data) : null;
  });
  return { jobs, queue: createRpcWorkerQueue(rpc), loadInput: createInputLoader(client) };
}
