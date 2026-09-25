import type { Client } from "pg";
import { IDS } from "./helpers";

export const SUB = {
  parent: "10000000-0000-4000-8000-000000000001",
  schoolMember: "10000000-0000-4000-8000-000000000002",
} as const;
export const CONSENT = {
  parent: "20000000-0000-4000-8000-000000000001",
  schoolMember: "20000000-0000-4000-8000-000000000002",
} as const;

/** Consentimento + envio (status submitted) de um usuário, gravados como superuser. */
export async function insertSubmission(
  c: Client,
  who: "parent" | "schoolMember",
  status = "submitted",
): Promise<string> {
  const owner = who === "parent" ? IDS.parent : IDS.school_member;
  await c.query(
    `insert into public.consents (id, profile_id, purpose, text_version) values ($1, $2, 'list_upload', 'v1')
     on conflict (id) do nothing`,
    [CONSENT[who], owner],
  );
  await c.query(
    `insert into public.list_submissions
       (id, submitted_by, source, grade, school_year, storage_path, file_name, mime_type, size_bytes, consent_id, status)
     values ($1, $2, 'parent', '3o ano', 2027, $3, 'lista.pdf', 'application/pdf', 1000, $4, $5)`,
    [SUB[who], owner, `${owner}/${SUB[who]}/lista.pdf`, CONSENT[who], status],
  );
  return SUB[who];
}

export async function insertJob(
  c: Client,
  submissionId: string | null,
  key: string,
  opts: { channel?: string; target?: string; status?: string; attempts?: number; maxAttempts?: number } = {},
): Promise<string> {
  const r = await c.query<{ id: string }>(
    `insert into public.jobs (kind, payload, idempotency_key, submission_id, notify_channel, notify_target, status, attempts, max_attempts)
     values ('ocr_jobs', '{}'::jsonb, $1, $2, $3::public.notify_channel, $4, $5::public.job_status, $6, $7) returning id`,
    [key, submissionId, opts.channel ?? "none", opts.target ?? null, opts.status ?? "queued", opts.attempts ?? 0, opts.maxAttempts ?? 5],
  );
  return r.rows[0]!.id;
}

export async function purgeQueues(c: Client): Promise<void> {
  await c.query("select pgmq.purge_queue('ocr_jobs')");
  await c.query("select pgmq.purge_queue('ocr_jobs_dlq')");
}
