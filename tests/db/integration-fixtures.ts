import { createHash, randomUUID } from "node:crypto";
import type { Client } from "pg";
import { ensureSchool, IDS, withSuperuser } from "./helpers";
import { asService, rpc } from "./review-fixtures";

export const SYSTEM_ID = "00000000-0000-4000-8000-00000000c0de";

export const pubItem = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  position: 1,
  originalName: "Caderno",
  normalizedName: "caderno",
  category: "papelaria",
  quantity: 2,
  unit: "un",
  confidence: 0.9,
  ...over,
});

/** Pedido de `list_publish_from_pipeline` (ator sistema por padrão). */
export function pubRequest(over: Record<string, unknown> = {}): Record<string, unknown> {
  const id = randomUUID();
  return { key: id, submissionId: id, schoolId: randomUUID(), gradeSlug: "ef-4", schoolYear: 2027, source: "school_upload", actor: "system", items: [pubItem()], ...over };
}

/** Uuid determinístico a partir de um texto (o harness real reescreve ids fixos do contrato por escola/série/ano). */
export const uuidFrom = (text: string): string => {
  const h = createHash("sha256").update(text).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

/**
 * Envio publicável pelo ator system (S11 · revisão de segurança): envio da ESCOLA (source school), mesma escola, série e ano, com o
 * remetente vinculado em school_members. Idempotente; o remetente padrão é `school_member`.
 */
export async function ensurePublishableSubmission(c: Client, o: { id: string; schoolId: string; gradeSlug: string; schoolYear: number; ownerId?: string }): Promise<string> {
  const owner = o.ownerId ?? IDS.school_member;
  const grade = (await c.query("select name from public.grades where slug = $1", [o.gradeSlug])).rows[0]?.name as string | undefined;
  if (!grade) return o.id; // série desconhecida: o teste quer justamente o erro da função
  await c.query("insert into public.school_members (school_id, profile_id, member_role) values ($1, $2, 'co_admin') on conflict do nothing", [o.schoolId, owner]);
  if ((await c.query("select 1 from public.list_submissions where id = $1", [o.id])).rowCount) return o.id;
  const consent = randomUUID();
  await c.query("insert into public.consents (id, profile_id, purpose, text_version) values ($1, $2, 'list_upload', 'v1')", [consent, owner]);
  await c.query(
    `insert into public.list_submissions (id, submitted_by, source, school_id, grade, school_year, storage_path, file_name, mime_type, size_bytes, consent_id)
     values ($1, $2, 'school', $3, $4, $5, $6, 'l.pdf', 'application/pdf', 1000, $7)`,
    [o.id, owner, o.schoolId, grade, o.schoolYear, `${owner}/${o.id}/l.pdf`, consent],
  );
  return o.id;
}

/** Publica pela função SQL (service_role dentro da transação do teste). O schoolId precisa existir (`ensureSchool`). */
export async function publishSql(c: Client, req: Record<string, unknown>) {
  await asService(c);
  return rpc(c, "list_publish_from_pipeline", "$1::jsonb", [JSON.stringify(req)]);
}

export type Published = { listId: string; previousVersionId: string | null; newVersionId: string; replay: boolean };

/** Escola + publicação bem-sucedida; devolve o pedido e o resultado. Sai do papel de serviço no fim. */
export async function publishOk(c: Client, over: Record<string, unknown> = {}): Promise<{ req: Record<string, unknown>; out: Published }> {
  await c.query("reset role");
  const schoolId = (over.schoolId as string | undefined) ?? (await ensureSchool(c));
  const req = pubRequest({ schoolId, ...over });
  if (req.actor === "system") {
    await ensurePublishableSubmission(c, { id: req.submissionId as string, schoolId, gradeSlug: req.gradeSlug as string, schoolYear: req.schoolYear as number });
  }
  const r = await publishSql(c, req);
  if (r.error) throw new Error(`publish: ${r.error}`);
  await c.query("reset role");
  return { req, out: r.rows[0]!.r as Published };
}

export const adminReq = { actor: "admin", actorId: IDS.admin };

/** Apaga escolas de teste confirmadas (commit) e tudo que pende delas; eventos são imutáveis, então só com replica, em banco local. */
export async function purgeSchools(schoolIds: readonly string[]): Promise<void> {
  if (schoolIds.length === 0) return;
  await withSuperuser(async (c) => {
    await c.query("begin");
    await c.query("set local session_replication_role = replica");
    const lists = (await c.query("select id from public.school_lists where school_id = any($1::uuid[])", [schoolIds])).rows.map((r) => r.id as string);
    const versions = (await c.query("select id from public.list_versions where list_id = any($1::uuid[])", [lists])).rows.map((r) => r.id as string);
    await c.query("delete from public.list_items where version_id = any($1::uuid[])", [versions]);
    await c.query("delete from public.list_status_events where list_id = any($1::uuid[])", [lists]);
    await c.query("delete from public.list_versions where id = any($1::uuid[])", [versions]);
    await c.query("delete from public.school_lists where id = any($1::uuid[])", [lists]);
    await c.query("delete from public.school_members where school_id = any($1::uuid[])", [schoolIds]);
    await c.query("delete from public.schools where id = any($1::uuid[])", [schoolIds]);
    await c.query("commit");
  });
}
