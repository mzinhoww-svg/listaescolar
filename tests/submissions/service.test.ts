import { describe, expect, it, vi } from "vitest";

import { DemoExtractionPipeline } from "@/features/submissions/demo-pipeline";
import type { ExtractionPipeline, JobQueue, NewSubmission, SubmissionStore } from "@/features/submissions/ports";
import type { ExtractionResult } from "@/features/submissions/schemas";
import { SubmissionError, submitList, type SubmitInput } from "@/features/submissions/service";
import { FakeClock } from "../helpers/fake-clock";
import { exe, pdf } from "../helpers/files";

const RESULT: ExtractionResult = {
  items: [{ name: "Caderno", quantity: 2, unit: "un", confidence: 0.9 }],
  overallConfidence: 0.9,
  warnings: [],
};

function makeStore() {
  const calls = { created: [] as NewSubmission[], rejected: [] as string[], synced: [] as string[] };
  const store: SubmissionStore = {
    createSubmission: vi.fn(async (i: NewSubmission) => {
      calls.created.push(i);
      return { submissionId: "sub-1" };
    }),
    reject: vi.fn(async (_id: string, reason: string) => void calls.rejected.push(reason)),
    recordSyncResult: vi.fn(async (id: string) => void calls.synced.push(id)),
  };
  return { store, calls };
}

function makeQueue() {
  const jobs = new Map<string, string>();
  const queue: JobQueue = {
    enqueue: vi.fn(async (submissionId: string) => {
      if (!jobs.has(submissionId)) jobs.set(submissionId, `job-${jobs.size + 1}`);
      return { jobId: jobs.get(submissionId)! };
    }),
  };
  return { queue, jobs };
}

const input = (over: Partial<SubmitInput> = {}): SubmitInput => ({
  profileId: "00000000-0000-4000-8000-000000000001",
  source: "parent",
  grade: "3º ano",
  schoolYear: 2027,
  consent: true,
  file: { name: "lista.pdf", declaredMime: "application/pdf", size: pdf().length, bytes: pdf() },
  ...over,
});

/** Pipeline controlável: `resolve`/`reject` fora, e registra o sinal de cancelamento. */
function controllablePipeline() {
  let resolve!: (r: ExtractionResult) => void;
  let reject!: (e: Error) => void;
  const state = { signal: undefined as AbortSignal | undefined, calls: 0 };
  const pipeline: ExtractionPipeline = {
    extract: (_i, { signal }) => {
      state.calls += 1;
      state.signal = signal;
      return new Promise<ExtractionResult>((res, rej) => {
        resolve = res;
        reject = rej;
      });
    },
  };
  return { pipeline, state, resolve: (r: ExtractionResult) => resolve(r), reject: (e: Error) => reject(e) };
}

