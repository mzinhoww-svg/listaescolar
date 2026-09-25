import { SYNC_BUDGET_MS, CONSENT_PURPOSE, CONSENT_TEXT_VERSION } from "./constants";
import { sanitizeFileName, validateUpload, type UploadErrorCode, type UploadFile } from "./file-validation";
import type { SubmitDeps, SubmitResult } from "./ports";
import { extractionResultSchema, submitMetaSchema } from "./schemas";

export type SubmitInput = {
  profileId: string;
  source: "parent" | "school";
  schoolId?: string;
  grade: string;
  schoolYear: number;
  consent: boolean;
  file: UploadFile;
};

export type SubmissionErrorCode = "consent_required" | "invalid_input" | UploadErrorCode;

/** Erro de validação: nada foi gravado. */
export class SubmissionError extends Error {
  constructor(readonly code: SubmissionErrorCode) {
    super(code);
    this.name = "SubmissionError";
  }
}

type Outcome =
  | { kind: "ok"; result: unknown }
  | { kind: "error" }
  | { kind: "timeout" };

/**
 * Envio com orçamento de tempo. Ordem: consentimento e arquivo validados ANTES de gravar; grava (status
 * `processing`); roda o pipeline contra o relógio. Estourou: cancela o pipeline (o resultado tardio é
 * descartado), marca `processing_async` ANTES de enfileirar (o worker nunca é sobrescrito) e devolve o job.
 */
export async function submitList(input: SubmitInput, deps: SubmitDeps): Promise<SubmitResult> {
  if (input.consent !== true) throw new SubmissionError("consent_required");
  const meta = submitMetaSchema.safeParse({ ...input, file: undefined });
  if (!meta.success) throw new SubmissionError("invalid_input");
  const check = validateUpload(input.file);
  if (!check.ok) throw new SubmissionError(check.code);

  const fileName = sanitizeFileName(input.file.name, check.mime);
  const { pipeline, store, queue, clock } = deps;
  const { submissionId } = await store.createSubmission({
    profileId: meta.data.profileId,
    source: meta.data.source,
    schoolId: meta.data.schoolId,
    grade: meta.data.grade,
    schoolYear: meta.data.schoolYear,
    fileName,
    mime: check.mime,
    sizeBytes: input.file.bytes.length,
    bytes: input.file.bytes,
    isDemo: pipeline?.isDemo === true,
    consent: { purpose: CONSENT_PURPOSE, textVersion: CONSENT_TEXT_VERSION },
  });

  const enqueueAsync = async (): Promise<SubmitResult> => {
    try {
      await store.setStatus(submissionId, "processing_async");
      const { jobId } = await queue.enqueue(submissionId);
      return { status: "processing_async", submissionId, jobId, pipelineAvailable: pipeline !== null };
    } catch {
      await store.setStatus(submissionId, "rejected").catch(() => undefined);
      return { status: "failed", submissionId, reason: "enqueue_failed" };
    }
  };

  if (!pipeline) return enqueueAsync(); // nunca inventa itens: o worker também só roda com pipeline

  const abort = new AbortController();
  const timer = new AbortController();
  const started = clock.now();
  const outcome = await Promise.race<Outcome>([
    pipeline
      .extract(
        {
          bytes: input.file.bytes,
          mime: check.mime,
          fileName,
          grade: meta.data.grade,
          schoolYear: meta.data.schoolYear,
        },
        { signal: abort.signal },
      )
      .then(
        (result): Outcome => ({ kind: "ok", result }),
        (): Outcome => ({ kind: "error" }),
      ),
    clock.delay(deps.budgetMs ?? SYNC_BUDGET_MS, timer.signal).then((): Outcome => ({ kind: "timeout" })),
  ]);
  timer.abort();

  if (outcome.kind === "timeout") {
    abort.abort(); // cancela o trabalho; se ainda assim resolver, o resultado já é descartado
    return enqueueAsync();
  }
  if (outcome.kind === "error") {
    await store.setStatus(submissionId, "rejected").catch(() => undefined);
    return { status: "failed", submissionId, reason: "extraction_failed" };
  }
  const parsed = extractionResultSchema.safeParse(outcome.result);
  if (!parsed.success) {
    await store.setStatus(submissionId, "rejected").catch(() => undefined);
    return { status: "failed", submissionId, reason: "invalid_extraction" };
  }
  try {
    await store.recordSyncResult(submissionId, parsed.data, Math.max(0, clock.now() - started));
  } catch {
    await store.setStatus(submissionId, "rejected").catch(() => undefined);
    return { status: "failed", submissionId, reason: "persist_failed" };
  }
  return { status: "review_needed", submissionId, result: parsed.data };
}
