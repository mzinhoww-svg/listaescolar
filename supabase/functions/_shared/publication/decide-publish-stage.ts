// Publicação: lease -> porta -> registro (a etapa que chama `ListPublisher`). Extraído de decide.ts (D-057, S18,
// arquivo com 301 linhas) — comportamento idêntico ao original.
import type { ExtractionResult } from "../extraction-schema.ts";
import {
  PortError,
  asPortError,
  publishResultSchema,
  type ListPublisher,
  type PublishItem,
  type PublishRequest,
  type PublishResult,
  type StoredInput,
} from "./ports.ts";
import type { PublicationContext } from "./types.ts";
import type { DecideResult, PublicationDeps } from "./decide.ts";

/** Janela da lease da chamada à porta; maior que o teto da chamada, para o expirador nunca a atropelar. */
export const PUBLISH_LEASE_SECONDS = 120;
/** Teto de uma chamada à porta. */
export const PUBLISH_TIMEOUT_MS = 45_000;
/** Com menos que isto do prazo do tick, a porta não é chamada (fica `approved`; o varredor do próximo tick retoma). */
export const MIN_PUBLISH_WINDOW_MS = 5_000;

const REASON_ALPHABET = /^[a-z][a-z0-9_]{0,59}$/;

/** Itens do resultado validado para a porta (nomes de material; nada de dado pessoal). */
function toPublishItems(r: ExtractionResult): PublishItem[] | null {
  const out: PublishItem[] = [];
  for (const [i, it] of r.items.entries()) {
    if (!it.normalizedName || !it.category || it.quantity === null) return null;
    out.push({ position: i + 1, originalName: it.name, normalizedName: it.normalizedName, category: it.category, quantity: it.quantity, unit: it.unit, confidence: it.confidence });
  }
  return out;
}

function alert(deps: PublicationDeps, code: string, submissionId: string): void {
  try {
    deps.onAlert?.({ code, submissionId });
  } catch {
    // o alerta nunca derruba a decisão
  }
}

/**
 * Chama a porta com teto de tempo e `AbortSignal`; estouro = erro transitório (a chamada em voo é idempotente pela
 * chave). Resultado que chega DEPOIS do teto não se perde: `settleLate` conclui (envio ainda `approved`) ou registra
 * `publish_orphaned` (já expirou) e sempre alerta.
 */
async function publishWithTimeout(
  id: string,
  publisher: ListPublisher,
  req: PublishRequest,
  timeoutMs: number,
  deps: PublicationDeps,
) {
  const abort = new AbortController();
  const timer = new AbortController();
  let timedOut = false;
  const call = Promise.resolve().then(() => publisher.publish({ ...req, signal: abort.signal }));
  const timeout = deps.clock.delay(timeoutMs, timer.signal).then((): never => {
    timedOut = true;
    abort.abort();
    throw new PortError("publish_timeout", true);
  });
  try {
    return await Promise.race([call, timeout]);
  } catch (e) {
    if (timedOut) call.then((late) => settleLate(id, late, deps), () => undefined);
    throw e;
  } finally {
    timer.abort();
  }
}

/** Resultado tardio: valida, conclui pelo `complete` (que já decide entre `completed` e `orphaned`) e alerta. */
async function settleLate(id: string, late: unknown, deps: PublicationDeps): Promise<void> {
  try {
    const parsed = publishResultSchema.safeParse(late);
    if (!parsed.success) return alert(deps, "publish_result_invalid", id);
    const done = await deps.store.complete(id, { newVersionId: parsed.data.newVersionId, previousVersionId: parsed.data.previousVersionId });
    alert(deps, done === "orphaned" ? "published_after_failure" : done === "not_approved" ? "published_not_recorded" : "publish_result_late", id);
  } catch {
    alert(deps, "publish_result_late_unrecorded", id);
  }
}

export async function failStage(id: string, reason: string, deps: PublicationDeps): Promise<DecideResult> {
  const r = await deps.store.fail(id, reason);
  return r === "failed" || r === "already_failed" ? { status: "publish_failed", reason } : { status: "already_decided" };
}

/** Publicação: lease -> porta -> registro. O veredito `auto_publish` já está gravado (envio `approved`). */
export async function publishStage(
  id: string,
  input: StoredInput,
  r: ExtractionResult,
  ctx: PublicationContext | null,
  deps: PublicationDeps,
  deadlineAt: number | null,
): Promise<DecideResult> {
  const { store, publisher } = deps;
  const items = toPublishItems(r);
  if (!publisher) return failStage(id, "publisher_unavailable", deps);
  if (!ctx?.gradeSlug || input.schoolId === null || input.schoolYear === null) return failStage(id, "context_unavailable", deps);
  if (!items || items.length === 0) return failStage(id, "invalid_extraction_result", deps);

  const timeoutMs = deadlineAt === null ? PUBLISH_TIMEOUT_MS : Math.min(PUBLISH_TIMEOUT_MS, deadlineAt - deps.clock.now());
  if (timeoutMs < MIN_PUBLISH_WINDOW_MS) return { status: "publish_pending" }; // sem folga no tick: o varredor retoma

  const lease = await store.beginPublish(id, PUBLISH_LEASE_SECONDS);
  if (lease === "busy") return { status: "publish_pending" };
  if (lease !== "leased") return { status: "already_decided" };

  let out: PublishResult;
  try {
    out = await publishWithTimeout(
      id,
      publisher,
      { idempotencyKey: id, submissionId: id, schoolId: input.schoolId, gradeSlug: ctx.gradeSlug, schoolYear: input.schoolYear, source: "school_upload", actor: { kind: "system" }, items },
      timeoutMs,
      deps,
    );
  } catch (e) {
    const known = asPortError(e);
    if (known && !known.transient) return failStage(id, REASON_ALPHABET.test(known.code) ? known.code : "publish_rejected", deps);
    return { status: "publish_pending" }; // transitório ou desconhecido: o varredor repete; a lease vence sozinha
  }
  const checked = publishResultSchema.safeParse(out);
  if (!checked.success) {
    alert(deps, "publish_result_invalid", id);
    return failStage(id, "invalid_publish_result", deps);
  }
  out = checked.data;
  const done = await store.complete(id, { newVersionId: out.newVersionId, previousVersionId: out.previousVersionId });
  if (done === "orphaned" || done === "not_approved") {
    // A porta publicou, mas o envio já não está `approved` (o expirador venceu a corrida ou o estado mudou).
    alert(deps, done === "orphaned" ? "published_after_failure" : "published_not_recorded", id);
    return { status: "publish_orphaned", newVersionId: out.newVersionId };
  }
  return { status: "auto_published", listId: out.listId, previousVersionId: out.previousVersionId, newVersionId: out.newVersionId };
}
