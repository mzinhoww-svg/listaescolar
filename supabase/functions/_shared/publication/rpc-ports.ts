// Portas REAIS da publicação (S11): ListPublisher e PublicationContextReader sobre as funções SQL `list_publish_from_pipeline`
// e `publication_context` (cliente de serviço). TypeScript puro: roda no app (Node) e no worker (Deno). Nenhuma escrita em
// school_lists/list_versions/list_items passa por aqui além da chamada da função (transação única no banco).
import { z } from "zod";
import {
  PortError,
  type ContextQuery,
  type ListPublisher,
  type PublicationContextReader,
  type PublishRequest,
  type PublishResult,
} from "./ports.ts";
import type { PublicationContext } from "./types.ts";

/** Fuso do ano letivo (piloto Cuiabá/MT). */
export const SCHOOL_YEAR_TIMEZONE = "America/Cuiaba";
/** Anos válidos = ano corrente e o seguinte (a temporada seguinte começa a ser montada no ano anterior). */
export const SCHOOL_YEAR_LOOKAHEAD = 1;

/** Ano corrente em America/Cuiaba e os `SCHOOL_YEAR_LOOKAHEAD` seguintes (a virada de ano segue o fuso, não o UTC). */
export function resolveSchoolYears(now: Date): number[] {
  const year = Number(new Intl.DateTimeFormat("en-CA", { timeZone: SCHOOL_YEAR_TIMEZONE, year: "numeric" }).format(now));
  return Array.from({ length: SCHOOL_YEAR_LOOKAHEAD + 1 }, (_, i) => year + i);
}

type RpcResult = { data: unknown; error: unknown };
type RpcCall = PromiseLike<RpcResult> & { abortSignal?: (signal: AbortSignal) => PromiseLike<RpcResult> };
/** O que as portas pedem do cliente: `supabase-js` (service role) serve; testes passam um falso. */
export type PortsRpc = { rpc(fn: string, args?: Record<string, unknown>): RpcCall };

/** Erros da função SQL que não adianta repetir (o `hint` é estável; mesmo conjunto da 0601). */
const PERMANENT_HINTS: ReadonlySet<string> = new Set([
  "invalid_request",
  "invalid_items",
  "no_items",
  "invalid_actor",
  "invalid_source",
  "submission_mismatch",
  "sender_not_linked",
  "system_profile_missing",
  "school_not_found",
  "school_suspended",
  "grade_unknown",
  "demo_mismatch",
  "idempotency_conflict",
  "list_archived",
  "list_state_conflict",
]);

const hintOf = (e: unknown): string | null => {
  const h = (e as { hint?: unknown } | null)?.hint;
  return typeof h === "string" && PERMANENT_HINTS.has(h) ? h : null;
};

/** Chama a função respeitando o `signal`: aborta a requisição quando o cliente sabe e sempre solta a espera. Sem eco de mensagem. */
async function call(client: PortsRpc, fn: string, args: Record<string, unknown>, unavailable: string, signal?: AbortSignal): Promise<unknown> {
  if (signal?.aborted) throw new PortError("publish_aborted", true);
  let res: RpcResult;
  try {
    const builder = client.rpc(fn, args);
    const pending: PromiseLike<RpcResult> = signal && typeof builder.abortSignal === "function" ? builder.abortSignal(signal) : builder;
    const aborted = new Promise<never>((_, reject) => signal?.addEventListener("abort", () => reject(new PortError("publish_aborted", true)), { once: true }));
    res = await (signal ? Promise.race([pending, aborted]) : pending);
  } catch (e) {
    if (e instanceof PortError) throw e;
    throw new PortError(unavailable, true);
  }
  if (res.error) {
    const hint = hintOf(res.error);
    if (hint) throw new PortError(hint, false);
    throw new PortError(unavailable, true); // rede, 40001/40P01, timeout, função ausente: vale repetir
  }
  return res.data;
}

const uuid = z.string().uuid();
const publishedSchema = z.object({ listId: uuid, previousVersionId: uuid.nullable(), newVersionId: uuid, replay: z.boolean().optional() }).strict();

export function createRpcListPublisher(client: PortsRpc): ListPublisher {
  return {
    async publish(req: PublishRequest): Promise<PublishResult> {
      const payload = {
        key: req.idempotencyKey,
        submissionId: req.submissionId,
        schoolId: req.schoolId,
        gradeSlug: req.gradeSlug,
        schoolYear: req.schoolYear,
        source: req.source,
        actor: req.actor.kind,
        ...(req.actor.kind === "admin" ? { actorId: req.actor.profileId } : {}),
        items: req.items,
      };
      const data = await call(client, "list_publish_from_pipeline", { p_request: payload }, "publish_unavailable", req.signal);
      const parsed = publishedSchema.safeParse(data);
      if (!parsed.success) throw new PortError("invalid_publish_result", false);
      return { listId: parsed.data.listId, previousVersionId: parsed.data.previousVersionId, newVersionId: parsed.data.newVersionId };
    },
  };
}

const contextSchema = z
  .object({
    school: z.object({ verification: z.enum(["registered", "claimed", "verified", "suspended"]), municipalityEnabled: z.boolean() }).strict().nullable(),
    gradeSlug: z.string().min(1).max(40).nullable(),
    submitterLinked: z.boolean(),
    currentList: z.object({ listId: uuid, status: z.string().min(1).max(40), currentVersionId: uuid.nullable() }).strict().nullable(),
  })
  .strict();

export function createRpcPublicationContextReader(client: PortsRpc, opts: { now?: () => Date } = {}): PublicationContextReader {
  const now = opts.now ?? (() => new Date());
  return {
    async load(q: ContextQuery): Promise<PublicationContext> {
      const data = await call(client, "publication_context", { p_query: { schoolId: q.schoolId, grade: q.grade, schoolYear: q.schoolYear, submittedBy: q.submittedBy } }, "context_unavailable");
      const parsed = contextSchema.safeParse(data);
      if (!parsed.success) throw new PortError("context_invalid", false);
      const c = parsed.data;
      return { school: c.school, gradeSlug: c.gradeSlug, validSchoolYears: resolveSchoolYears(now()), submitterLinked: c.submitterLinked, currentList: c.currentList };
    },
  };
}

/** As duas portas reais da publicação sobre o mesmo cliente de serviço. */
export function createRpcPublicationPorts(client: PortsRpc, opts: { now?: () => Date } = {}): { publisher: ListPublisher; context: PublicationContextReader } {
  return { publisher: createRpcListPublisher(client), context: createRpcPublicationContextReader(client, opts) };
}
