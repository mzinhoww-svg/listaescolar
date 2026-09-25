import type { Client } from "pg";
import { IDS, withSuperuser, type Identity } from "./helpers";

export const CUIABA_IBGE = "5103403";
export const GOIANIA_IBGE = "5208707";

export const LIST_STATES = [
  "draft", "submitted", "processing", "processing_async", "review_needed",
  "human_review", "approved", "published", "archived", "rejected",
] as const;
export type ListState = (typeof LIST_STATES)[number];

/** Matriz esperada (spec S05), escrita à mão de propósito: é o oráculo independente do SQL. */
export const VALID_TRANSITIONS: Record<ListState, ListState[]> = {
  draft: ["submitted"],
  submitted: ["processing"],
  processing: ["processing_async", "review_needed", "human_review", "approved", "rejected"],
  processing_async: ["processing", "review_needed", "human_review", "approved", "rejected"],
  review_needed: ["human_review", "approved", "rejected"],
  human_review: ["approved", "rejected"],
  approved: ["published"],
  published: ["archived"],
  rejected: ["draft"],
  archived: [],
};

/** Caminho (a partir de draft) até cada estado, para listas ainda não publicadas. */
const PATH: Record<string, ListState[]> = {
  draft: [],
  submitted: ["submitted"],
  processing: ["submitted", "processing"],
  processing_async: ["submitted", "processing", "processing_async"],
  review_needed: ["submitted", "processing", "review_needed"],
  human_review: ["submitted", "processing", "human_review"],
  approved: ["submitted", "processing", "approved"],
  rejected: ["submitted", "processing", "rejected"],
};

const dbRole = (who: Identity) => (who === "anon" ? "anon" : who === "system" ? "service_role" : "authenticated");

/** Troca o papel da transação (seed como superuser antes, leitura com o papel depois). */
export async function switchTo(c: Client, who: Identity): Promise<void> {
  const claims: Record<string, string> = { role: dbRole(who) };
  if (who !== "anon" && who !== "system") claims.sub = who === "system_profile" ? IDS.system : IDS[who];
  await c.query("reset role");
  await c.query(`set local role ${dbRole(who)}`);
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
}

export async function backToSuper(c: Client): Promise<void> {
  await c.query("reset role");
}

export async function seedSchool(c: Client, inep = "51999901", enabled = true): Promise<string> {
  const ibge = enabled ? CUIABA_IBGE : GOIANIA_IBGE;
  if (!enabled) {
    await c.query(
      `insert into public.municipalities (ibge_code, uf, name, is_enabled) values ($1, 'GO', 'Goiânia', false)
       on conflict do nothing`,
      [ibge],
    );
  }
  const r = await c.query<{ id: string }>(
    `insert into public.schools (inep, name, normalized_name, network, municipality_id)
     select $1, 'Escola Lista Teste', 'escola lista teste', 'municipal', m.id
       from public.municipalities m where m.ibge_code = $2 returning id`,
    [inep, ibge],
  );
  return r.rows[0]!.id;
}

export async function seedList(c: Client, schoolId: string, slug = "ef-1", year = 2027): Promise<string> {
  const r = await c.query<{ id: string }>(
    `insert into public.school_lists (school_id, grade_id, school_year, is_demo)
     select $1, g.id, $3, true from public.grades g where g.slug = $2 returning id`,
    [schoolId, slug, year],
  );
  return r.rows[0]!.id;
}

/** Nova versão candidata (via função) com `items` itens. */
export async function seedCandidate(c: Client, listId: string, items = 2): Promise<string> {
  const r = await c.query<{ version_id: string }>(
    "select version_id from public.list_create_candidate_version($1, 'admin', null, null)",
    [listId],
  );
  const versionId = r.rows[0]!.version_id;
  for (let i = 1; i <= items; i++) {
    await c.query(
      `insert into public.list_items (version_id, position, original_name, normalized_name, category, quantity, unit, confidence, alerts)
       values ($1, $2, $3, $4, 'papelaria', 2, 'un', 0.9, '["low_confidence_item"]'::jsonb)`,
      [versionId, i, `Caderno ${i}`, `caderno ${i}`],
    );
  }
  return versionId;
}

export async function transition(c: Client, listId: string, to: ListState, reason: string | null = null): Promise<void> {
  await c.query("select public.list_transition($1, $2::public.list_status, $3, $4)", [listId, to, IDS.admin, reason]);
}

export async function approveVersion(c: Client, listId: string, versionId: string): Promise<void> {
  await c.query("select public.list_approve_version($1, $2, $3)", [listId, versionId, IDS.admin]);
}

/** Aprova a versão e publica (caminho feliz). Para testar recusas use o SQL direto. */
export async function publish(c: Client, listId: string, versionId: string): Promise<void> {
  await approveVersion(c, listId, versionId);
  await c.query("select public.list_publish_version($1, $2, $3)", [listId, versionId, IDS.admin]);
}

/** Leva uma lista nova ao estado pedido. Versão candidata só nos estados anteriores à publicação. */
export async function seedInState(
  c: Client,
  state: ListState,
  opts: { inep?: string; slug?: string; year?: number; schoolId?: string } = {},
): Promise<{ schoolId: string; listId: string; versionId: string }> {
  const schoolId = opts.schoolId ?? (await seedSchool(c, opts.inep));
  const listId = await seedList(c, schoolId, opts.slug, opts.year);
  const versionId = await seedCandidate(c, listId);
  if (state === "published" || state === "archived") {
    for (const s of PATH.approved!) await transition(c, listId, s);
    await publish(c, listId, versionId);
    if (state === "archived") await c.query("select public.list_archive($1, $2, 'teste')", [listId, IDS.admin]);
  } else {
    for (const s of PATH[state]!) await transition(c, listId, s);
  }
  return { schoolId, listId, versionId };
}

/** Remove (como superuser, sem gatilhos) tudo o que um teste com commit criou para o INEP. */
export async function cleanupCommitted(ineps: string[]): Promise<void> {
  await withSuperuser(async (c) => {
    await c.query("begin");
    await c.query("set local session_replication_role = replica");
    const sub = "select id from public.school_lists where school_id in (select id from public.schools where inep = any($1::text[]))";
    await c.query(`delete from public.list_status_events where list_id in (${sub})`, [ineps]);
    await c.query(
      `delete from public.list_items where version_id in (select id from public.list_versions where list_id in (${sub}))`,
      [ineps],
    );
    await c.query(`delete from public.list_versions where list_id in (${sub})`, [ineps]);
    await c.query(`delete from public.school_lists where id in (${sub})`, [ineps]);
    await c.query("delete from public.schools where inep = any($1::text[])", [ineps]);
    await c.query("commit");
  });
}
