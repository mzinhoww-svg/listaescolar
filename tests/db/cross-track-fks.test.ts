import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FKS, INDEXES, insertCartItem, insertLead, insertSubmission, MIGRATION, ROLLBACK } from "./cross-track-fixtures";
import { seedCandidate, seedList, seedSchool } from "./list-fixtures";
import { attempt, cleanupUsers, IDS, inTx, seedUsers } from "./helpers";

describe("S11 0600 · FKs entre trilhas", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("as 4 constraints existem, estão validadas e com o on delete do plano; índices de apoio existem", async () => {
    await inTx(async (c) => {
      for (const fk of FKS) {
        const r = await c.query(
          "select convalidated, confdeltype, conrelid::regclass::text as t from pg_constraint where conname = $1 and contype = 'f'",
          [fk.name],
        );
        expect(r.rows, fk.name).toHaveLength(1);
        expect(r.rows[0]).toMatchObject({ convalidated: true, confdeltype: fk.del, t: fk.table });
      }
      const idx = await c.query("select indexname from pg_indexes where schemaname = 'public' and indexname = any($1::text[])", [INDEXES]);
      expect(idx.rows.map((x) => x.indexname).sort()).toEqual([...INDEXES].sort());
    });
  });

  it("órfão em cada coluna falha com 23503", async () => {
    await inTx(async (c) => {
      const school = await seedSchool(c, "51999601");
      const good = await insertSubmission(c, school);
      const list = await seedList(c, school);
      const version = await seedCandidate(c, list);
      expect((await attempt(c, "update public.list_versions set submission_id = $1 where id = $2", [randomUUID(), version])).code).toBe("23503");
      expect((await attempt(c, "update public.list_submissions set school_id = $1 where id = $2", [randomUUID(), good.id])).code).toBe("23503");
      expect((await attempt(c, "insert into public.carts (id, owner_id) values ($1, $2)", [randomUUID(), IDS.parent])).code).toBeNull();
      const cart = (await c.query("select id from public.carts where owner_id = $1 limit 1", [IDS.parent])).rows[0].id;
      expect((await attempt(c, "insert into public.cart_items (cart_id, list_item_id, name, quantity) values ($1, $2, 'x', 1)", [cart, randomUUID()])).code).toBe("23503");
      expect((await attempt(c, "select 1 from public.stationeries limit 0")).error).toBeNull();
      const lead = await insertLead(c, good.consentId, true);
      expect((await attempt(c, "update public.leads set consent_id = $1 where id = $2", [randomUUID(), lead])).code).toBe("23503");
    });
  });

  it("apagar perfil: versão mantém e zera submission_id; lead mantém e zera consent_id", async () => {
    await inTx(async (c) => {
      const school = await seedSchool(c, "51999602");
      const sub = await insertSubmission(c, school, true);
      const list = await seedList(c, school);
      const version = await seedCandidate(c, list);
      await c.query("update public.list_versions set submission_id = $1 where id = $2", [sub.id, version]);
      const lead = await insertLead(c, sub.consentId, true);
      await c.query("delete from public.profiles where id = $1", [IDS.parent]);
      expect((await c.query("select submission_id from public.list_versions where id = $1", [version])).rows[0].submission_id).toBeNull();
      expect((await c.query("select consent_id from public.leads where id = $1", [lead])).rows[0].consent_id).toBeNull();
      expect((await c.query("select count(*)::int as n from public.list_submissions where id = $1", [sub.id])).rows[0].n).toBe(0);
    });
  });

  it("apagar escola com envio falha (restrict); apagar item de versão candidata zera cart_items.list_item_id", async () => {
    await inTx(async (c) => {
      const school = await seedSchool(c, "51999603");
      await insertSubmission(c, school);
      expect((await attempt(c, "delete from public.schools where id = $1", [school])).code).toBe("23503");
      const list = await seedList(c, school);
      const version = await seedCandidate(c, list);
      const item = (await c.query("select id from public.list_items where version_id = $1 limit 1", [version])).rows[0].id;
      const ci = await insertCartItem(c, item, true);
      await c.query("delete from public.list_items where id = $1", [item]);
      expect((await c.query("select list_item_id from public.cart_items where id = $1", [ci])).rows[0].list_item_id).toBeNull();
    });
  });

  it("rollback remove constraints e índices e a migration reaplica", async () => {
    await inTx(async (c) => {
      await c.query(ROLLBACK);
      const gone = await c.query("select 1 from pg_constraint where conname = any($1::text[])", [FKS.map((f) => f.name)]);
      expect(gone.rowCount).toBe(0);
      const idx = await c.query("select 1 from pg_indexes where schemaname = 'public' and indexname = any($1::text[])", [INDEXES]);
      expect(idx.rowCount).toBe(0);
      await c.query(ROLLBACK); // idempotente
      await c.query(MIGRATION);
      const back = await c.query("select 1 from pg_constraint where conname = any($1::text[]) and convalidated", [FKS.map((f) => f.name)]);
      expect(back.rowCount).toBe(4);
      const idx2 = await c.query("select 1 from pg_indexes where schemaname = 'public' and indexname = any($1::text[])", [INDEXES]);
      expect(idx2.rowCount).toBe(4);
    });
  });
});
