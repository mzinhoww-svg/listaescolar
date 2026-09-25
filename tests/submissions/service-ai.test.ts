import { describe, expect, it, vi } from "vitest";

import type { ExtractionPipeline, JobQueue, SubmissionStore } from "@/features/submissions/ports";
import { submitList, type SubmitInput } from "@/features/submissions/service";
import { PIPELINE_ABORT_MARGIN_MS } from "@/supabase/functions/_shared/worker-core";
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
      expect.objectContaining({ budgetMs: 10_000 - PIPELINE_ABORT_MARGIN_MS }),
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

  it.each([
    ["vision_model_missing", new AiError("vision_model_missing"), false],
    ["provider_error 401 (config)", new AiError("provider_error", { status: 401 }), false],
    ["provider_timeout", new AiError("provider_timeout"), true],
    ["429 após escalada", new AiError("provider_error", { transient: true, status: 429 }), true],
    ["decision_record_failed", new AiError("provider_error", { detail: "decision_record_failed" }), false],
    ["decision_record_failed (RPC)", new AiError("provider_error", { transient: true, detail: "decision_record_failed" }), true],
    ["settings_unavailable (RPC)", new AiError("provider_error", { transient: true, detail: "settings_unavailable" }), true],
    ["ai_not_configured (P0002)", new AiError("ai_not_configured", { detail: "settings_invalid" }), false],
  ])("falha de infraestrutura (%s): segue para o caminho assíncrono, não rejeita o envio", async (_n, err, available) => {
    const s = store();
    const q = queue();
    const r = await submitList(input(), {
      pipeline: { extract: async () => Promise.reject(err) },
      store: s,
      queue: q,
      clock: new FakeClock(),
    });
    expect(r).toMatchObject({ status: "processing_async", pipelineAvailable: available });
    expect(s.reject).not.toHaveBeenCalled();
  });

  it("erro de conteúdo (saída inválida da IA após a escalada) rejeita o envio", async () => {
    const s = store();
    const r = await submitList(input(), {
      pipeline: { extract: async () => Promise.reject(new AiError("invalid_output")) },
      store: s,
      queue: queue(),
      clock: new FakeClock(),
    });
    expect(r).toMatchObject({ status: "failed", reason: "extraction_failed" });
  });

  it("exceção que não é da IA (bug) continua rejeitando o envio", async () => {
    const s = store();
    const r = await submitList(input(), {
      pipeline: { extract: async () => Promise.reject(new Error("boom")) },
      store: s,
      queue: queue(),
      clock: new FakeClock(),
    });
    expect(r).toMatchObject({ status: "failed", reason: "extraction_failed" });
  });
});
