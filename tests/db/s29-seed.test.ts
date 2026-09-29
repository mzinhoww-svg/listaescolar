import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { withSuperuser } from "./helpers";

// Não há `runSqlFile` em helpers: o arquivo roda inteiro numa conexão superuser (simple query aceita vários comandos).
async function runSqlFile(rel: string): Promise<void> {
  const sql = readFileSync(resolve(process.cwd(), rel), "utf8");
  await withSuperuser(async (c) => {
    await c.query(sql);
  });
}

describe("seed das jornadas S29", () => {
  it("cria uma conta por público, todas demo, e um lead para a papelaria (idempotente)", async () => {
    await runSqlFile("scripts/s29-seed-jornadas.sql");
    await runSqlFile("scripts/s29-seed-jornadas.sql");
    await withSuperuser(async (c) => {
      const roles = await c.query("select distinct role::text as role from public.profiles where display_name like 'S29 %'");
      expect(new Set(roles.rows.map((r) => r.role))).toEqual(new Set(["parent", "school_member", "stationery_member", "admin"]));

      const emails = await c.query(
        "select u.email from auth.users u join public.profiles p on p.id = u.id where p.display_name like 'S29 %'",
      );
      expect(new Set(emails.rows.map((r) => r.email))).toEqual(
        new Set(["familia", "escola", "papelaria", "admin", "parceiro"].map((n) => `${n}@listacerta.test`)),
      );

      const school = await c.query(
        `select s.is_demo, s.verification_status::text as v from public.school_members sm
           join public.schools s on s.id = sm.school_id
           join auth.users u on u.id = sm.profile_id where u.email = 'escola@listacerta.test'`,
      );
      expect(school.rows).toEqual([{ is_demo: true, v: "verified" }]);

      const stationery = await c.query(
        `select s.is_demo, s.status::text as st,
                (select count(*)::int from public.stationery_areas a where a.stationery_id = s.id) as areas,
                (select count(*)::int from public.catalog_items ci where ci.stationery_id = s.id) as items,
                (select count(*)::int from public.leads l where l.stationery_id = s.id and l.is_demo) as leads
           from public.stationery_members sm join public.stationeries s on s.id = sm.stationery_id
           join auth.users u on u.id = sm.profile_id where u.email = 'papelaria@listacerta.test'`,
      );
      expect(stationery.rows).toEqual([{ is_demo: true, st: "active", areas: 1, items: 3, leads: 1 }]);

      const partner = await c.query(
        `select bp.is_demo, bp.status::text as st from public.b2b_partner_members m
           join public.b2b_partners bp on bp.id = m.partner_id
           join auth.users u on u.id = m.profile_id where u.email = 'parceiro@listacerta.test'`,
      );
      expect(partner.rows).toEqual([{ is_demo: true, st: "active" }]);
    });
  });
});
