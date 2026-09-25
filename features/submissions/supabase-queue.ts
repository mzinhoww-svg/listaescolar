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
import { UPLOAD_BUCKET } from "./constants";
import { extractionResultSchema } from "./schemas";
import type { JobQueue } from "./ports";

export function rpcOf(client: SupabaseClient): RpcFn {
  return (fn, args) => client.rpc(fn, args) as unknown as ReturnType<RpcFn>;
}

/**
 * Devolve o job do envio à fila via public.jobs_defer (atômico: job `queued` + mensagem + envio `processing_async`;
 * idempotente por envio). Não acorda a Edge Function: o pg_cron do minuto seguinte a aciona (sem espera extra no
 * caminho do usuário).
 */
export function createJobQueue(client: SupabaseClient): JobQueue {
  return {
    async enqueue(submissionId) {
      const { data, error } = await rpcOf(client)("jobs_defer", { p_submission_id: submissionId });
      if (error || typeof data !== "string") throw new Error("enqueue");
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
  return {
    jobs,
    queue: createRpcWorkerQueue(rpc),
    loadInput: createInputLoader(client),
    /** A saída do pipeline sempre passa por este schema antes de `jobs_complete`. */
    resultSchema: extractionResultSchema,
  };
}
