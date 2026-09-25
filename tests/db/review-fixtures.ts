import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { attempt, IDS, withSuperuser } from "./helpers";

export const ALERTS = [
  "low_confidence_item",
  "ambiguous_item",
  "handwritten",
  "possible_collective_item",
  "restrictive_brand_or_spec",
  "text_document_mismatch",
  "invalid_school_grade_year",
] as const;

export type SeedOpts = {
  status?: string;
  source?: "school" | "parent";
  owner?: "parent" | "school_member";
  schoolId?: string | null;
  grade?: string | null;
  year?: number | null;
  result?: unknown | null;
  demo?: boolean;
};

export const RESULT = {
  items: [
    { name: "Caderno 96 folhas", quantity: 2, unit: "un", confidence: 0.92, category: "papelaria", alerts: [] },
    { name: "Lápis preto", quantity: null, unit: null, confidence: 0.4, category: "escrita", alerts: ["low_confidence_item"] },
    { name: "Régua < 5 anos", quantity: 1.5, unit: "un", confidence: 0.7 },
  ],
  overallConfidence: 0.7,
  warnings: [],
  alerts: ["handwritten"],
};

/** Envio + job + ocr_jobs gravados como superuser (mesma conexão/transação). Devolve o id do envio. */
export async function seedSubmission(c: Client, o: SeedOpts = {}): Promise<string> {
  const id = randomUUID();
  const consent = randomUUID();
  const ownerKey = o.owner ?? (o.source === "parent" ? "parent" : "school_member");
  const owner = IDS[ownerKey];
  await c.query("insert into public.consents (id, profile_id, purpose, text_version) values ($1, $2, 'list_upload', 'v1')", [consent, owner]);
  await c.query(
    `insert into public.list_submissions (id, submitted_by, source, school_id, grade, school_year, storage_path, file_name, mime_type, size_bytes, consent_id)
     values ($1, $2, $3::public.submission_source, $4, $5, $6, $7, 'lista-secreta.pdf', 'application/pdf', 1000, $8)`,
    [
      id,
      owner,
      o.source ?? "school",
      o.schoolId === undefined ? randomUUID() : o.schoolId,
      o.grade === undefined ? "4º ano" : o.grade,
      o.year === undefined ? 2027 : o.year,
      `${owner}/${id}/lista.pdf`,
      consent,
    ],
  );
  await c.query("update public.list_submissions set status = $2::public.list_status, is_demo = $3 where id = $1", [id, o.status ?? "human_review", o.demo ?? false]);
  const result = o.result === undefined ? RESULT : o.result;
  if (result !== null) {
    const job = await c.query<{ id: string }>(
      "insert into public.jobs (kind, payload, idempotency_key, submission_id) values ('ocr_jobs', '{}'::jsonb, $1, $2) returning id",
      [`k-${id}`, id],
    );
    await c.query("insert into public.ocr_jobs (job_id, submission_id, result) values ($1, $2, $3::jsonb)", [job.rows[0]!.id, id, JSON.stringify(result)]);
  }
  return id;
}

export const item = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: "Caderno",
  quantity: 2,
  unit: "un",
  category: "papelaria",
  confidence: 0.9,
  alerts: [],
  origin: "extracted",
  ...over,
});

/** Transação superuser que sempre faz rollback (sem papel). */
export async function tx(fn: (c: Client) => Promise<void>): Promise<void> {
  await withSuperuser(async (c) => {
    await c.query("begin");
    try {
      await fn(c);
    } finally {
      await c.query("rollback");
    }
  });
}

export const asService = (c: Client) => c.query("set local role service_role");
export const asSuper = (c: Client) => c.query("reset role");

export const rpc = (c: Client, fn: string, sig: string, args: unknown[]) =>
  attempt(c, `select public.${fn}(${sig}) as r`, args);
export const open = (c: Client, sub: string, actor: string = IDS.admin) => rpc(c, "review_open", "$1::uuid, $2::uuid", [sub, actor]);
export const save = (c: Client, sub: string, expected: number, payload: unknown, actor: string = IDS.admin) =>
  rpc(c, "review_save_version", "$1::uuid, $2::uuid, $3::int, $4::jsonb", [sub, actor, expected, JSON.stringify(payload)]);
/** Padrão: a RESULT semeada tem alerta crítico (handwritten está na configuração padrão), então o padrão confirma. */
export const ACK = ["critical_alerts_acknowledged"];
export const approve = (c: Client, sub: string, expected: number, reasons: string[] = ACK, actor: string = IDS.admin) =>
  rpc(c, "review_approve", "$1::uuid, $2::uuid, $3::int, $4::jsonb", [sub, actor, expected, JSON.stringify(reasons)]);
export const reject = (c: Client, sub: string, expected: number, reason = "illegible_document", actor: string = IDS.admin) =>
  rpc(c, "review_reject", "$1::uuid, $2::uuid, $3::int, $4::text", [sub, actor, expected, reason]);
export const begin = (c: Client, sub: string, actor: string = IDS.admin) => rpc(c, "review_begin_publish", "$1::uuid, $2::uuid, 120", [sub, actor]);
export const complete = (c: Client, sub: string, result: unknown, actor: string = IDS.admin) =>
  rpc(c, "review_complete_publish", "$1::uuid, $2::uuid, $3::jsonb", [sub, actor, JSON.stringify(result)]);
export const release = (c: Client, sub: string, actor: string = IDS.admin) => rpc(c, "review_release_publish", "$1::uuid, $2::uuid", [sub, actor]);
export const failPublish = (c: Client, sub: string, reason: string, actor: string = IDS.admin) =>
  rpc(c, "review_publish_fail", "$1::uuid, $2::uuid, $3::text", [sub, actor, reason]);

export const statusOf = async (c: Client, id: string) =>
  (await c.query("select status::text as s from public.list_submissions where id = $1", [id])).rows[0]!.s as string;
export const reviewRows = async (c: Client, id: string) =>
  (
    await c.query(
      "select kind, decision, actor_id, previous_version_id, new_version_id, justification, reasons, provider, model from public.ai_decisions where entity_id = $1 and kind = 'review' order by created_at, id",
      [id],
    )
  ).rows as Record<string, unknown>[];

/** Apaga envio(s) confirmados por um teste e as linhas ai_decisions deles (append-only: só em banco local de teste). */
export async function purgeSubmissions(ids: readonly string[]): Promise<void> {
  await withSuperuser(async (c) => {
    await c.query("begin");
    await c.query("alter table public.ai_decisions disable trigger ai_decisions_no_update_delete");
    await c.query("delete from public.ai_decisions where entity_id = any($1::uuid[])", [ids]);
    await c.query("alter table public.ai_decisions enable always trigger ai_decisions_no_update_delete");
    await c.query("delete from public.list_submissions where id = any($1::uuid[])", [ids]);
    await c.query("commit");
  });
}
