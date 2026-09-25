import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { withSuperuser } from "./helpers";

const created: string[] = [];

async function signUp(meta: Record<string, unknown> | null): Promise<string> {
  const id = randomUUID();
  created.push(id);
  await withSuperuser((c) =>
    c.query(
      `insert into auth.users (id, aud, role, email, raw_user_meta_data) values ($1, 'authenticated', 'authenticated', $2, $3)`,
      [id, `${id}@teste.invalid`, meta === null ? null : JSON.stringify(meta)],
    ),
  );
  return id;
}

async function profile(id: string) {
  return withSuperuser(async (c) => (await c.query("select * from public.profiles where id = $1", [id])).rows);
}

afterEach(async () => {
  await withSuperuser((c) => c.query("delete from auth.users where id = any($1::uuid[])", [created.splice(0)]));
});

describe("handle_new_user", () => {
  it("cria profile parent no signup", async () => {
    const id = await signUp(null);
    const rows = await profile(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("parent");
    expect(rows[0].display_name).toBeNull();
  });
  it("não promove por raw_user_meta_data.role", async () => {
    const id = await signUp({ role: "admin" });
    expect((await profile(id))[0].role).toBe("parent");
  });
  it("display_name vem de full_name, depois name", async () => {
    expect((await profile(await signUp({ full_name: "Ana Souza", name: "Outro" })))[0].display_name).toBe("Ana Souza");
    expect((await profile(await signUp({ name: "Bia" })))[0].display_name).toBe("Bia");
    expect((await profile(await signUp({ full_name: "  " })))[0].display_name).toBeNull();
  });
  it("re-trigger não duplica nem rebaixa papel", async () => {
    const id = await signUp(null);
    await withSuperuser(async (c) => {
      await c.query("update public.profiles set role = 'admin' where id = $1", [id]);
      await c.query("update auth.users set email = $2 where id = $1", [id, `${id}@outro.invalid`]);
    });
    const rows = await profile(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("admin");
  });
  it("aparece no audit_log", async () => {
    const id = await signUp(null);
    const rows = await withSuperuser(
      async (c) =>
        (await c.query("select action, after from public.audit_log where entity_table='profiles' and entity_id=$1", [id]))
          .rows,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("INSERT");
    expect(rows[0].after.role).toBe("parent");
  });
  it("função não é executável por anon/authenticated/service_role", async () => {
    const rows = await withSuperuser(
      async (c) =>
        (
          await c.query(
            `select r, has_function_privilege(r, 'public.handle_new_user()', 'execute') as ok
             from unnest(array['anon','authenticated','service_role']) r`,
          )
        ).rows,
    );
    for (const r of rows) expect(r.ok).toBe(false);
  });
});
