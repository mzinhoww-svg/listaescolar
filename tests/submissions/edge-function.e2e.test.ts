// Ciclo real contra a Edge Function ocr-worker servida localmente (Deno). Só roda com WORKER_URL e WORKER_SHARED_SECRET
// (ver supabase/functions/ocr-worker/README.md); fora disso é ignorado, inclusive em `pnpm test:db`.
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ExtractionPipeline } from "@/features/submissions/ports";
import { submitList } from "@/features/submissions/service";
import { createJobQueue } from "@/features/submissions/supabase-queue";
import { createSupabaseStore } from "@/features/submissions/supabase-store";
import { cleanupUsers, DATABASE_URL, IDS, seedUsers } from "../db/helpers";
import { FakeClock } from "../helpers/fake-clock";
import { pdf } from "../helpers/files";

const URL_ = process.env.WORKER_URL;
const SECRET = process.env.WORKER_SHARED_SECRET;

const tick = async () => {
  const res = await fetch(URL_ as string, { method: "POST", headers: { "x-worker-secret": SECRET as string } });
  return { status: res.status, body: (await res.json()) as Record<string, number | string> };
};

describe.skipIf(!URL_ || !SECRET)("ocr-worker (Deno) de ponta a ponta", () => {
  let sb: SupabaseClient;
  let pg: Client;
  const rows = async (sql: string, p: unknown[] = []) => (await pg.query(sql, p)).rows;

  beforeAll(async () => {
    await seedUsers();
    const out = execFileSync("node", ["scripts/supa.mjs", "status"], { encoding: "utf8" });
    const env = JSON.parse(out.split("\n").find((l) => l.trim().startsWith("{")) ?? "{}") as { API_URL: string; SECRET_KEY: string };
    sb = createClient(env.API_URL, env.SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    pg = new Client({ connectionString: DATABASE_URL });
    await pg.connect();
    for (const t of ["list_submissions", "jobs", "consents"]) await pg.query(`delete from public.${t}`);
    await pg.query("select pgmq.purge_queue('ocr_jobs')");
  });
  afterAll(async () => {
    for (const t of ["list_submissions", "jobs", "consents"]) await pg.query(`delete from public.${t}`);
    await pg.query("select pgmq.purge_queue('ocr_jobs')");
    await pg.query("select pgmq.purge_queue('ocr_jobs_dlq')");
    await pg.end();
    await cleanupUsers();
  });

  const slowSubmit = async (name: string) => {
    const clock = new FakeClock();
    const slow: ExtractionPipeline = { extract: () => new Promise(() => undefined) };
    const bytes = pdf();
    const run = submitList(
      { profileId: IDS.parent, source: "parent", grade: "3º ano", schoolYear: 2027, consent: true, file: { name, declaredMime: "application/pdf", size: bytes.length, bytes } },
      { pipeline: slow, store: createSupabaseStore(sb), queue: createJobQueue(sb), clock },
    );
    await expect.poll(() => clock.pending()).toBe(1);
    clock.advance(10_000);
    const r = await run;
    if (r.status !== "processing_async") throw new Error("esperava processing_async");
    return r;
  };

  it("rejeita chamada sem segredo", async () => {
    expect((await fetch(URL_ as string, { method: "POST" })).status).toBe(401);
  });

  it("job lento é concluído pelo worker e o envio passa a review_needed; duplicata é ignorada", async () => {
    const r = await slowSubmit("lista.pdf");
    const t = await tick();
    expect(t.status).toBe(200);
    expect(t.body).toMatchObject({ status: "ok", read: 1, done: 1 });
    expect((await rows("select status, is_demo from public.list_submissions"))[0]).toEqual({ status: "review_needed", is_demo: true }); // worker com pipeline demo marca is_demo
    expect((await rows("select status from public.jobs where id = $1", [r.jobId]))[0].status).toBe("succeeded");
    expect(await rows("select 1 from public.ocr_jobs where job_id = $1", [r.jobId])).toHaveLength(1);
    await pg.query("select pgmq.send('ocr_jobs', jsonb_build_object('job_id', $1::uuid))", [r.jobId]);
    expect((await tick()).body).toMatchObject({ read: 1, skipped: 1, done: 0 });
    expect(await rows("select 1 from public.ocr_jobs where job_id = $1", [r.jobId])).toHaveLength(1);
  });

  it("falha do pipeline: retrying; arquivo armazenado inválido: dead imediato", async () => {
    const f = await slowSubmit("falha.pdf");
    expect((await tick()).body).toMatchObject({ retry: 1 });
    expect((await rows("select status, attempts from public.jobs where id = $1", [f.jobId]))[0]).toEqual({ status: "retrying", attempts: 1 });

    const bad = await slowSubmit("invalido.pdf");
    const path = (await rows("select storage_path from public.list_submissions where id = $1", [bad.submissionId]))[0].storage_path as string;
    await sb.storage.from("list-uploads").upload(path, new Uint8Array([1, 2, 3, 4, 5, 6]), { upsert: true, contentType: "application/pdf" });
    expect((await tick()).body).toMatchObject({ dead: 1 });
    expect((await rows("select status, attempts from public.jobs where id = $1", [bad.jobId]))[0]).toEqual({ status: "dead", attempts: 1 });
  });
});
