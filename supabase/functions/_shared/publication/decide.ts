// Serviço de decisão de publicação automática (S09). Fluxo: carrega a entrada -> valida o resultado -> lê settings e
// contexto -> `evaluatePublication` -> grava o veredito (sob lock, o status é o claim) -> se `auto_publish`, lease +
// porta `ListPublisher` (idempotente por submissionId) -> registra a publicação. Nunca chama a porta sem veredito
// `auto_publish` gravado; quem perde a corrida recebe `already_decided` e para. Sem chamada de IA.
import { extractionResultSchema, type ExtractionResult } from "../extraction-schema.ts";
import { REASON_CODE_PATTERN, PUBLICATION_RULES_VERSION, type ReasonCode } from "./codes.ts";
import {
  PortError,
  asPortError,
  type PublicationContextReader,
  type PublicationStore,
  type PublishItem,
  type ListPublisher,
  type StoredInput,
  type VerdictPayload,
} from "./ports.ts";
import { evaluatePublication } from "./rules.ts";
import type { PublicationSettingsProvider } from "./settings.ts";
import type { PublicationContext } from "./types.ts";

export type PublicationClock = { now(): number; delay(ms: number, signal?: AbortSignal): Promise<void> };

export type PublicationDeps = {
  store: PublicationStore;
  settings: PublicationSettingsProvider;
  /** `null` = porta não ligada: veredito `human_review` com `context_unavailable` (falha fechada, registrada). */
  context: PublicationContextReader | null;
  /** `null` = porta não ligada: veredito `human_review` com `publisher_unavailable`. */
  publisher: ListPublisher | null;
  clock: PublicationClock;
  /** Alerta operacional (ex.: `published_after_failure`); nunca derruba a decisão. */
  onAlert?: (a: { code: string; submissionId: string }) => void;
};

export type DecideResult =
  | { status: "auto_published"; listId: string; previousVersionId: string | null; newVersionId: string }
  | { status: "human_review"; reasons: ReasonCode[] }
  | { status: "already_decided" }
  | { status: "not_ready" }
  | { status: "retry_later" }
  /** Veredito `auto_publish` gravado (`approved`), publicação ainda não feita: o varredor repete. */
  | { status: "publish_pending" }
  | { status: "publish_failed"; reason: string }
  /** A porta publicou depois de o envio ser falhado: versão órfã registrada e alertada. */
  | { status: "publish_orphaned"; newVersionId: string };

/** Janela da lease da chamada à porta; maior que o teto da chamada, para o expirador nunca a atropelar. */
export const PUBLISH_LEASE_SECONDS = 120;
/** Teto de uma chamada à porta. */
export const PUBLISH_TIMEOUT_MS = 45_000;
/** `approved` sem publicação há mais que isto vira `publish_failed` e volta a `human_review`. */
export const PUBLISH_EXPIRY_SECONDS = 3600;

const REASON_ALPHABET = /^[a-z][a-z0-9_]{0,59}$/;

const stageOf = (status: string): "review" | "not_ready" | "decided" =>
  status === "review_needed" ? "review" : ["draft", "submitted", "processing", "processing_async"].includes(status) ? "not_ready" : "decided";

/** Itens do resultado validado para a porta (nomes de material; nada de dado pessoal). */
function toPublishItems(r: ExtractionResult): PublishItem[] | null {
  const out: PublishItem[] = [];
  for (const [i, it] of r.items.entries()) {
    if (!it.normalizedName || !it.category || it.quantity === null) return null;
    out.push({ position: i + 1, originalName: it.name, normalizedName: it.normalizedName, category: it.category, quantity: it.quantity, unit: it.unit, confidence: it.confidence });
  }
  return out;
}

function verdictPayload(
  outcome: "auto_publish" | "human_review",
  reasons: ReasonCode[],
  justification: string,
  r: ExtractionResult | null,
  startedAt: number,
  finishedAt: number,
): VerdictPayload {
  const alerts = r ? [...new Set([...(r.alerts ?? []), ...(r.criticalAlerts ?? []), ...r.items.flatMap((i) => i.alerts ?? [])])] : [];
  return {
    decision: outcome,
    justification,
    reasons,
    pipeline_version: PUBLICATION_RULES_VERSION,
    ...(r ? { overall_score: r.overallConfidence, item_scores: r.items.map((i) => i.confidence) } : {}),
    alerts,
    started_at: new Date(startedAt).toISOString(),
    finished_at: new Date(finishedAt).toISOString(),
    latency_ms: Math.max(0, Math.round(finishedAt - startedAt)),
  };
}

function alert(deps: PublicationDeps, code: string, submissionId: string): void {
  try {
    deps.onAlert?.({ code, submissionId });
  } catch {
    // o alerta nunca derruba a decisão
  }
}

/** Chama a porta com teto de tempo; estouro = erro transitório (a chamada em voo é idempotente pela chave). */
async function publishWithTimeout(publisher: ListPublisher, req: Parameters<ListPublisher["publish"]>[0], clock: PublicationClock) {
  const timer = new AbortController();
  const timeout = clock.delay(PUBLISH_TIMEOUT_MS, timer.signal).then((): never => {
    throw new PortError("publish_timeout", true);
  });
  try {
    return await Promise.race([Promise.resolve().then(() => publisher.publish(req)), timeout]);
  } finally {
    timer.abort();
  }
}

