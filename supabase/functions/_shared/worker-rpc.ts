// Adaptadores sobre RPC do Supabase (as funções public.jobs_* da migration 0201). Extraído de worker-core.ts
// (D-057, S18) — comportamento idêntico ao original.
import type { WorkerJobRow, WorkerJobs, WorkerQueue } from "./worker-types.ts";

export type RpcFn = (
  fn: string,
  args?: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

async function call(rpc: RpcFn, fn: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
}

export function createRpcWorkerJobs(rpc: RpcFn, get: WorkerJobs["get"]): WorkerJobs {
  return {
    get,
    claim: async (jobId) => {
      const r = await call(rpc, "jobs_claim", { p_job_id: jobId });
      return r === "claimed" || r === "busy" || r === "not_due" || r === "finished" ? r : "busy";
    },
    complete: async (jobId, result, durationMs, fence) => {
      await call(rpc, "jobs_complete", {
        p_job_id: jobId,
        p_result: result,
        p_duration_ms: durationMs,
        p_attempts: fence.attempts,
        p_is_demo: fence.isDemo,
      });
    },
    fail: async (jobId, error, retryInSeconds, permanent = false, attempts) =>
      String(
        await call(rpc, "jobs_fail", {
          p_job_id: jobId,
          p_error: error,
          p_retry_in_seconds: retryInSeconds,
          p_permanent: permanent,
          p_attempts: attempts ?? null,
        }),
      ),
    requeueStale: async () => {
      await call(rpc, "jobs_requeue_stale");
    },
  };
}

export function createRpcWorkerQueue(rpc: RpcFn): WorkerQueue {
  return {
    read: async (qty, vt) => {
      const rows = (await call(rpc, "jobs_read", { p_qty: qty, p_vt: vt })) as
        | { msg_id: number | string; read_ct: number; job_id: string | null }[]
        | null;
      return (rows ?? []).map((r) => ({ msgId: Number(r.msg_id), readCount: r.read_ct, jobId: r.job_id }));
    },
    ack: async (msgId) => {
      await call(rpc, "jobs_ack", { p_msg_id: msgId });
    },
    setVt: async (msgId, vt) => {
      await call(rpc, "jobs_set_vt", { p_msg_id: msgId, p_vt: vt });
    },
  };
}

/** Linha da tabela jobs (snake_case) -> WorkerJobRow. */
export function toWorkerJobRow(r: {
  id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  submission_id: string | null;
  run_after?: string | null;
}): WorkerJobRow {
  return {
    id: r.id,
    status: r.status,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    submissionId: r.submission_id,
    runAfter: r.run_after ?? null,
  };
}
