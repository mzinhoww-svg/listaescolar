// Pipeline real de extração: roteador + tarefa de extração. Implementa a porta `ExtractionPipeline` da S07.
import { z } from "zod";
import type { ExtractionResult } from "../extraction-schema.ts";
import { AiError } from "./errors.ts";
import { createExtractionTask, toExtractionResult } from "./extraction.ts";
import type { createRouter } from "./router.ts";
import type { SettingsProvider } from "./types.ts";

export type ExtractInput = {
  submissionId?: string;
  bytes: Uint8Array;
  mime: string;
  fileName?: string;
  grade?: string;
  schoolYear?: number;
  documentText?: string;
};

const submissionIdSchema = z.string().uuid();

export class RealExtractionPipeline {
  readonly isDemo = false;
  constructor(
    private readonly deps: {
      router: ReturnType<typeof createRouter>;
      settings: SettingsProvider;
      budgetMs: number;
    },
  ) {}

  async extract(
    input: ExtractInput,
    opts: { signal?: AbortSignal; budgetMs?: number },
  ): Promise<ExtractionResult> {
    // Toda decisão precisa de `entity_id` (NOT NULL no banco): sem envio, nem tenta (e nada é pago).
    const id = submissionIdSchema.safeParse(input.submissionId);
    if (!id.success) throw new AiError("ai_not_configured", { detail: "missing_submission_id" });
    // Lê os limiares antes (cache curto, falha fechada) para montar a tarefa com o limiar por item.
    const settings = await this.deps.settings.load();
    const task = createExtractionTask({
      submissionId: id.data,
      doc: {
        bytes: input.bytes,
        mime: input.mime,
        grade: input.grade,
        schoolYear: input.schoolYear,
        documentText: input.documentText,
      },
      settings,
    });
    const run = await this.deps.router.run(task, {
      signal: opts.signal,
      budgetMs: opts.budgetMs ?? this.deps.budgetMs,
    });
    return toExtractionResult(
      run.result,
      { lowConfidence: run.lowConfidence, pipelineVersion: run.pipelineVersion },
      settings,
    );
  }
}
