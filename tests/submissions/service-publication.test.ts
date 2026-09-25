import { describe, expect, it, vi } from "vitest";
import type { ExtractionPipeline, JobQueue, SubmissionStore } from "@/features/submissions/ports";
import { submitList, type SubmitInput } from "@/features/submissions/service";
import { FakeClock } from "../helpers/fake-clock";
import { pdf } from "../helpers/files";

const RESULT = { items: [{ name: "Caderno", quantity: 2, unit: "un", confidence: 0.9 }], overallConfidence: 0.9, warnings: [] };
const store = (): SubmissionStore => ({
  createSubmission: vi.fn(async () => ({ submissionId: "sub-1" })),
  reject: vi.fn(async () => undefined),
  recordSyncResult: vi.fn(async () => undefined),
});
const queue = (): JobQueue => ({ enqueue: vi.fn(async () => ({ jobId: "job-1" })) });
const input = (): SubmitInput => ({
  profileId: "00000000-0000-4000-8000-000000000001",
  source: "school",
  schoolId: "50000000-0000-4000-8000-000000000001",
  grade: "4º ano",
  schoolYear: 2027,
  consent: true,
  file: { name: "lista.pdf", declaredMime: "application/pdf", size: pdf().length, bytes: pdf() },
});
const pipeline: ExtractionPipeline = { extract: vi.fn(async () => RESULT) };

describe("submitList: decisão de publicação inline (S09)", () => {
  it("chama decide depois de recordSyncResult e expõe o status no resultado", async () => {
    const s = store();
    const order: string[] = [];
    (s.recordSyncResult as ReturnType<typeof vi.fn>).mockImplementation(async () => { order.push("record"); });
    const decide = vi.fn(async (id: string) => { order.push(`decide:${id}`); return { status: "human_review" }; });
    const r = await submitList(input(), { pipeline, store: s, queue: queue(), clock: new FakeClock(), publication: { decide } });
    expect(order).toEqual(["record", "decide:sub-1"]);
    expect(r).toMatchObject({ status: "review_needed", submissionId: "sub-1", publication: { status: "human_review" } });
  });

  it("erro do decide é engolido: o envio continua review_needed, sem o campo publication", async () => {
    const decide = vi.fn(async () => { throw new Error("banco fora"); });
    const r = await submitList(input(), { pipeline, store: store(), queue: queue(), clock: new FakeClock(), publication: { decide } });
    expect(r.status).toBe("review_needed");
    expect("publication" in r).toBe(false);
  });

  it("decide que estoura 3 s não segura o envio (e não muda o resultado)", async () => {
    const clock = new FakeClock();
    const decide = vi.fn(() => new Promise<{ status: string }>(() => undefined));
    const p = submitList(input(), { pipeline, store: store(), queue: queue(), clock, publication: { decide } });
    await vi.waitFor(() => expect(decide).toHaveBeenCalled());
    clock.advance(3_000);
    const r = await p;
    expect(r).toMatchObject({ status: "review_needed", submissionId: "sub-1" });
    expect("publication" in r).toBe(false);
  });

  it("sem publication nas deps o resultado é idêntico ao da S07/S08 (sem o campo)", async () => {
    const r = await submitList(input(), { pipeline, store: store(), queue: queue(), clock: new FakeClock() });
    expect(r).toEqual({ status: "review_needed", submissionId: "sub-1", result: RESULT });
  });

  it("não decide no caminho assíncrono nem quando o envio falha", async () => {
    const decide = vi.fn(async () => ({ status: "x" }));
    const slow: ExtractionPipeline = { extract: vi.fn(async () => { throw new Error("x"); }) };
    const r = await submitList(input(), { pipeline: slow, store: store(), queue: queue(), clock: new FakeClock(), publication: { decide } });
    expect(r.status).toBe("failed");
    const noPipe = await submitList(input(), { pipeline: null, store: store(), queue: queue(), clock: new FakeClock(), publication: { decide } });
    expect(noPipe.status).toBe("processing_async");
    expect(decide).not.toHaveBeenCalled();
  });
});
