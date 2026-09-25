// PublicationStore sobre as funções `publication_*` da 0203 (cliente de serviço). Respostas validadas com Zod;
// erro da chamada lança PortError transitório (sem eco da mensagem do banco).
import { z } from "zod";
import { PortError, type PendingRow, type PublicationStore, type StoredInput } from "./ports.ts";

export type PublicationRawRpc = {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

const uuid = z.string().uuid();
const inputSchema = z.object({
  status: z.string().min(1).max(40),
  source: z.enum(["parent", "school"]),
  school_id: uuid.nullable(),
  submitted_by: uuid,
  grade: z.string().nullable(),
  school_year: z.number().int().nullable(),
  is_demo: z.boolean(),
  result: z.unknown().nullable(),
});
const pendingSchema = z.array(z.object({ submission_id: uuid, state: z.enum(["decide", "publish"]), updated_at: z.string() })).max(50);

async function call(client: PublicationRawRpc, fn: string, args: Record<string, unknown>): Promise<unknown> {
  let res: { data: unknown; error: unknown };
  try {
    res = await client.rpc(fn, args);
  } catch {
    throw new PortError("store_unavailable", true);
  }
  if (res.error) {
    // 22023 = argumento recusado pela função (bug do chamador): não adianta repetir.
    const code = (res.error as { code?: unknown }).code;
    throw new PortError("store_error", code !== "22023");
  }
  return res.data;
}

const oneOf = <T extends string>(values: readonly T[]) => z.enum(values as [T, ...T[]]);

async function typed<T extends string>(client: PublicationRawRpc, fn: string, args: Record<string, unknown>, values: readonly T[]): Promise<T> {
  const parsed = oneOf(values).safeParse(await call(client, fn, args));
  if (!parsed.success) throw new PortError("store_invalid_response", true);
  return parsed.data;
}

export function createRpcPublicationStore(client: PublicationRawRpc): PublicationStore {
  return {
    async loadInput(submissionId) {
      const parsed = inputSchema.safeParse(await call(client, "publication_load_input", { p_submission_id: submissionId }));
      if (!parsed.success) throw new PortError("store_invalid_response", true);
      const r = parsed.data;
      return {
        status: r.status,
        source: r.source,
        schoolId: r.school_id,
        submittedBy: r.submitted_by,
        grade: r.grade,
        schoolYear: r.school_year,
        isDemo: r.is_demo,
        result: r.result ?? null,
      } satisfies StoredInput;
    },
    recordVerdict: (submissionId, verdict) =>
      typed(client, "publication_record_verdict", { p_submission_id: submissionId, p_verdict: verdict }, ["recorded", "already_decided", "not_ready"] as const),
    beginPublish: (submissionId, leaseSeconds) =>
      typed(client, "publication_begin_publish", { p_submission_id: submissionId, p_lease_seconds: leaseSeconds }, ["leased", "busy", "already_completed", "not_approved"] as const),
    complete: (submissionId, result) =>
      typed(
        client,
        "publication_complete",
        { p_submission_id: submissionId, p_result: { new_version_id: result.newVersionId, previous_version_id: result.previousVersionId } },
        ["completed", "already_completed", "not_approved", "orphaned"] as const,
      ),
    fail: (submissionId, reason) => typed(client, "publication_fail", { p_submission_id: submissionId, p_reason: reason }, ["failed", "already_failed", "not_approved"] as const),
    expire: (submissionId, minAgeSeconds) =>
      typed(client, "publication_expire", { p_submission_id: submissionId, p_min_age_seconds: minAgeSeconds }, ["failed", "in_progress", "not_due", "already_failed", "not_approved"] as const),
    async pending(limit, minAgeSeconds) {
      const parsed = pendingSchema.safeParse(await call(client, "publication_pending", { p_limit: limit, p_min_age_seconds: minAgeSeconds }));
      if (!parsed.success) throw new PortError("store_invalid_response", true);
      return parsed.data.map((r): PendingRow => ({ submissionId: r.submission_id, state: r.state, updatedAt: r.updated_at }));
    },
  };
}
