import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Client } from "pg";
import { IDS, seedStationery } from "./helpers";

export const MIGRATION = readFileSync(resolve(process.cwd(), "supabase/migrations/0600_cross_track_fks.sql"), "utf8");
export const ROLLBACK = readFileSync(resolve(process.cwd(), "supabase/rollback/0600_cross_track_fks.down.sql"), "utf8");
export const CHECK = readFileSync(resolve(process.cwd(), "supabase/checks/0600_orphans.sql"), "utf8");

export const FKS = [
  { name: "list_versions_submission_id_fkey", table: "list_versions", del: "n" },
  { name: "list_submissions_school_id_fkey", table: "list_submissions", del: "r" },
  { name: "cart_items_list_item_id_fkey", table: "cart_items", del: "n" },
  { name: "leads_consent_id_fkey", table: "leads", del: "n" },
] as const;
export const INDEXES = [
  "list_versions_submission_id_idx",
  "list_submissions_school_id_idx",
  "cart_items_list_item_id_idx",
  "leads_consent_id_idx",
];

export async function insertSubmission(c: Client, schoolId: string | null, demo = false, owner: string = IDS.parent): Promise<{ id: string; consentId: string }> {
  const id = randomUUID();
  const consentId = randomUUID();
  await c.query("insert into public.consents (id, profile_id, purpose, text_version) values ($1, $2, 'list_upload', 'v1')", [consentId, owner]);
  await c.query(
    `insert into public.list_submissions (id, submitted_by, source, school_id, grade, school_year, storage_path, file_name, mime_type, size_bytes, consent_id, is_demo)
     values ($1, $2, 'parent', $3, '3o ano', 2027, $4, 'lista.pdf', 'application/pdf', 1000, $5, $6)`,
    [id, owner, schoolId, `${owner}/${id}/lista.pdf`, consentId, demo],
  );
  return { id, consentId };
}

export async function insertLead(c: Client, consentId: string | null, demo: boolean, requester: string | null = null): Promise<string> {
  const stationeryId = await seedStationery(c, { status: "active" });
  const muni = (await c.query<{ id: string }>("select id from public.municipalities order by ibge_code limit 1")).rows[0]!.id;
  const r = await c.query<{ id: string }>(
    `insert into public.leads (code, requester_id, list_id, stationery_id, school_name, grade_label, school_year, municipality_id,
       item_count, expires_at, consent_id, consent_text_version, consented_at, idempotency_key, is_demo)
     values ($1, $2, $3, $4, 'Escola', '3o ano', 2027, $5, 1, now() + interval '30 days', $6, 'v1', now(), $7, $8) returning id`,
    [`LC-${randomUUID().replace(/[^0-9A-HJKMNP-TV-Z]/gi, "").toUpperCase().replace(/[ILOU]/g, "2").slice(0, 4).padEnd(4, "2")}`, requester, randomUUID(), stationeryId, muni, consentId, randomUUID(), demo],
  );
  return r.rows[0]!.id;
}

export async function insertCartItem(c: Client, listItemId: string | null, demo: boolean): Promise<string> {
  const cart = (await c.query<{ id: string }>("insert into public.carts (owner_id, is_demo) values ($1, $2) returning id", [IDS.parent, demo])).rows[0]!.id;
  const r = await c.query<{ id: string }>("insert into public.cart_items (cart_id, list_item_id, name, quantity) values ($1, $2, 'Caderno', 1) returning id", [cart, listItemId]);
  return r.rows[0]!.id;
}

