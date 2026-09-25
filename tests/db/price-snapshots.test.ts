import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attempt, cleanupUsers, inTx, seedUsers, withClaims, withSuperuser, type Identity } from "./helpers";

const INSERT = (extra = "") => `
  insert into public.price_snapshots (retailer_id, item_key, price_cents, source, checked_at ${extra ? "," + extra.split("|")[0] : ""})
  select id, 'caderno 96 folhas', $1, $2, $3 ${extra ? "," + extra.split("|")[1] : ""} from public.retailers where slug = 'kalunga'`;

describe("S12 price_snapshots: sem origem e data não existe preço", () => {
  beforeAll(async () => {
    await seedUsers();
    await withSuperuser((c) =>
      c.query(
        `insert into public.price_snapshots (retailer_id, item_key, price_cents, source, checked_at, is_demo)
         select id, 'lapis hb', 250, 'demo', now(), true from public.retailers where slug = 'magalu'`,
      ),
    );
  });
  afterAll(async () => {
    await withSuperuser((c) => c.query("delete from public.price_snapshots where item_key in ('lapis hb', 'caderno 96 folhas')"));
    await cleanupUsers();
  });

  it("insere snapshot válido (currency default BRL, is_demo default false)", async () => {
    await withSuperuser(async (c) => {
      await c.query("begin");
      try {
        const r = await c.query(`${INSERT()} returning currency, is_demo`, [1990, "manual_admin", new Date()]);
        expect(r.rows[0]).toEqual({ currency: "BRL", is_demo: false });
      } finally {
        await c.query("rollback");
      }
    });
  });
  it("recusa source nulo, vazio e só espaços", async () => {
    await inTx(async (c) => {
      for (const src of [null, "", "   "]) {
        const r = await attempt(c, INSERT(), [1990, src, new Date()]);
        expect(r.error, String(src)).not.toBeNull();
      }
    });
  });
  it("recusa checked_at nulo", async () => {
    await inTx(async (c) => {
      expect((await attempt(c, INSERT(), [1990, "manual_admin", null])).error).not.toBeNull();
    });
  });
  it("recusa preço nulo, zero e negativo", async () => {
    await inTx(async (c) => {
      for (const p of [null, 0, -1]) {
        expect((await attempt(c, INSERT(), [p, "manual_admin", new Date()])).error, String(p)).not.toBeNull();
      }
    });
  });
  it("recusa item_key vazio e product_url que não seja https", async () => {
    await inTx(async (c) => {
      const a = await attempt(c, `insert into public.price_snapshots (retailer_id, item_key, price_cents, source, checked_at)
        select id, '', 100, 'manual_admin', now() from public.retailers where slug = 'kalunga'`);
      expect(a.error).not.toBeNull();
      const b = await attempt(c, INSERT("product_url|$4"), [100, "manual_admin", new Date(), "javascript:alert(1)"]);
      expect(b.error).not.toBeNull();
    });
  });

  it("recusa checked_at no futuro (> 5 min) e aceita agora", async () => {
    await inTx(async (c) => {
      expect((await attempt(c, INSERT(), [1990, "manual_admin", new Date(Date.now() + 3600_000)])).error).not.toBeNull();
      expect((await attempt(c, INSERT(), [1990, "manual_admin", new Date(Date.now() + 60_000)])).error).toBeNull();
    });
  });
  it("source demo exige is_demo e vice-versa", async () => {
    await inTx(async (c) => {
      expect((await attempt(c, INSERT("is_demo|true"), [1990, "manual_admin", new Date()])).error).not.toBeNull();
      expect((await attempt(c, INSERT("is_demo|false"), [1990, "demo", new Date()])).error).not.toBeNull();
      expect((await attempt(c, INSERT("is_demo|true"), [1990, "demo", new Date()])).error).toBeNull();
      expect((await attempt(c, INSERT("is_demo|false"), [1990, "manual_admin", new Date()])).error).toBeNull();
    });
  });
  it("inserir/alterar snapshot gera linhas em audit_log", async () => {
    await inTx(async (c) => {
      const ins = await c.query(`${INSERT()} returning id`, [1990, "manual_admin", new Date()]);
      const id = ins.rows[0]?.id;
      await c.query("update public.price_snapshots set price_cents = 2000 where id = $1", [id]);
      const r = await c.query("select action from public.audit_log where entity_table = 'price_snapshots' and entity_id = $1", [id]);
      expect(r.rows.map((x) => x.action).sort()).toEqual(["INSERT", "UPDATE"]);
    });
  });
  it("perfil system (authenticated, não service_role) escreve snapshots", async () => {
    await withClaims("system_profile", async (c) => {
      expect((await attempt(c, INSERT(), [1990, "manual_admin", new Date()])).error).toBeNull();
      expect((await attempt(c, "update public.price_snapshots set price_cents = 2000 where item_key = 'caderno 96 folhas'")).rowCount).toBe(1);
    });
  });

  for (const who of ["anon", "parent", "school_member", "stationery_member", "orphan", "admin", "system"] as Identity[]) {
    it(`${who} lê snapshots (dado de comparação, com origem)`, async () => {
      await withClaims(who, async (c) => {
        const r = await attempt(c, "select source, checked_at from public.price_snapshots");
        expect(r.error).toBeNull();
        expect(r.rows.length).toBeGreaterThan(0);
        expect(r.rows.every((x) => x.source && x.checked_at)).toBe(true);
      });
    });
  }
  for (const who of ["anon", "parent", "school_member", "stationery_member", "orphan"] as Identity[]) {
    it(`${who} não escreve snapshots`, async () => {
      await withClaims(who, async (c) => {
        expect((await attempt(c, INSERT(), [1990, "manual_admin", new Date()])).error).not.toBeNull();
        const upd = await attempt(c, "update public.price_snapshots set price_cents = 1");
        expect(upd.error !== null || upd.rowCount === 0).toBe(true);
        const del = await attempt(c, "delete from public.price_snapshots");
        expect(del.error !== null || del.rowCount === 0).toBe(true);
      });
    });
  }
  for (const who of ["admin", "system"] as Identity[]) {
    it(`${who} escreve snapshots`, async () => {
      await withClaims(who, async (c) => {
        expect((await attempt(c, INSERT(), [1990, "manual_admin", new Date()])).error).toBeNull();
        expect((await attempt(c, "update public.price_snapshots set price_cents = 2000 where item_key = 'caderno 96 folhas'")).rowCount).toBe(1);
      });
    });
  }
  it("apagar o varejista apaga seus snapshots (cascata)", async () => {
    await withSuperuser(async (c) => {
      await c.query("begin");
      try {
        await c.query("delete from public.retailers where slug = 'magalu'");
        expect((await c.query("select 1 from public.price_snapshots where item_key = 'lapis hb'")).rowCount).toBe(0);
      } finally {
        await c.query("rollback");
      }
    });
  });
});
