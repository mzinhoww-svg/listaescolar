// Integração contra o Supabase local da trilha (Postgres + Storage + funções jobs_*). Roda em `pnpm test:db`.
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { ExtractionPipeline } from "@/features/submissions/ports";
import type { ExtractionResult } from "@/features/submissions/schemas";
import { submitList } from "@/features/submissions/service";
import { createSupabaseStore } from "@/features/submissions/supabase-store";
import { createJobQueue, createNodeWorker } from "@/features/submissions/supabase-queue";
import { handleTick, type WorkerDeps } from "../../supabase/functions/_shared/worker-core";
import { cleanupUsers, DATABASE_URL, IDS, seedUsers } from "../db/helpers";
import { FakeClock } from "../helpers/fake-clock";
import { pdf } from "../helpers/files";

const RESULT: ExtractionResult = {
  items: [{ name: "Caderno", quantity: 2, unit: "un", confidence: 0.9 }],
  overallConfidence: 0.9,
  warnings: [],
};

function localApi(): { url: string; key: string } {
  const out = execFileSync("node", ["scripts/supa.mjs", "status"], { encoding: "utf8" });
  const json = out.split("\n").find((l) => l.trim().startsWith("{"));
  const env = JSON.parse(json ?? "{}") as { API_URL?: string; SECRET_KEY?: string; SERVICE_ROLE_KEY?: string };
  const key = env.SECRET_KEY ?? env.SERVICE_ROLE_KEY;
  if (!env.API_URL || !key) throw new Error("Supabase local fora do ar (pnpm db:start)");
  return { url: env.API_URL, key };
}

const input = () => ({
  profileId: IDS.parent,
  source: "parent" as const,
  grade: "3º ano",
  schoolYear: 2027,
  consent: true,
  file: { name: "lista.pdf", declaredMime: "application/pdf", size: pdf().length, bytes: pdf() },
});

