import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attempt, cleanupUsers, IDS, seedUsers, withClaims } from "./helpers";
import { asService, asSuper, item, rpc, seedSubmission, tx } from "./review-fixtures";

const popen = (c: Parameters<typeof rpc>[0], sub: string, owner: string) => rpc(c, "parent_copy_open", "$1::uuid, $2::uuid", [sub, owner]);
const psave = (c: Parameters<typeof rpc>[0], copy: string, owner: string, expected: number, items: unknown) =>
  rpc(c, "parent_copy_save", "$1::uuid, $2::uuid, $3::int, $4::jsonb", [copy, owner, expected, JSON.stringify(items)]);

describe("0204: parent_list_copies e parent_copy_*", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("abre a cópia (itens do resultado, origin extracted), idempotente, e não toca review_versions/ai_decisions/status", async () => {
    await tx(async (c) => {
      const id = await seedSubmission(c, { source: "parent", status: "human_review" });
      await asService(c);
      const a = await popen(c, id, IDS.parent);
      expect(a.error).toBeNull();
      const r = a.rows[0]!.r as { copyId: string; version: number; items: Record<string, unknown>[] };
      expect(r.version).toBe(1);
      expect(r.items).toHaveLength(3);
      expect(r.items[0]).toMatchObject({ name: "Caderno 96 folhas", origin: "extracted" });
      expect(((await popen(c, id, IDS.parent)).rows[0]!.r as { copyId: string }).copyId).toBe(r.copyId);
      expect((await c.query("select count(*)::int as n from public.review_versions where submission_id = $1", [id])).rows[0].n).toBe(0);
      expect((await c.query("select count(*)::int as n from public.ai_decisions where entity_id = $1", [id])).rows[0].n).toBe(0);
      expect((await c.query("select status::text as s from public.list_submissions where id = $1", [id])).rows[0].s).toBe("human_review");
    });
  });

  it("outro dono, envio de escola, sem resultado, resultado inválido e envio inexistente -> P0002", async () => {
    await tx(async (c) => {
      const mine = await seedSubmission(c, { source: "parent" });
      const school = await seedSubmission(c, { source: "school" });
      const semResultado = await seedSubmission(c, { source: "parent", result: null });
      const invalido = await seedSubmission(c, { source: "parent", result: { items: "x" } });
      await asService(c);
      expect((await popen(c, mine, IDS.spare)).code).toBe("P0002");
      expect((await popen(c, mine, IDS.admin)).code).toBe("P0002");
      expect((await popen(c, school, IDS.school_member)).code).toBe("P0002");
      expect((await popen(c, semResultado, IDS.parent)).code).toBe("P0002");
      expect((await popen(c, invalido, IDS.parent)).code).toBe("P0002");
      expect((await popen(c, randomUUID(), IDS.parent)).code).toBe("P0002");
    });
  });

  it("save: versão otimista (saved/stale), dono conferido, itens validados; outro dono -> P0002", async () => {
    await tx(async (c) => {
      const id = await seedSubmission(c, { source: "parent" });
      await asService(c);
      const { copyId } = (await popen(c, id, IDS.parent)).rows[0]!.r as { copyId: string };
      const items = [item({ name: "Caderno meu", origin: "edited" }), item({ name: "Cola", origin: "added" })];
      expect((await psave(c, copyId, IDS.parent, 1, items)).rows[0]!.r).toBe("saved");
      expect((await psave(c, copyId, IDS.parent, 1, items)).rows[0]!.r).toBe("stale");
      expect((await psave(c, copyId, IDS.parent, 2, items)).rows[0]!.r).toBe("saved");
      expect((await psave(c, copyId, IDS.spare, 3, items)).code).toBe("P0002");
      expect((await psave(c, copyId, IDS.parent, 3, [item({ quantity: 0 })])).code).toBe("22023");
      expect((await psave(c, copyId, IDS.parent, 3, [item({ extra: 1 })])).code).toBe("22023");
      expect((await psave(c, randomUUID(), IDS.parent, 1, items)).code).toBe("P0002");
      await asSuper(c);
      const row = (await c.query("select version, items from public.parent_list_copies where id = $1", [copyId])).rows[0];
      expect(row.version).toBe(3);
      expect((row.items as { name: string }[]).map((i) => i.name)).toEqual(["Caderno meu", "Cola"]);
      expect((await c.query("select count(*)::int as n from public.ai_decisions where entity_id = $1", [id])).rows[0].n).toBe(0);
    });
  });

  it("submission_id, owner_id e id são imutáveis; RLS: dono lê a própria; outro perfil e anon não; authenticated não escreve", async () => {
    await tx(async (c) => {
      const id = await seedSubmission(c, { source: "parent" });
      await asService(c);
      const { copyId } = (await popen(c, id, IDS.parent)).rows[0]!.r as { copyId: string };
      await asSuper(c);
      expect((await attempt(c, "update public.parent_list_copies set owner_id = $2 where id = $1", [copyId, IDS.spare])).error).not.toBeNull();
      expect((await attempt(c, "update public.parent_list_copies set submission_id = $2 where id = $1", [copyId, randomUUID()])).error).not.toBeNull();
      expect((await attempt(c, "update public.parent_list_copies set id = $2 where id = $1", [copyId, randomUUID()])).error).not.toBeNull();
      expect((await attempt(c, "update public.parent_list_copies set version = 2 where id = $1", [copyId])).error).toBeNull();
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "authenticated", sub: IDS.parent })]);
      expect((await c.query("select id from public.parent_list_copies")).rowCount).toBe(1);
      expect((await attempt(c, "insert into public.parent_list_copies (submission_id, owner_id, items) values ($1, $2, '[]'::jsonb)", [randomUUID(), IDS.parent])).error).not.toBeNull();
      expect((await attempt(c, "update public.parent_list_copies set items = '[]'::jsonb")).rowCount).toBe(0);
      expect((await attempt(c, "delete from public.parent_list_copies")).error).not.toBeNull();
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "authenticated", sub: IDS.spare })]);
      expect((await c.query("select id from public.parent_list_copies")).rowCount).toBe(0);
      await c.query("reset role");
      await c.query("set local role anon");
      expect((await attempt(c, "select 1 from public.parent_list_copies")).code).toBe("42501");
    });
    await withClaims("parent", async (c) => {
      expect((await attempt(c, "select public.parent_copy_open($1::uuid, $2::uuid)", [randomUUID(), IDS.parent])).code).toBe("42501");
    });
  });
});
