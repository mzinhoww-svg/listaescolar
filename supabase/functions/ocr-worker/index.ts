// Edge Function ocr-worker (Deno). Um ciclo: lê a fila `ocr_jobs` (pgmq via public.jobs_read), processa com
// worker-core e confirma. Acionada a cada minuto pelo pg_cron/pg_net (configurado fora do SQL versionado, ver README
// desta pasta) e, best effort, pelo enfileiramento do app.
// Local: `pnpm exec supabase --workdir .track-workdir functions serve ocr-worker --no-verify-jwt --env-file <arquivo>`.
import { createClient } from "npm:@supabase/supabase-js@2";

import { demoConfigError, demoEnabled, parseSlowMs } from "../_shared/demo-lock.ts";
import { DemoExtractionPipeline } from "../_shared/demo-pipeline.ts";
import { aiPipelineAvailable, createAiPipeline, type AiEnv } from "../_shared/ai/composition.ts";
import { createValidatedRpc, type RawRpc } from "../_shared/ai/rpc.ts";
import { extractionResultSchema } from "../_shared/extraction-schema.ts";
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

// Pipeline: demonstração só com DEMO_PIPELINE=1 E APP_ENV explícito em {local, development, preview, staging}
// (mesma regra do app Node). Senão, o pipeline real da S08 (roteador + adapters), só se houver chave e modelos
// (secrets da função: OPENROUTER_KEY, AI_MODEL_CHEAP/STRONG/VISION) ou o provedor fake de teste
// (FAKE_AI_SCRIPT + APP_ENV não produtivo; nunca em produção). Nada configurado = `pipeline_unavailable`.
function aiEnv(): AiEnv {
  const g = (k: string) => Deno.env.get(k);
  return {
    NODE_ENV: g("NODE_ENV"),
    APP_ENV: g("APP_ENV"),
    VERCEL_ENV: g("VERCEL_ENV"),
    OPENROUTER_KEY: g("OPENROUTER_KEY"),
    AI_MODEL_CHEAP: g("AI_MODEL_CHEAP"),
    AI_MODEL_STRONG: g("AI_MODEL_STRONG"),
    AI_MODEL_VISION: g("AI_MODEL_VISION"),
    FAKE_AI_SCRIPT: g("FAKE_AI_SCRIPT"),
  };
}

function pipelineKind(): "demo" | "real" | null {
  const env = { DEMO_PIPELINE: Deno.env.get("DEMO_PIPELINE"), APP_ENV: Deno.env.get("APP_ENV") };
  const bad = demoConfigError(env);
  if (bad) console.error(JSON.stringify({ level: "error", fn: "ocr-worker", message: bad }));
  if (demoEnabled(env)) return "demo";
  return aiPipelineAvailable(aiEnv()) ? "real" : null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!authorized(req)) return json({ error: "unauthorized" }, 401);

  const kind = pipelineKind();
  if (!kind) return json({ status: "pipeline_unavailable" }); // não lê a fila: as mensagens ficam para depois

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "misconfigured" }, 500);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const rpc: RpcFn = (fn, args) => client.rpc(fn, args) as unknown as ReturnType<RpcFn>;

  // Pipeline real: decisões de IA (`ai_decisions`) pelo mesmo cliente de serviço; teto = o que o tick der (por chamada).
  const pipeline =
    kind === "demo"
      ? new DemoExtractionPipeline({ slowMs: parseSlowMs(Deno.env.get("DEMO_SLOW_MS")) })
      : createAiPipeline({
          env: aiEnv(),
          rpc: createValidatedRpc(client as unknown as RawRpc),
          budgetMs: 90_000,
        });

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
    resultSchema: extractionResultSchema, // a saída do pipeline é validada antes de jobs_complete
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
  }, {
    // erro de infra do tick: sem PII (o core já sanitiza) e sem derrubar a resposta
    onError: (e) => console.error(JSON.stringify({ level: "error", fn: "ocr-worker", ...e })),
  });
  return json({ status: "ok", ...summary });
});