describe("envio + worker contra o Postgres local", () => {
  let sb: SupabaseClient;
  let pg: Client;

  const rows = async (sql: string, p: unknown[] = []) => (await pg.query(sql, p)).rows;

  beforeAll(async () => {
    await seedUsers();
    const { url, key } = localApi();
    sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    pg = new Client({ connectionString: DATABASE_URL });
    await pg.connect();
  });
  afterAll(async () => {
    await pg.query("delete from public.list_submissions");
    await pg.query("delete from public.jobs");
    await pg.query("delete from public.consents");
    await pg.query("select pgmq.purge_queue('ocr_jobs')");
    await pg.query("select pgmq.purge_queue('ocr_jobs_dlq')");
    await pg.end();
    await cleanupUsers();
  });
  beforeEach(async () => {
    await pg.query("delete from public.list_submissions");
    await pg.query("delete from public.jobs");
    await pg.query("delete from public.consents");
    await pg.query("select pgmq.purge_queue('ocr_jobs')");
  });

  const workerDeps = (extract: ExtractionPipeline["extract"]): { deps: WorkerDeps; queue: ReturnType<typeof createNodeWorker>["queue"] } => {
    const w = createNodeWorker(sb);
    return {
      queue: w.queue,
      deps: {
        jobs: w.jobs,
        loadInput: w.loadInput,
        pipeline: { extract },
        clock: { now: () => Date.now(), delay: (ms, s) => new Promise((r) => { const t = setTimeout(r, ms); s?.addEventListener("abort", () => clearTimeout(t)); }) },
      },
    };
  };

  it("dentro do orçamento: grava consentimento, arquivo e envio; resultado persistido, sem mensagem na fila", async () => {
    const clock = new FakeClock();
    const pipeline: ExtractionPipeline = { extract: async () => RESULT };
    const r = await submitList(input(), { pipeline, store: createSupabaseStore(sb), queue: createJobQueue(sb), clock });
    expect(r.status).toBe("review_needed");
    const sub = (await rows("select status, storage_path, consent_id from public.list_submissions"))[0];
    expect(sub.status).toBe("review_needed");
    expect(sub.storage_path).toMatch(new RegExp(`^${IDS.parent}/.+/lista\\.pdf$`));
    expect(await rows("select 1 from public.consents where purpose = 'list_upload'")).toHaveLength(1);
    expect((await rows("select result from public.ocr_jobs"))[0].result).toEqual(RESULT);
    expect((await rows("select count(*)::int as n from pgmq.q_ocr_jobs"))[0].n).toBe(0);
    const dl = await sb.storage.from("list-uploads").download(sub.storage_path);
    expect(dl.error).toBeNull();
  });

  it("pipeline lento: job criado, worker-core processa e conclui; job duplicado é ignorado", async () => {
    const clock = new FakeClock();
    const slow: ExtractionPipeline = { extract: () => new Promise(() => undefined) }; // nunca responde
    const run = submitList(input(), { pipeline: slow, store: createSupabaseStore(sb), queue: createJobQueue(sb), clock });
    await expect.poll(() => clock.pending()).toBe(1);
    clock.advance(10_000);
    const r = await run;
    expect(r.status).toBe("processing_async");
    if (r.status !== "processing_async") return;
    expect((await rows("select status from public.list_submissions"))[0].status).toBe("processing_async");
    expect((await rows("select count(*)::int as n from pgmq.q_ocr_jobs"))[0].n).toBe(1);

    // reenfileirar o mesmo envio devolve o mesmo job e não cria nova mensagem
    const again = await createJobQueue(sb).enqueue(r.submissionId);
    expect(again.jobId).toBe(r.jobId);
    expect((await rows("select count(*)::int as n from pgmq.q_ocr_jobs"))[0].n).toBe(1);

    let calls = 0;
    const { deps, queue } = workerDeps(async () => { calls += 1; return RESULT; });
    const s1 = await handleTick(queue, deps);
    expect(s1).toMatchObject({ read: 1, done: 1, errors: 0 });
    expect((await rows("select status from public.list_submissions"))[0].status).toBe("review_needed");
    expect((await rows("select status, attempts from public.jobs where id = $1", [r.jobId]))[0]).toEqual({ status: "succeeded", attempts: 1 });
    expect((await rows("select result from public.ocr_jobs where job_id = $1", [r.jobId]))[0].result).toEqual(RESULT);

    // mensagem duplicada do mesmo job: skipped, sem novo processamento
    await pg.query("select pgmq.send('ocr_jobs', jsonb_build_object('job_id', $1::uuid))", [r.jobId]);
    const s2 = await handleTick(queue, deps);
    expect(s2).toMatchObject({ read: 1, skipped: 1, done: 0 });
    expect(calls).toBe(1);
  });

  it("falha do pipeline no worker: retrying com atraso; a mensagem só volta depois do vt", async () => {
    const clock = new FakeClock();
    const slow: ExtractionPipeline = { extract: () => new Promise(() => undefined) };
    const run = submitList(input(), { pipeline: slow, store: createSupabaseStore(sb), queue: createJobQueue(sb), clock });
    await expect.poll(() => clock.pending()).toBe(1);
    clock.advance(10_000);
    const r = await run;
    if (r.status !== "processing_async") throw new Error("esperava processing_async");
    const { deps, queue } = workerDeps(async () => { throw new Error("provedor fora"); });
    const s = await handleTick(queue, deps);
    expect(s).toMatchObject({ retry: 1 });
    const job = (await rows("select status, attempts, last_error from public.jobs where id = $1", [r.jobId]))[0];
    expect(job.status).toBe("retrying");
    expect(job.attempts).toBe(1);
    expect(job.last_error).toContain("provedor fora");
    // dentro da janela de backoff: nada a ler
    expect((await handleTick(queue, deps)).read).toBe(0);
  });

  it("consentimento e envio falham juntos: nada fica gravado se o upload falha", async () => {
    const store = createSupabaseStore(sb);
    await expect(
      store.createSubmission({
        profileId: IDS.parent, source: "parent", grade: "3º ano", schoolYear: 2027,
        fileName: "x.exe", mime: "application/x-msdownload", sizeBytes: 3, bytes: new Uint8Array([1, 2, 3]),
        isDemo: false, consent: { purpose: "list_upload", textVersion: "v1" },
      }),
    ).rejects.toThrow();
    expect(await rows("select 1 from public.consents")).toHaveLength(0);
    expect(await rows("select 1 from public.list_submissions")).toHaveLength(0);
  });
});
