import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { StudentError } from "@/features/students/errors";
import { createStudent, deleteStudent, getOwnedStudent, listStudents, updateStudent } from "@/features/students/repository";

import { ensureSchool, withSuperuser } from "../db/helpers";

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
const SCHOOL_ID = "00000000-0000-4000-8000-0000000f1001";

type Actor = { id: string; client: SupabaseClient };
let env: ReturnType<typeof localEnv>;
let admin: SupabaseClient;
let alice: Actor;
let bob: Actor;

async function makeUser(label: string): Promise<Actor> {
  const email = `students-${label}-${Date.now()}@example.test`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`createUser: ${created.error?.message}`);
  const id = created.data.user.id;
  await withSuperuser((c) => c.query(`insert into public.profiles (id, role, display_name) values ($1, 'parent', $2) on conflict (id) do nothing`, [id, `Teste ${label}`]));
  const client = createClient(env.url, env.publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signed.error) throw new Error(`signIn: ${signed.error.message}`);
  return { id, client };
}

beforeAll(async () => {
  env = localEnv();
  admin = createClient(env.url, env.secret, { auth: { persistSession: false, autoRefreshToken: false } });
  alice = await makeUser("alice");
  bob = await makeUser("bob");
  await withSuperuser((c) => ensureSchool(c, SCHOOL_ID));
});

afterAll(async () => {
  await withSuperuser((c) => c.query("delete from public.schools where id = $1", [SCHOOL_ID]));
  for (const actor of [alice, bob]) if (actor) await admin.auth.admin.deleteUser(actor.id);
});

describe("features/students/repository (Postgres local, RLS)", () => {
  it("cria, lista (com escola/série) e edita o próprio aluno", async () => {
    const id = await createStudent(alice.client, alice.id, { nickname: "Maria", schoolId: SCHOOL_ID, gradeSlug: "ef-1", schoolYear: 2027 });
    const rows = await listStudents(alice.client, alice.id);
    expect(rows.find((r) => r.id === id)).toMatchObject({ nickname: "Maria", schoolYear: 2027, gradeSlug: "ef-1", schoolInep: expect.any(String) });
    await updateStudent(alice.client, id, { nickname: "Mari", schoolId: SCHOOL_ID, gradeSlug: "ef-2", schoolYear: 2027 });
    const after = await getOwnedStudent(alice.client, id);
    expect(after).toMatchObject({ nickname: "Mari", gradeSlug: "ef-2" });
    expect(await deleteStudent(alice.client, id)).toBe(true);
    expect(await getOwnedStudent(alice.client, id)).toBeNull();
  });

  it("escola inexistente vira school_not_found; série inexistente vira grade_not_found", async () => {
    await expect(
      createStudent(alice.client, alice.id, { nickname: "Joao", schoolId: "00000000-0000-4000-8000-000000000000", gradeSlug: "ef-1", schoolYear: 2027 }),
    ).rejects.toMatchObject({ code: "school_not_found" } satisfies Partial<StudentError>);
    await expect(
      createStudent(alice.client, alice.id, { nickname: "Joao", schoolId: SCHOOL_ID, gradeSlug: "serie-fantasma", schoolYear: 2027 }),
    ).rejects.toMatchObject({ code: "grade_not_found" } satisfies Partial<StudentError>);
  });

  it("editar/apagar aluno inexistente ou alheio: not_found/false; bob não vê nem edita o aluno da alice", async () => {
    const id = await createStudent(alice.client, alice.id, { nickname: "Rita", schoolId: SCHOOL_ID, gradeSlug: "ef-1", schoolYear: 2027 });
    try {
      expect(await getOwnedStudent(bob.client, id)).toBeNull();
      await expect(
        updateStudent(bob.client, id, { nickname: "Hackeado", schoolId: SCHOOL_ID, gradeSlug: "ef-1", schoolYear: 2027 }),
      ).rejects.toMatchObject({ code: "not_found" } satisfies Partial<StudentError>);
      await expect(
        updateStudent(alice.client, "00000000-0000-4000-8000-0000000000ff", { nickname: "X", schoolId: SCHOOL_ID, gradeSlug: "ef-1", schoolYear: 2027 }),
      ).rejects.toMatchObject({ code: "not_found" } satisfies Partial<StudentError>);
      expect(await deleteStudent(bob.client, id)).toBe(false);
    } finally {
      await deleteStudent(alice.client, id);
    }
  });
});
