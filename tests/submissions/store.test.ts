// Integração contra o Supabase local da trilha (Postgres + Storage + funções jobs_*). Roda em `pnpm test:db`.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { ExtractionPipeline } from "@/features/submissions/ports";
import type { ExtractionResult } from "@/features/submissions/schemas";
import { submitList } from "@/features/submissions/service";
import { createSupabaseStore } from "@/features/submissions/supabase-store";
import { createJobQueue, createNodeWorker } from "@/features/submissions/supabase-queue";
import { handleTick, type WorkerDeps } from "../../supabase/functions/_shared/worker-core";
import { attempt, cleanupUsers, DATABASE_URL, IDS, seedUsers, withClaims } from "../db/helpers";
import { FakeClock } from "../helpers/fake-clock";
import { pdf } from "../helpers/files";
import { localApi } from "../helpers/local-api";

const RESULT: ExtractionResult = {
  items: [{ name: "Caderno", quantity: 2, unit: "un", confidence: 0.9 }],
  overallConfidence: 0.9,
  warnings: [],
};

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
    if (pg) {
      await pg.query("delete from public.list_submissions");
      await pg.query("delete from public.jobs");
      await pg.query("delete from public.consents");
      await pg.query("select pgmq.purge_queue('ocr_jobs')");
      await pg.query("select pgmq.purge_queue('ocr_jobs_dlq')");
      await pg.end();
    }
    await cleanupUsers();
  });
  beforeEach(async () => {
    await pg.query("delete from public.list_submissions");
    await pg.query("delete from public.jobs");
    await pg.query("delete from public.consents");
    await pg.query("select pgmq.purge_queue('ocr_jobs')");
  });

  const workerDeps = (
    extract: ExtractionPipeline["extract"],
    isDemo = false,
  ): { deps: WorkerDeps; queue: ReturnType<typeof createNodeWorker>["queue"] } => {
    const w = createNodeWorker(sb);
    return {
      queue: w.queue,
      deps: {
        jobs: w.jobs,
        loadInput: w.loadInput,
        pipeline: { extract, isDemo },
        resultSchema: w.resultSchema,
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
    // o job nasceu com o envio (chave = id do envio) e fechou como succeeded, sem chave `sync:`
    const job = (await rows("select status::text s, attempts, idempotency_key k, submission_id from public.jobs"))[0];
    expect(job).toMatchObject({ s: "succeeded", attempts: 1, k: r.submissionId, submission_id: r.submissionId });
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

  const slowSubmit = async () => {
    const clock = new FakeClock();
    const slow: ExtractionPipeline = { extract: () => new Promise(() => undefined) };
    const run = submitList(input(), { pipeline: slow, store: createSupabaseStore(sb), queue: createJobQueue(sb), clock });
    await expect.poll(() => clock.pending()).toBe(1);
    clock.advance(10_000);
    const r = await run;
    if (r.status !== "processing_async") throw new Error("esperava processing_async");
    return r;
  };

  it("arquivo armazenado inválido: falha permanente, job vai direto a dead", async () => {
    const r = await slowSubmit();
    const path = (await rows("select storage_path from public.list_submissions"))[0].storage_path as string;
    const up = await sb.storage.from("list-uploads").upload(path, new Uint8Array([1, 2, 3, 4, 5, 6]), { upsert: true, contentType: "application/pdf" });
    expect(up.error).toBeNull();
    const { deps, queue } = workerDeps(async () => RESULT);
    const s = await handleTick(queue, deps);
    expect(s).toMatchObject({ read: 1, dead: 1, retry: 0 });
    const job = (await rows("select status, attempts from public.jobs where id = $1", [r.jobId]))[0];
    expect(job.status).toBe("dead");
    expect(job.attempts).toBe(1);
  });

  it("requeue no tick: job vencido sem mensagem volta à fila e é processado", async () => {
    const r = await slowSubmit();
    await pg.query("select pgmq.purge_queue('ocr_jobs')"); // mensagem perdida
    const { deps, queue } = workerDeps(async () => RESULT);
    const s = await handleTick(queue, deps);
    expect(s).toMatchObject({ read: 1, done: 1 });
    expect((await rows("select status from public.jobs where id = $1", [r.jobId]))[0].status).toBe("succeeded");
  });

  /** Cliente cujo `rpc` falha (o arquivo já subiu): simula queda entre o upload e a transação. */
  const failingRpc = (): SupabaseClient =>
    new Proxy(sb, {
      get(target, prop) {
        if (prop === "rpc") return () => Promise.resolve({ data: null, error: { message: "boom" } });
        const v = Reflect.get(target, prop, target) as unknown;
        return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
      },
    });

  const newSubmission = () => ({
    profileId: IDS.parent, source: "parent" as const, grade: "3º ano", schoolYear: 2027,
    fileName: "lista.pdf", mime: "application/pdf", sizeBytes: pdf().length, bytes: pdf(),
    isDemo: false, consent: { purpose: "list_upload", textVersion: "v1" },
  });
  const storageCount = async () => ((await sb.storage.from("list-uploads").list(IDS.parent, { limit: 1000 })).data ?? []).length;
  const nothingLeft = async (storageBefore: number) => {
    for (const t of ["consents", "list_submissions", "jobs"]) expect(await rows(`select 1 from public.${t}`), t).toHaveLength(0);
    expect(await storageCount(), "storage").toBe(storageBefore);
  };

  it.each([
    ["o banco recusa o envio (origem school para pai)", () => sb, { source: "school" as const }],
    ["a transação SQL falha depois do upload", () => failingRpc(), {}],
    ["consentimento inválido (finalidade errada) desfaz o consentimento já inserido", () => sb, { consent: { purpose: "outra", textVersion: "v1" } }],
  ])("rollback completo: %s", async (_n, client, patch) => {
    const before = await storageCount();
    await expect(createSupabaseStore(client()).createSubmission({ ...newSubmission(), ...patch })).rejects.toThrow();
    await nothingLeft(before);
  });

  it("submissions_create: um único passo deixa consentimento, envio processing e job running com lease", async () => {
    const { submissionId } = await createSupabaseStore(sb).createSubmission(newSubmission());
    const sub = (await rows("select status, consent_id from public.list_submissions where id = $1", [submissionId]))[0];
    expect(sub.status).toBe("processing");
    expect(await rows("select 1 from public.consents where id = $1", [sub.consent_id])).toHaveLength(1);
    const job = (await rows("select status, attempts, locked_at from public.jobs where idempotency_key = $1", [submissionId]))[0];
    expect(job).toMatchObject({ status: "running", attempts: 1 });
    expect(job.locked_at).not.toBeNull();
  });

  it("recordSyncResult atômico: job que não está mais running não grava nada e lança", async () => {
    const store = createSupabaseStore(sb);
    const { submissionId } = await store.createSubmission(newSubmission());
    await pg.query("update public.jobs set status = 'queued' where idempotency_key = $1", [submissionId]);
    await expect(store.recordSyncResult(submissionId, RESULT, 5)).rejects.toThrow();
    expect(await rows("select 1 from public.ocr_jobs")).toHaveLength(0);
    expect((await rows("select status::text s from public.list_submissions"))[0].s).toBe("processing");
  });

  it("envio órfão (app morreu depois de gravar): passada a lease o tick o recupera e conclui", async () => {
    const store = createSupabaseStore(sb);
    const { submissionId } = await store.createSubmission(newSubmission()); // ... e o processo "morre"
    expect((await rows("select status::text s, attempts from public.jobs"))[0]).toEqual({ s: "running", attempts: 1 });
    const { deps, queue } = workerDeps(async () => RESULT);
    expect(await handleTick(queue, deps)).toMatchObject({ read: 0 }); // lease vigente: ninguém mexe
    await pg.query("update public.jobs set locked_at = now() - interval '6 minutes' where idempotency_key = $1", [submissionId]);
    expect(await handleTick(queue, deps)).toMatchObject({ read: 1, done: 1, errors: 0 });
    expect((await rows("select status::text s from public.list_submissions"))[0].s).toBe("review_needed");
    expect((await rows("select attempts from public.jobs"))[0].attempts).toBe(2);
  });

  it("timeout do envio: o mesmo job (chave = envio) volta à fila com tentativas zeradas; sem job `sync:`", async () => {
    const r = await slowSubmit();
    const jobs = await rows("select id, status::text s, attempts, idempotency_key k from public.jobs");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ id: r.jobId, s: "queued", attempts: 0, k: r.submissionId });
  });

  it("worker com pipeline demo marca list_submissions.is_demo; o pipeline real não marca", async () => {
    await slowSubmit();
    const { deps, queue } = workerDeps(async () => RESULT, true);
    await handleTick(queue, deps);
    expect((await rows("select is_demo from public.list_submissions"))[0].is_demo).toBe(true);
    await pg.query("delete from public.list_submissions");
    await slowSubmit();
    const real = workerDeps(async () => RESULT, false);
    await handleTick(real.queue, real.deps);
    expect((await rows("select is_demo from public.list_submissions"))[0].is_demo).toBe(false);
  });

  it("saída inválida do pipeline no worker: nada em ocr_jobs, envio não vai a review_needed, job em retrying", async () => {
    await slowSubmit();
    const { deps, queue } = workerDeps(async () => ({ items: [], overallConfidence: 9, warnings: [] }));
    expect(await handleTick(queue, deps)).toMatchObject({ retry: 1, done: 0 });
    expect(await rows("select 1 from public.ocr_jobs")).toHaveLength(0);
    expect((await rows("select status::text s from public.list_submissions"))[0].s).toBe("processing_async");
    expect((await rows("select status::text s from public.jobs"))[0].s).toBe("retrying");
  });

  it("consentimento revogado não sustenta novo envio", async () => {
    const consent = (await rows(
      "insert into public.consents (profile_id, purpose, text_version) values ($1, 'list_upload', 'v1') returning id",
      [IDS.parent],
    ))[0].id as string;
    await pg.query("select public.consents_revoke($1, $2)", [consent, IDS.parent]);
    const id = crypto.randomUUID();
    await pg.query("begin");
    const ins = await attempt(
      pg,
      "insert into public.list_submissions (id, submitted_by, source, grade, school_year, storage_path, file_name, mime_type, size_bytes, consent_id) values ($1, $2, 'parent', '3º ano', 2027, $3, 'a.pdf', 'application/pdf', 4, $4)",
      [id, IDS.parent, `${IDS.parent}/${id}/a.pdf`, consent],
    );
    await pg.query("rollback");
    expect(ins.code).toBe("23514");
  });

  it("authenticated não grava consentimento, envio nem objeto de storage", async () => {
    await withClaims("parent", async (c) => {
      const cons = await attempt(c, "insert into public.consents (profile_id, purpose, text_version) values ($1, 'list_upload', 'v1')", [IDS.parent]);
      expect(cons.code).toBe("42501");
      const sub = await attempt(c, "insert into public.list_submissions (submitted_by, source, grade, school_year, storage_path, file_name, mime_type, size_bytes) values ($1, 'parent', '3º ano', 2027, 'x', 'a.pdf', 'application/pdf', 4)", [IDS.parent]);
      expect(sub.code).toBe("42501");
      const obj = await attempt(c, "insert into storage.objects (bucket_id, name, owner_id) values ('list-uploads', $1, $2)", [`${IDS.parent}/${crypto.randomUUID()}/a.pdf`, IDS.parent]);
      expect(obj.error).not.toBeNull();
      const rev = await attempt(c, "select public.consents_revoke(gen_random_uuid(), $1)", [IDS.parent]);
      expect(rev.code).toBe("42501");
    });
  });
});
