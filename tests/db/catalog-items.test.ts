import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attempt, cleanupUsers, IDS, seedStationery, seedUsers, withClaims, withSuperuser, type Identity, type StationeryStatus } from "./helpers";

const WRITABLE: StationeryStatus[] = ["approved", "active", "paused"];
const NOT_WRITABLE: StationeryStatus[] = ["signup", "accreditation", "under_review", "suspended", "rejected"];
const INSERT = `insert into public.catalog_items (stationery_id, name, item_key, price_cents) values ($1, 'Caderno 96 folhas', 'caderno 96 folhas', 1250) returning id`;

describe("S13 catalog_items e stationery_areas", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  describe("checks", () => {
    it("preço > 0 e limitado; item_key único por papelaria; origem e estoque restritos", async () => {
      await withClaims("system", async (c) => {
        const id = await seedStationery(c, { status: "active" });
        let n = 0;
        const ins = (price: unknown) =>
          attempt(c, `insert into public.catalog_items (stationery_id, name, item_key, price_cents) values ($1, 'X', $3, $2)`, [id, price, `x${(n += 1)}`]);
        for (const bad of [0, -1, 100_000_001, 2_147_483_648]) {
          expect((await ins(bad)).error, String(bad)).not.toBeNull();
        }
        expect((await ins("12,5x")).error).not.toBeNull();
        expect((await ins(1)).error).toBeNull();
        expect((await ins(10_000_000)).error).toBeNull();
        const dup = await attempt(c, `insert into public.catalog_items (stationery_id, name, item_key, price_cents) values ($1, 'Outro', 'x6', 500)`, [id]);
        expect(dup.error).not.toBeNull();
        const src = await attempt(c, `insert into public.catalog_items (stationery_id, name, item_key, price_cents, price_source) values ($1, 'Y', 'y', 100, 'estimado')`, [id]);
        expect(src.error).not.toBeNull();
        const stock = await attempt(c, `insert into public.catalog_items (stationery_id, name, item_key, price_cents, stock_status) values ($1, 'Z', 'z', 100, 'muito')`, [id]);
        expect(stock.error).not.toBeNull();
        const blank = await attempt(c, `insert into public.catalog_items (stationery_id, name, item_key, price_cents) values ($1, ' ', 'w', 100)`, [id]);
        expect(blank.error).not.toBeNull();
        const noKey = await attempt(c, `insert into public.catalog_items (stationery_id, name, item_key, price_cents) values ($1, 'W', ' ', 100)`, [id]);
        expect(noKey.error).not.toBeNull();
      });
    });
    it("mesmo item_key em papelarias diferentes é permitido; defaults honestos", async () => {
      await withClaims("system", async (c) => {
        const a = await seedStationery(c);
        const b = await seedStationery(c);
        expect((await attempt(c, INSERT, [a])).error).toBeNull();
        const r = await attempt(c, INSERT, [b]);
        expect(r.error).toBeNull();
        const row = (await c.query("select price_source, stock_status::text as s, is_active from public.catalog_items where id = $1", [r.rows[0]?.id])).rows[0];
        expect(row).toMatchObject({ price_source: "informed_by_stationery", s: "unknown", is_active: true });
      });
    });
    it("apagar a papelaria apaga catálogo, áreas e vínculos (cascade)", async () => {
      await withClaims("system", async (c) => {
        const id = await seedStationery(c, { ownerId: IDS.parent });
        await attempt(c, INSERT, [id]);
        const d = await attempt(c, "delete from public.stationeries where id = $1", [id]);
        expect(d.error).toBeNull();
        expect((await c.query("select 1 from public.catalog_items where stationery_id = $1", [id])).rows).toHaveLength(0);
      });
    });
  });

  describe("escrita do dono", () => {
    it.each(WRITABLE)("dono insere, edita e apaga item em %s", async (status) => {
      await withClaims("stationery_member", async (c) => {
        const id = await seedStationery(c, { status, ownerId: IDS.stationery_member, pausedBy: status === "paused" ? "owner" : null });
        const ins = await attempt(c, INSERT, [id]);
        expect(ins.error).toBeNull();
        const itemId = ins.rows[0]?.id;
        const upd = await attempt(c, "update public.catalog_items set price_cents = 1300, stock_status = 'in_stock' where id = $1", [itemId]);
        expect(upd.rowCount).toBe(1);
        const del = await attempt(c, "delete from public.catalog_items where id = $1", [itemId]);
        expect(del.rowCount).toBe(1);
      });
    });
    it.each(NOT_WRITABLE)("dono não escreve catálogo em %s", async (status) => {
      await withClaims("stationery_member", async (c) => {
        const id = await seedStationery(c, { status, ownerId: IDS.stationery_member });
        const ins = await attempt(c, INSERT, [id]);
        expect(ins.error).not.toBeNull();
        // item pré-existente (criado antes da mudança de estado) não é editável nem apagável
        const prev = (await c.query("select current_user as u")).rows[0].u as string;
        await c.query("reset role");
        const item = await c.query("insert into public.catalog_items (stationery_id, name, item_key, price_cents) values ($1,'a','a',100) returning id", [id]);
        await c.query(`set local role ${prev}`);
        const upd = await attempt(c, "update public.catalog_items set price_cents = 200 where id = $1", [item.rows[0].id]);
        expect(upd.rowCount).toBe(0);
        const del = await attempt(c, "delete from public.catalog_items where id = $1", [item.rows[0].id]);
        expect(del.rowCount).toBe(0);
      });
    });
    it("dono não escreve na papelaria de outro, nem move item para ela", async () => {
      await withClaims("stationery_member", async (c) => {
        const mine = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
        const theirs = await seedStationery(c, { status: "active", ownerId: IDS.parent });
        expect((await attempt(c, INSERT, [theirs])).error).not.toBeNull();
        const own = await attempt(c, INSERT, [mine]);
        const move = await attempt(c, "update public.catalog_items set stationery_id = $1 where id = $2", [theirs, own.rows[0]?.id]);
        expect(move.error).not.toBeNull();
      });
    });
    it.each(["parent", "school_member", "orphan", "admin", "anon"] as Identity[])("%s não escreve no catálogo de ninguém", async (who) => {
      await withClaims(who, async (c) => {
        const id = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
        expect((await attempt(c, INSERT, [id])).error, who).not.toBeNull();
      });
    });
  });

  describe("leitura", () => {
    it.each(["anon", "parent", "orphan", "school_member"] as Identity[])("%s lê só itens ativos de papelaria active", async (who) => {
      await withClaims(who, async (c) => {
        const act = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
        const others = await Promise.all(
          (["paused", "suspended", "rejected", "approved", "under_review", "signup"] as StationeryStatus[]).map((s) =>
            seedStationery(c, { status: s, pausedBy: s === "paused" ? "owner" : null }),
          ),
        );
        const prev = (await c.query("select current_user as u")).rows[0].u as string;
        await c.query("reset role");
        await c.query("insert into public.catalog_items (stationery_id, name, item_key, price_cents, is_active) values ($1,'ativo','ativo',100,true), ($1,'inativo','inativo',100,false)", [act]);
        for (const o of others) await c.query("insert into public.catalog_items (stationery_id, name, item_key, price_cents) values ($1,'oculto','oculto',100)", [o]);
        await c.query(`set local role ${prev}`);
        const r = await attempt(c, "select name from public.catalog_items");
        expect(r.error, who).toBeNull();
        expect(r.rows.map((x) => x.name), who).toEqual(["ativo"]);
      });
    });
    it("dono vê todos os itens da própria papelaria (inclusive inativos), nada de outra; admin vê tudo", async () => {
      await withClaims("stationery_member", async (c) => {
        const mine = await seedStationery(c, { status: "paused", ownerId: IDS.stationery_member, pausedBy: "owner" });
        const theirs = await seedStationery(c, { status: "paused", ownerId: IDS.parent, pausedBy: "owner" });
        await c.query("reset role");
        await c.query("insert into public.catalog_items (stationery_id, name, item_key, price_cents, is_active) values ($1,'meu','meu',100,false), ($2,'dele','dele',100,true)", [mine, theirs]);
        await c.query("set local role authenticated");
        const r = await attempt(c, "select name from public.catalog_items");
        expect(r.rows.map((x) => x.name)).toEqual(["meu"]);
      });
      await withClaims("admin", async (c) => {
        const s = await seedStationery(c, { status: "suspended" });
        await c.query("reset role");
        await c.query("insert into public.catalog_items (stationery_id, name, item_key, price_cents) values ($1,'x','x',100)", [s]);
        await c.query("set local role authenticated");
        expect((await attempt(c, "select 1 from public.catalog_items where stationery_id = $1", [s])).rows).toHaveLength(1);
      });
    });
    it("papelaria que deixa de ser active some do público na hora (catálogo incluído)", async () => {
      await withClaims("anon", async (c) => {
        const id = await seedStationery(c, { status: "active" });
        await c.query("reset role");
        await c.query("insert into public.catalog_items (stationery_id, name, item_key, price_cents) values ($1,'a','a',100)", [id]);
        await c.query("insert into public.stationery_areas (stationery_id, municipality_id, neighborhood) select $1, municipality_id, 'centro' from public.stationeries where id = $1", [id]);
        await c.query("set local role anon");
        expect((await attempt(c, "select 1 from public.catalog_items where stationery_id = $1", [id])).rows).toHaveLength(1);
        expect((await attempt(c, "select 1 from public.stationery_areas where stationery_id = $1", [id])).rows).toHaveLength(1);
        await c.query("reset role");
        await c.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)");
        await c.query("set local role service_role");
        await c.query("select public.stationery_transition($1, 'suspended', null, 'system', 'teste')", [id]);
        await c.query("reset role");
        await c.query("select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true)");
        await c.query("set local role anon");
        expect((await attempt(c, "select 1 from public.catalog_items where stationery_id = $1", [id])).rows).toHaveLength(0);
        expect((await attempt(c, "select 1 from public.stationery_areas where stationery_id = $1", [id])).rows).toHaveLength(0);
      });
    });
  });

  describe("áreas atendidas", () => {
    const AREA = `insert into public.stationery_areas (stationery_id, municipality_id, neighborhood) select $1, id, $2 from public.municipalities order by ibge_code limit 1`;
    it("neighborhood normalizado e único por papelaria/município", async () => {
      await withClaims("system", async (c) => {
        const id = await seedStationery(c);
        expect((await attempt(c, AREA, [id, "centro"])).error).toBeNull();
        expect((await attempt(c, AREA, [id, "centro"])).error).not.toBeNull();
        expect((await attempt(c, AREA, [id, "Centro Norte"])).error).not.toBeNull(); // não normalizado
        expect((await attempt(c, AREA, [id, " "])).error).not.toBeNull();
      });
    });
    it.each(WRITABLE.concat(["signup", "accreditation"]))("dono gerencia áreas em %s", async (status) => {
      await withClaims("stationery_member", async (c) => {
        const id = await seedStationery(c, { status, ownerId: IDS.stationery_member, pausedBy: status === "paused" ? "owner" : null });
        const ins = await attempt(c, AREA, [id, "jardim"]);
        expect(ins.error).toBeNull();
        expect((await attempt(c, "delete from public.stationery_areas where stationery_id = $1", [id])).rowCount).toBe(1);
      });
    });
    it.each(["under_review", "suspended", "rejected"] as StationeryStatus[])("dono não altera áreas em %s", async (status) => {
      await withClaims("stationery_member", async (c) => {
        const id = await seedStationery(c, { status, ownerId: IDS.stationery_member });
        expect((await attempt(c, AREA, [id, "jardim"])).error).not.toBeNull();
      });
    });
    it("terceiro não escreve em áreas alheias", async () => {
      await withClaims("stationery_member", async (c) => {
        const id = await seedStationery(c, { status: "active", ownerId: IDS.parent });
        expect((await attempt(c, AREA, [id, "jardim"])).error).not.toBeNull();
      });
    });
  });

  describe("auditoria", () => {
    it("catalog_items é auditado (preço muda com rastro)", async () => {
      await withSuperuser(async (c) => {
        await c.query("begin");
        try {
          const id = await seedStationery(c);
          const it = await c.query(INSERT, [id]);
          await c.query("update public.catalog_items set price_cents = 1500 where id = $1", [it.rows[0].id]);
          const r = await c.query("select action, before ->> 'price_cents' as b, after ->> 'price_cents' as a from public.audit_log where entity_table='catalog_items' and entity_id = $1 order by created_at", [it.rows[0].id]);
          expect(r.rows.map((x) => x.action)).toEqual(["INSERT", "UPDATE"]);
          expect(r.rows[1]).toMatchObject({ b: "1250", a: "1500" });
        } finally {
          await c.query("rollback");
        }
      });
    });
  });
});
