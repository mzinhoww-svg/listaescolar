// Carrinho: o dono não edita is_demo, list_kind, list_id nem owner_id (grant de UPDATE por coluna); leads herdam list_kind por
// gatilho `enable always` sem SECURITY DEFINER (S11 · revisão de segurança).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attempt, cleanupUsers, IDS, seedUsers, withClaims, withSuperuser } from "./helpers";

beforeAll(seedUsers);
afterAll(cleanupUsers);

describe("carts: UPDATE do dono só nas colunas legítimas", () => {
  it("is_demo, list_kind, list_id, owner_id e strategy inválida: permission denied (42501) e nada muda", async () => {
    await withClaims("parent", async (c) => {
      const id = (await c.query("insert into public.carts (owner_id, is_demo) values ($1, true) returning id", [IDS.parent])).rows[0].id as string;
      for (const set of ["is_demo = false", "list_kind = 'official'", "list_id = gen_random_uuid()", "owner_id = '" + IDS.school_member + "'"]) {
        expect((await attempt(c, `update public.carts set ${set} where id = $1`, [id])).code, set).toBe("42501");
      }
      const row = (await c.query("select is_demo, list_kind, owner_id from public.carts where id = $1", [id])).rows[0];
      expect(row).toMatchObject({ is_demo: true, list_kind: "demo", owner_id: IDS.parent });
    });
  });

  it("o fluxo legítimo continua: estratégia, retrato das opções e itens (quantidade e nome)", async () => {
    await withClaims("parent", async (c) => {
      const id = (await c.query("insert into public.carts (owner_id) values ($1) returning id", [IDS.parent])).rows[0].id as string;
      const item = (await c.query("insert into public.cart_items (cart_id, name, quantity) values ($1, 'Caderno', 1) returning id", [id])).rows[0].id as string;
      expect((await attempt(c, "update public.carts set strategy = 'balanced', options_snapshot = '{\"ok\":1}'::jsonb where id = $1", [id])).error).toBeNull();
      expect((await attempt(c, "update public.cart_items set quantity = 3 where id = $1", [item])).error).toBeNull();
      expect((await c.query("select strategy::text as s from public.carts where id = $1", [id])).rows[0].s).toBe("balanced");
    });
  });

  it("o service_role (servidor) segue podendo gravar list_kind e is_demo", async () => {
    await withSuperuser(async (c) => {
      await c.query("begin");
      await c.query("set local role service_role");
      const r = await attempt(c, "insert into public.carts (owner_id, is_demo, list_kind) values ($1, false, 'official') returning id", [IDS.parent]);
      expect(r.error).toBeNull();
      await c.query("rollback");
    });
  });
});

describe("leads_set_list_kind", () => {
  it("gatilho ativo mesmo com session_replication_role = replica (enable always) e sem SECURITY DEFINER", async () => {
    await withSuperuser(async (c) => {
      const t = (await c.query("select tgenabled from pg_trigger where tgname = 'leads_set_list_kind'")).rows[0];
      expect(t.tgenabled).toBe("A");
      const f = (await c.query("select prosecdef from pg_proc where oid = 'public.leads_set_list_kind()'::regprocedure")).rows[0];
      expect(f.prosecdef).toBe(false);
    });
  });
});
