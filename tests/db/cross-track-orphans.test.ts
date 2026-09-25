import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attempt, cleanupUsers, IDS, inTx, seedUsers } from "./helpers";
import { seedCandidate, seedList, seedSchool } from "./list-fixtures";
import { CHECK, insertCartItem, insertLead, insertSubmission, MIGRATION, ROLLBACK } from "./cross-track-fixtures";

// Banco "anterior à 0600": as FKs saem dentro da transação (DDL transacional) e o rollback do teste restaura tudo.
describe("S11 0600 · órfãos", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("checagem devolve as contagens demo/real por FK e migration anula só os demo", async () => {
    await inTx(async (c) => {
      await c.query(ROLLBACK);
      const school = await seedSchool(c, "51999611");
      const demoList = await seedList(c, school, "ef-1", 2027);
      const realList = await seedList(c, school, "ef-2", 2027);
      await c.query("update public.school_lists set is_demo = false where id = $1", [realList]);
      const vDemo = await seedCandidate(c, demoList);
      const vReal = await seedCandidate(c, realList);
      await c.query("update public.list_versions set submission_id = $1 where id = any($2::uuid[])", [randomUUID(), [vDemo]]);
      const sDemo = await insertSubmission(c, randomUUID(), true);
      const okSub = await insertSubmission(c, school, false);
      await insertCartItem(c, randomUUID(), true);
      await insertLead(c, randomUUID(), true);

      const rows = (await c.query(CHECK)).rows as { fk: string; orphans_demo: string; orphans_real: string }[];
      expect(rows.map((r) => [r.fk.split(" ")[0], Number(r.orphans_demo), Number(r.orphans_real)])).toEqual([
        ["list_versions.submission_id", 1, 0],
        ["list_submissions.school_id", 1, 0],
        ["cart_items.list_item_id", 1, 0],
        ["leads.consent_id", 1, 0],
      ]);

      await c.query(MIGRATION);
      expect((await c.query("select submission_id from public.list_versions where id = $1", [vDemo])).rows[0].submission_id).toBeNull();
      expect((await c.query("select school_id from public.list_submissions where id = $1", [sDemo.id])).rows[0].school_id).toBeNull();
      expect((await c.query("select school_id from public.list_submissions where id = $1", [okSub.id])).rows[0].school_id).toBe(school);
      expect((await c.query("select count(*)::int as n from public.cart_items where list_item_id is null")).rows[0].n).toBeGreaterThan(0);
      expect((await c.query("select 1 from pg_constraint where conname = 'leads_consent_id_fkey' and convalidated")).rowCount).toBe(1);
      expect(vReal).toBeTruthy();
    });
  });

  it.each([
    ["list_versions.submission_id", async (c: import("pg").Client, school: string) => {
      const list = await seedList(c, school, "ef-1", 2027);
      await c.query("update public.school_lists set is_demo = false where id = $1", [list]);
      const v = await seedCandidate(c, list);
      await c.query("update public.list_versions set submission_id = $1 where id = $2", [randomUUID(), v]);
    }],
    ["list_submissions.school_id", async (c: import("pg").Client) => { await insertSubmission(c, randomUUID(), false); }],
    ["cart_items.list_item_id", async (c: import("pg").Client) => { await insertCartItem(c, randomUUID(), false); }],
    ["leads.consent_id", async (c: import("pg").Client) => { await insertLead(c, randomUUID(), false); }],
  ])("órfão real em %s aborta com a contagem por FK e nada muda", async (fk, seed) => {
    await inTx(async (c) => {
      await c.query(ROLLBACK);
      const school = await seedSchool(c, "51999612");
      await seed(c, school);
      // um órfão demo junto: também não pode ser anulado, pois a migration aborta inteira.
      await insertSubmission(c, randomUUID(), true);
      const r = await attempt(c, MIGRATION);
      expect(r.code).toBe("23503");
      expect(r.error).toContain("0600 abortada");
      expect(r.error).toContain(`${fk}=1`);
      expect((await c.query("select count(*)::int as n from public.list_submissions where school_id is not null and not exists (select 1 from public.schools s where s.id = school_id)")).rows[0].n).toBeGreaterThan(0);
      expect((await c.query("select 1 from pg_constraint where conname = any($1::text[])", [["leads_consent_id_fkey", "list_submissions_school_id_fkey"]])).rowCount).toBe(0);
    });
  });

  it("checagem é somente leitura", () => {
    expect(CHECK).not.toMatch(/\b(insert|update|delete|alter|drop|truncate|create)\b/i);
    expect(IDS.parent).toBeTruthy();
  });
});
