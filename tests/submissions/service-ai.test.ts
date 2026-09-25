import { describe, expect, it, vi } from "vitest";

import type { ExtractionPipeline, JobQueue, SubmissionStore } from "@/features/submissions/ports";
import { submitList, type SubmitInput } from "@/features/submissions/service";
import { AiError } from "@/supabase/functions/_shared/ai/errors";
import { FakeClock } from "../helpers/fake-clock";
import { pdf } from "../helpers/files";

const RESULT = {
  items: [{ name: "Caderno", quantity: 2, unit: "un", confidence: 0.9 }],
  overallConfidence: 0.9,
  warnings: [],
};
const store = (): SubmissionStore => ({
  createSubmission: vi.fn(async () => ({ submissionId: "sub-1" })),
  reject: vi.fn(async () => undefined),
  recordSyncResult: vi.fn(async () => undefined),
});
const queue = (): JobQueue => ({ enqueue: vi.fn(async () => ({ jobId: "job-1" })) });
const input = (): SubmitInput => ({
  profileId: "00000000-0000-4000-8000-000000000001",
  source: "parent",
  grade: "3º ano",
  schoolYear: 2027,
  consent: true,
  file: { name: "lista.pdf", declaredMime: "application/pdf", size: pdf().length, bytes: pdf() },
});

describe("submitList com o pipeline de IA", () => {
  it("entrega o id do envio (entity_id das decisões) e o orçamento ao pipeline", async () => {
    const extract = vi.fn(async () => RESULT);
    const pipeline: ExtractionPipeline = { extract };
    const r = await submitList(input(), {
      pipeline,
      store: store(),
      queue: queue(),
      clock: new FakeClock(),
      budgetMs: 10_000,
    });
    expect(r.status).toBe("review_needed");
    expect(extract).toHaveBeenCalledWith(
      expect.objectContaining({ submissionId: "sub-1" }),
      expect.objectContaining({ budgetMs: 10_000 }),
    );
  });

  it("IA não configurada em tempo de execução: caminho assíncrono e 'indisponível', sem rejeitar o envio", async () => {
    const s = store();
    const pipeline: ExtractionPipeline = {
      extract: async () => Promise.reject(new AiError("ai_not_configured")),
    };
    const r = await submitList(input(), {
      pipeline,
      store: s,
      queue: queue(),
      clock: new FakeClock(),
    });
    expect(r).toMatchObject({ status: "processing_async", pipelineAvailable: false });
    expect(s.reject).not.toHaveBeenCalled();
  });

  it("outro erro do pipeline continua rejeitando o envio", async () => {
    const s = store();
    const pipeline: ExtractionPipeline = {
      extract: async () => Promise.reject(new AiError("provider_error")),
    };
    const r = await submitList(input(), {
      pipeline,
      store: s,
      queue: queue(),
      clock: new FakeClock(),
    });
    expect(r).toMatchObject({ status: "failed", reason: "extraction_failed" });
  });
});
