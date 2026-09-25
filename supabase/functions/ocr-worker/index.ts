// Edge Function ocr-worker (Deno). Um ciclo: lê a fila `ocr_jobs` (pgmq via public.jobs_read), processa com
// worker-core e confirma. Acionada pelo pg_cron a cada minuto (migration 0202) e, best effort, pelo enfileiramento.
// Local: `pnpm exec supabase --workdir .track-workdir functions serve ocr-worker --no-verify-jwt --env-file <arquivo>`.
import { createClient } from "npm:@supabase/supabase-js@2";

import { DemoExtractionPipeline } from "../_shared/demo-pipeline.ts";
import {
  createRpcWorkerJobs,
  createRpcWorkerQueue,
  handleTick,
  toWorkerJobRow,
  type RpcFn,
  type WorkerInput,
} from "../_shared/worker-core.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function authorized(req: Request): boolean {
  const shared = Deno.env.get("WORKER_SHARED_SECRET");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secretKey = Deno.env.get("SUPABASE_SECRET_KEY");
  const header = req.headers.get("x-worker-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (shared && header && safeEqual(header, shared)) return true;
  return [serviceKey, secretKey].some((k) => !!k && bearer !== "" && safeEqual(bearer, k));
}

// Pipeline: a S08 troca por a implementação real. Demonstração só com DEMO_PIPELINE=1 e nunca em produção.
function pipelineOrNull() {
  const demo = Deno.env.get("DEMO_PIPELINE") === "1";
  const isProd = Deno.env.get("APP_ENV") === "production" || Deno.env.get("NODE_ENV") === "production";
  if (demo && isProd && Deno.env.get("ALLOW_DEMO_IN_PRODUCTION") !== "1") return null;
  return demo ? new DemoExtractionPipeline({ slowMs: Number(Deno.env.get("DEMO_SLOW_MS") ?? 15_000) }) : null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!authorized(req)) return json({ error: "unauthorized" }, 401);

  const pipeline = pipelineOrNull();
  if (!pipeline) return json({ status: "pipeline_unavailable" }); // não lê a fila: as mensagens ficam para depois

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "misconfigured" }, 500);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const rpc: RpcFn = (fn, args) => client.rpc(fn, args) as unknown as ReturnType<RpcFn>;

  const jobs = createRpcWorkerJobs(rpc, async (id) => {
    const { data } = await client
      .from("jobs")
      .select("id, status, attempts, max_attempts, submission_id, run_after")
      .eq("id", id)
      .maybeSingle();
    return data ? toWorkerJobRow(data) : null;
  });

  const loadInput = async (submissionId: string): Promise<WorkerInput | null> => {
    const { data: sub } = await client
      .from("list_submissions")
      .select("storage_path, mime_type, file_name, grade, school_year")
      .eq("id", submissionId)
      .maybeSingle();
    if (!sub) return null;
    const file = await client.storage.from("list-uploads").download(sub.storage_path);
    if (file.error || !file.data) return null;
    return {
      bytes: new Uint8Array(await file.data.arrayBuffer()),
      mime: sub.mime_type,
      fileName: sub.file_name,
      grade: sub.grade ?? undefined,
      schoolYear: sub.school_year ?? undefined,
    };
  };

  const summary = await handleTick(createRpcWorkerQueue(rpc), {
    jobs,
    pipeline,
    loadInput,
    clock: {
      now: () => Date.now(),
      delay: (ms, signal) =>
        new Promise<void>((resolve) => {
          const t = setTimeout(resolve, ms);
          signal?.addEventListener("abort", () => clearTimeout(t), { once: true });
        }),
    },
    random: Math.random,
  });
  return json({ status: "ok", ...summary });
});