describe("submitList", () => {
  it("dentro do orçamento: review_needed com o resultado, sem job", async () => {
    const { store, calls } = makeStore();
    const { queue, jobs } = makeQueue();
    const clock = new FakeClock();
    const p = controllablePipeline();
    const run = submitList(input(), { pipeline: p.pipeline, store, queue, clock });
    await vi.waitFor(() => expect(p.state.calls).toBe(1));
    clock.advance(3_000);
    p.resolve(RESULT);
    await expect(run).resolves.toEqual({ status: "review_needed", submissionId: "sub-1", result: RESULT });
    expect(calls.synced).toEqual(["sub-1"]);
    expect(jobs.size).toBe(0);
    expect(p.state.signal?.aborted).toBe(false);
    expect(clock.pending()).toBe(0); // temporizador do orçamento limpo
  });

  it("provedor lento (estoura 10 s falsos): processing_async com jobId e pipeline cancelado", async () => {
    const { store, calls } = makeStore();
    const { queue, jobs } = makeQueue();
    const clock = new FakeClock();
    const p = controllablePipeline();
    const run = submitList(input(), { pipeline: p.pipeline, store, queue, clock });
    await vi.waitFor(() => expect(clock.pending()).toBe(1));
    clock.advance(9_999);
    await Promise.resolve();
    expect(p.state.signal?.aborted).toBe(false);
    clock.advance(1);
    await expect(run).resolves.toEqual({
      status: "processing_async",
      submissionId: "sub-1",
      jobId: "job-1",
      pipelineAvailable: true,
    });
    expect(p.state.signal?.aborted).toBe(true);
    expect(calls.rejected).toEqual([]); // nada rejeitado: o enqueue (atômico no banco) marca processing_async
    expect(jobs.size).toBe(1);
    // resultado tardio é descartado: nada é gravado depois
    p.resolve(RESULT);
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.synced).toEqual([]);
    expect(calls.rejected).toEqual([]);
  });

  it("orçamento injetável", async () => {
    const { store } = makeStore();
    const { queue } = makeQueue();
    const clock = new FakeClock();
    const p = controllablePipeline();
    const run = submitList(input(), { pipeline: p.pipeline, store, queue, clock, budgetMs: 500 });
    await vi.waitFor(() => expect(clock.pending()).toBe(1));
    clock.advance(500);
    await expect(run).resolves.toMatchObject({ status: "processing_async" });
  });

  it("provedor que falha: failed, envio rejected, nenhum job", async () => {
    const { store, calls } = makeStore();
    const { queue, jobs } = makeQueue();
    const p = controllablePipeline();
    const run = submitList(input(), { pipeline: p.pipeline, store, queue, clock: new FakeClock() });
    await vi.waitFor(() => expect(p.state.calls).toBe(1));
    p.reject(new Error("boom com dado pessoal ana@x.com"));
    const r = await run;
    expect(r).toEqual({ status: "failed", submissionId: "sub-1", reason: "extraction_failed" });
    expect(calls.rejected).toEqual(["extraction_failed"]);
    expect(jobs.size).toBe(0);
  });

  it("resultado inválido do pipeline: failed e nada persistido", async () => {
    const { store, calls } = makeStore();
    const { queue } = makeQueue();
    const bad = { items: [], overallConfidence: 5, warnings: [] } as ExtractionResult;
    const pipeline: ExtractionPipeline = { extract: async () => bad };
    const r = await submitList(input(), { pipeline, store, queue, clock: new FakeClock() });
    expect(r).toMatchObject({ status: "failed", reason: "invalid_extraction" });
    expect(calls.synced).toEqual([]);
    expect(calls.rejected).toEqual(["invalid_extraction"]);
  });

  it("falha ao gravar o resultado síncrono: cai no caminho assíncrono (o worker refaz), sem rejeitar", async () => {
    const { store, calls } = makeStore();
    (store.recordSyncResult as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("db"));
    const { queue, jobs } = makeQueue();
    const pipeline: ExtractionPipeline = { extract: async () => RESULT };
    const r = await submitList(input(), { pipeline, store, queue, clock: new FakeClock() });
    expect(r).toMatchObject({ status: "processing_async", jobId: "job-1" });
    expect(jobs.size).toBe(1);
    expect(calls.rejected).toEqual([]);
  });

  it("falha ao enfileirar: envio rejected (nunca preso em processing)", async () => {
    const { store, calls } = makeStore();
    const queue: JobQueue = { enqueue: async () => { throw new Error("db"); } };
    const clock = new FakeClock();
    const p = controllablePipeline();
    const run = submitList(input(), { pipeline: p.pipeline, store, queue, clock });
    await vi.waitFor(() => expect(clock.pending()).toBe(1));
    clock.advance(10_000);
    await expect(run).resolves.toMatchObject({ status: "failed", reason: "enqueue_failed" });
    expect(calls.rejected).toEqual(["enqueue_failed"]);
  });

  it("sem pipeline configurado: grava, enfileira, não inventa itens", async () => {
    const { store, calls } = makeStore();
    const { queue } = makeQueue();
    const r = await submitList(input(), { pipeline: null, store, queue, clock: new FakeClock() });
    expect(r).toEqual({ status: "processing_async", submissionId: "sub-1", jobId: "job-1", pipelineAvailable: false });
    expect(calls.created).toHaveLength(1);
    expect(calls.synced).toEqual([]);
  });

  it("marca is_demo quando o pipeline é de demonstração e sanitiza o nome", async () => {
    const { store, calls } = makeStore();
    const { queue } = makeQueue();
    const pipeline = new DemoExtractionPipeline({ mode: "fast" });
    await submitList(input({ file: { ...input().file, name: "../../x/lista.pdf" } }), {
      pipeline,
      store,
      queue,
      clock: new FakeClock(),
    });
    expect(calls.created[0]).toMatchObject({ isDemo: true, fileName: "lista.pdf", mime: "application/pdf" });
  });

  describe("validação: nada é gravado", () => {
    const deps = () => {
      const { store, calls } = makeStore();
      const { queue, jobs } = makeQueue();
      return { deps: { pipeline: null, store, queue, clock: new FakeClock() }, calls, jobs };
    };

    it.each([
      ["sem consentimento", { consent: false }, "consent_required"],
      ["consentimento ausente (undefined)", { consent: undefined as unknown as boolean }, "consent_required"],
      ["metadados inválidos", { grade: "" }, "invalid_input"],
      ["assinatura mentirosa", { file: { name: "a.pdf", declaredMime: "application/pdf", size: 202, bytes: exe() } }, "unsupported_type"],
      ["vazio", { file: { name: "a.pdf", declaredMime: "application/pdf", size: 0, bytes: new Uint8Array(0) } }, "empty_file"],
      ["grande demais", { file: { name: "a.pdf", declaredMime: "application/pdf", size: 11_000_000, bytes: pdf() } }, "file_too_large"],
    ])("%s", async (_n, patch, code) => {
      const { deps: d, calls, jobs } = deps();
      const err = await submitList(input(patch), d).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SubmissionError);
      expect((err as SubmissionError).code).toBe(code);
      expect(calls.created).toHaveLength(0);
      expect(jobs.size).toBe(0);
    });
  });
});

describe("DemoExtractionPipeline", () => {
  it("rápido devolve itens rotulados como demonstração; falha lança; lento respeita o cancelamento", async () => {
    const fast = await new DemoExtractionPipeline().extract({ fileName: "lista.pdf" }, { signal: new AbortController().signal });
    expect(fast.items.every((i) => i.name.includes("demonstração"))).toBe(true);
    await expect(
      new DemoExtractionPipeline().extract({ fileName: "falha.pdf" }, { signal: new AbortController().signal }),
    ).rejects.toThrow();
    const ac = new AbortController();
    const slow = new DemoExtractionPipeline({ slowMs: 60_000 }).extract({ fileName: "lento.pdf" }, { signal: ac.signal });
    ac.abort();
    await expect(slow).rejects.toThrow("cancelado");
  });
});