/** Publicação: lease -> porta -> registro. O veredito `auto_publish` já está gravado (envio `approved`). */
async function publishStage(id: string, input: StoredInput, r: ExtractionResult, ctx: PublicationContext | null, deps: PublicationDeps): Promise<DecideResult> {
  const { store, publisher } = deps;
  const items = toPublishItems(r);
  if (!publisher) return failStage(id, "publisher_unavailable", deps);
  if (!ctx?.gradeSlug || input.schoolId === null || input.schoolYear === null) return failStage(id, "context_unavailable", deps);
  if (!items || items.length === 0) return failStage(id, "invalid_extraction_result", deps);

  const lease = await store.beginPublish(id, PUBLISH_LEASE_SECONDS);
  if (lease === "busy") return { status: "publish_pending" };
  if (lease !== "leased") return { status: "already_decided" };

  let out;
  try {
    out = await publishWithTimeout(
      publisher,
      { idempotencyKey: id, submissionId: id, schoolId: input.schoolId, gradeSlug: ctx.gradeSlug, schoolYear: input.schoolYear, source: "school_upload", actor: { kind: "system" }, items },
      deps.clock,
    );
  } catch (e) {
    const known = asPortError(e);
    if (known && !known.transient) return failStage(id, REASON_ALPHABET.test(known.code) ? known.code : "publish_rejected", deps);
    return { status: "publish_pending" }; // transitório ou desconhecido: o varredor repete; a lease vence sozinha
  }
  const done = await store.complete(id, { newVersionId: out.newVersionId, previousVersionId: out.previousVersionId });
  if (done === "orphaned" || done === "not_approved") {
    // A porta publicou, mas o envio já não está `approved` (o expirador venceu a corrida ou o estado mudou).
    alert(deps, done === "orphaned" ? "published_after_failure" : "published_not_recorded", id);
    return { status: "publish_orphaned", newVersionId: out.newVersionId };
  }
  return { status: "auto_published", listId: out.listId, previousVersionId: out.previousVersionId, newVersionId: out.newVersionId };
}

async function failStage(id: string, reason: string, deps: PublicationDeps): Promise<DecideResult> {
  const r = await deps.store.fail(id, reason);
  return r === "failed" || r === "already_failed" ? { status: "publish_failed", reason } : { status: "already_decided" };
}

/** Lê o contexto: `null` (porta ausente ou erro permanente) vira `context_unavailable`; transitório lança. */
async function loadContext(input: StoredInput, deps: PublicationDeps): Promise<{ ctx: PublicationContext | null } | "retry"> {
  if (!deps.context) return { ctx: null };
  try {
    return { ctx: await deps.context.load({ schoolId: input.schoolId, grade: input.grade, schoolYear: input.schoolYear, submittedBy: input.submittedBy }) };
  } catch (e) {
    const known = asPortError(e);
    return known && !known.transient ? { ctx: null } : "retry";
  }
}

export async function decideListPublication(submissionId: string, deps: PublicationDeps): Promise<DecideResult> {
  const startedAt = deps.clock.now();
  const input = await deps.store.loadInput(submissionId);
  const stage = stageOf(input.status);
  if (stage === "not_ready") return { status: "not_ready" };
  if (stage === "decided") return { status: "already_decided" };
  if (input.result === null || input.result === undefined) return { status: "not_ready" };

  let settings;
  try {
    settings = await deps.settings.load();
  } catch {
    return { status: "retry_later" }; // transitório: nada é gravado; o varredor tenta de novo
  }
  const loaded = await loadContext(input, deps);
  if (loaded === "retry") return { status: "retry_later" };

  const parsed = extractionResultSchema.safeParse(input.result);
  const result = parsed.success ? parsed.data : null;
  const verdict = evaluatePublication(
    {
      submissionId,
      schoolId: input.schoolId,
      submittedBy: input.submittedBy,
      source: input.source,
      grade: input.grade,
      schoolYear: input.schoolYear,
      isDemo: input.isDemo,
      result: input.result,
      context: loaded.ctx,
      publisherAvailable: deps.publisher !== null,
    },
    settings,
  );
  const payload = verdictPayload(verdict.outcome, verdict.reasons, verdict.justification, result, startedAt, deps.clock.now());
  if (!payload.reasons.every((c) => REASON_CODE_PATTERN.test(c))) throw new PortError("invalid_reason_code", false);

  const recorded = await deps.store.recordVerdict(submissionId, payload);
  if (recorded !== "recorded") return { status: recorded };
  if (verdict.outcome === "human_review" || !result) return { status: "human_review", reasons: verdict.reasons };
  return publishStage(submissionId, input, result, loaded.ctx, deps);
}

/**
 * Retoma um envio `approved` (veredito `auto_publish` gravado, publicação pendente). Primeiro o expirador: `approved`
 * há mais de 1 h e sem chamada em andamento vira `publish_failed`; com chamada em andamento (lease) não se toca.
 */
export async function resumePublication(submissionId: string, deps: PublicationDeps): Promise<DecideResult> {
  const exp = await deps.store.expire(submissionId, PUBLISH_EXPIRY_SECONDS);
  if (exp === "failed") return { status: "publish_failed", reason: "publish_expired" };
  if (exp === "in_progress") return { status: "publish_pending" };
  if (exp === "already_failed" || exp === "not_approved") return { status: "already_decided" };

  const input = await deps.store.loadInput(submissionId);
  if (input.status !== "approved") return { status: "already_decided" };
  const parsed = extractionResultSchema.safeParse(input.result);
  if (!parsed.success) return failStage(submissionId, "invalid_extraction_result", deps);
  if (!deps.publisher) return failStage(submissionId, "publisher_unavailable", deps);
  const loaded = await loadContext(input, deps);
  if (loaded === "retry") return { status: "retry_later" };
  return publishStage(submissionId, input, parsed.data, loaded.ctx, deps);
}
