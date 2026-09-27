import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SavedListError } from "@/features/saved-lists/errors";
import { listSavedLists, removeSavedList, saveList } from "@/features/saved-lists/repository";
import { createStudent } from "@/features/students/repository";

import { ensureSchool, withSuperuser } from "../db/helpers";
import { seedInState } from "../db/list-fixtures";

// Roda em `pnpm test:db` (Postgres/Supabase local). Mesmo padrão de tests/cart/repository.test.ts.
function localEnv(): { url: string; publishable: string; secret: string } {
  const out = execFileSync("node", ["scripts/supa.mjs", "env"], { encoding: "utf8" });
  const get = (name: string): string => {
    const m = new RegExp(`^${name}=(.+)$`, "m").exec(out);
    if (!m?.[1]) throw new Error(`variável ${name} ausente em supa.mjs env`);
    return m[1].trim();
  };
  const url = get("NEXT_PUBLIC_SUPABASE_URL");
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) throw new Error("repository.test só roda contra Supabase local");
  return { url, publishable: get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), secret: get("SUPABASE_SECRET_KEY") };
}

const PASSWORD = "senha-de-teste-local-123";
const SCHOOL_ID = "00000000-0000-4000-8000-0000000f2001";

type Actor = { id: string; client: SupabaseClient };
let env: ReturnType<typeof localEnv>;
let admin: SupabaseClient;
let alice: Actor;
let bob: Actor;

async function makeUser(label: string): Promise<Actor> {
  const email = `saved-lists-${label}-${Date.now()}@example.test`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`createUser: ${created.error?.message}`);
  const id = created.data.user.id;
  await withSuperuser((c) => c.query(`insert into public.profiles (id, role, display_name) values ($1, 'parent', $2) on conflict (id) do nothing`, [id, `Teste ${label}`]));
  const client = createClient(env.url, env.publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signed.error) throw new Error(`signIn: ${signed.error.message}`);
  return { id, client };
}

async function studentFor(actor: Actor, nickname: string): Promise<string> {
  return createStudent(actor.client, actor.id, { nickname, gradeSlug: "ef-1" });
}

beforeAll(async () => {
  env = localEnv();
  admin = createClient(env.url, env.secret, { auth: { persistSession: false, autoRefreshToken: false } });
  alice = await makeUser("alice");
  bob = await makeUser("bob");
  await withSuperuser((c) => ensureSchool(c, SCHOOL_ID));
});

afterAll(async () => {
  await withSuperuser(async (c) => {
    await c.query("begin");
    await c.query("set local session_replication_role = replica");
    await c.query("delete from public.list_status_events where list_id in (select id from public.school_lists where school_id = $1)", [SCHOOL_ID]);
    await c.query(
      "delete from public.list_items where version_id in (select id from public.list_versions where list_id in (select id from public.school_lists where school_id = $1))",
      [SCHOOL_ID],
    );
    await c.query("delete from public.list_versions where list_id in (select id from public.school_lists where school_id = $1)", [SCHOOL_ID]);
    await c.query("delete from public.school_lists where school_id = $1", [SCHOOL_ID]);
    await c.query("delete from public.schools where id = $1", [SCHOOL_ID]);
    await c.query("commit");
  });
  for (const actor of [alice, bob]) if (actor) await admin.auth.admin.deleteUser(actor.id);
});

describe("features/saved-lists/repository (Postgres local, RLS)", () => {
  it("salva lista publicada, lista de volta com escola/série/aluno, e remove", async () => {
    const { listId } = await withSuperuser((c) => seedInState(c, "published", { schoolId: SCHOOL_ID, slug: "ef-2", year: 2027 }));
    const studentId = await studentFor(alice, "Bia");
    const id = await saveList(alice.client, alice.id, studentId, listId);
    const rows = await listSavedLists(alice.client, alice.id);
    expect(rows.find((r) => r.id === id)).toMatchObject({ studentNickname: "Bia", schoolYear: 2027, gradeSlug: "ef-2" });
    expect(await removeSavedList(alice.client, id)).toBe(true);
    expect((await listSavedLists(alice.client, alice.id)).some((r) => r.id === id)).toBe(false);
  });

  it("lista não publicada vira list_not_published; duplicata vira already_saved", async () => {
    const draft = await withSuperuser((c) => seedInState(c, "draft", { schoolId: SCHOOL_ID, slug: "ef-3", year: 2027 }));
    const studentId = await studentFor(alice, "Caio");
    await expect(saveList(alice.client, alice.id, studentId, draft.listId)).rejects.toMatchObject({ code: "list_not_published" } satisfies Partial<SavedListError>);
    const { listId } = await withSuperuser((c) => seedInState(c, "published", { schoolId: SCHOOL_ID, slug: "ef-4", year: 2027 }));
    await saveList(alice.client, alice.id, studentId, listId);
    await expect(saveList(alice.client, alice.id, studentId, listId)).rejects.toMatchObject({ code: "already_saved" } satisfies Partial<SavedListError>);
  });

  it("bob não vê as listas salvas da alice, nem apaga em nome dela", async () => {
    const { listId } = await withSuperuser((c) => seedInState(c, "published", { schoolId: SCHOOL_ID, slug: "ef-5", year: 2027 }));
    const studentId = await studentFor(alice, "Davi");
    const id = await saveList(alice.client, alice.id, studentId, listId);
    expect((await listSavedLists(bob.client, bob.id)).some((r) => r.id === id)).toBe(false);
    expect(await removeSavedList(bob.client, id)).toBe(false);
    expect((await listSavedLists(alice.client, alice.id)).some((r) => r.id === id)).toBe(true);
  });

  // Correção da revisão de segurança (SECURITY INVOKER): mesmo conhecendo (ou adivinhando) um student_id real de
  // outra família, bob recebe a MESMA recusa de um id totalmente inventado — nenhuma distinção de erro revela se
  // aquele id pertence a alguém (fecha o oráculo que a versão SECURITY DEFINER anterior tinha).
  it("aluno real de outro dono e aluno inventado dão a MESMA recusa (sem oráculo)", async () => {
    const { listId } = await withSuperuser((c) => seedInState(c, "published", { schoolId: SCHOOL_ID, slug: "ef-6", year: 2027 }));
    const aliceStudentId = await studentFor(alice, "Enzo");
    const realForeign = await saveList(bob.client, bob.id, aliceStudentId, listId).catch((e) => e as SavedListError);
    const fake = await saveList(bob.client, bob.id, "00000000-0000-4000-8000-000000000000", listId).catch((e) => e as SavedListError);
    expect(realForeign).toBeInstanceOf(SavedListError);
    expect(fake).toBeInstanceOf(SavedListError);
    expect((realForeign as SavedListError).code).toBe("forbidden");
    expect((fake as SavedListError).code).toBe((realForeign as SavedListError).code);
  });
});
