import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { withSuperuser } from "./helpers";

// Não há `runSqlFile` em helpers: o arquivo roda inteiro numa conexão superuser (simple query aceita vários comandos).
async function runSqlFile(rel: string, opts: { localMarker?: boolean } = { localMarker: true }): Promise<void> {
  const sql = readFileSync(resolve(process.cwd(), rel), "utf8");
  await withSuperuser(async (c) => {
    if (opts.localMarker) await c.query("select set_config('app.local_seed', 'on', false)");
    await c.query(sql);
  });
}

describe("seed das jornadas S29", () => {
  it("aborta sem o marcador app.local_seed e não grava nada", async () => {
    // O banco pode já ter o seed de rodadas anteriores: compara antes/depois (nada novo pode ser gravado).
    const snapshot = () =>
      withSuperuser(async (c) => {
        const r = await c.query(
          `select (select count(*)::int from public.profiles where display_name like 'S29 %') as profiles,
                  (select count(*)::int from auth.users where email like '%@listacerta.test') as users,
                  (select count(*)::int from public.stationeries where is_demo) as stationeries,
                  (select count(*)::int from public.plans) as plans`,
        );
        return r.rows[0];
      });
    const before = await snapshot();
    await expect(runSqlFile("scripts/s29-seed-jornadas.sql", { localMarker: false })).rejects.toThrow(/recusado/);
    expect(await snapshot()).toEqual(before);
  });

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
        new Set(["familia", "escola", "papelaria", "admin", "parceiro", "marca"].map((n) => `${n}@listacerta.test`)),
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
      expect(stationery.rows).toEqual([{ is_demo: true, st: "active", areas: 1, items: 3, leads: 9 }]);

      const partner = await c.query(
        `select bp.is_demo, bp.status::text as st from public.b2b_partner_members m
           join public.b2b_partners bp on bp.id = m.partner_id
           join auth.users u on u.id = m.profile_id where u.email = 'parceiro@listacerta.test'`,
      );
      expect(partner.rows).toEqual([{ is_demo: true, st: "active" }]);
    });
  });

  it("cobre os estados das jornadas: escolas, pedidos, papelarias, leads, contestação, denúncia, lote, fatura, aluno e parceiros (idempotente)", async () => {
    await runSqlFile("scripts/s29-seed-jornadas.sql");
    await runSqlFile("scripts/s29-seed-jornadas.sql");
    const U = "00000000-0000-4000-8000-";
    await withSuperuser(async (c) => {
      const one = async (sql: string) => (await c.query(sql)).rows;

      // Escola sem administrador (com contato do INEP) e escola de 90 caracteres, ambas sem membro.
      expect(await one(`select s.verification_status::text as v, s.email is not null as has_email, s.phone is not null as has_phone,
        (select count(*)::int from public.school_members m where m.school_id = s.id) as members from public.schools s where s.inep = '99029002'`))
        .toEqual([{ v: "registered", has_email: true, has_phone: true, members: 0 }]);
      expect(await one("select length(name)::int as n from public.schools where inep = '99029003'")).toEqual([{ n: 90 }]);

      // Pedidos de administração em cada estado.
      const claims = await one(`select status::text as st from public.claims where id::text like '${U}0000002902%' order by st`);
      expect(claims.map((r) => r.st)).toEqual(["awaiting_verification", "insufficient_evidence", "rejected", "submitted", "token_expired"]);

      // Papelarias em análise, aprovada e pausada; leads da demo em todos os nove estados.
      expect((await one("select status::text as st from public.stationeries where slug like 's29-papelaria-%' order by st")).map((r) => r.st))
        .toEqual(["active", "approved", "paused", "under_review"]);
      const leads = await one(`select status::text as st, quoted_total_cents as q, declared_sale_cents as s from public.leads where stationery_id = '${U}0000000029c1' order by code`);
      expect(leads.map((r) => r.st)).toEqual(["received", "viewed", "in_progress", "quote_sent", "awaiting_customer", "converted", "declined", "expired", "cancelled"]);
      expect(leads.find((r) => r.st === "quote_sent")?.q).toBe(32090);
      expect(leads.find((r) => r.st === "converted")?.s).toBe(31500);

      // Contestação aberta, denúncia aberta, lote com uma linha em cada ação, fatura aberta e aluno.
      expect(await one("select status from public.lead_disputes where id::text like '%290501'")).toEqual([{ status: "open" }]);
      expect(await one("select status::text as st from public.reports where id::text like '%290701'")).toEqual([{ st: "open" }]);
      expect((await one(`select action::text as a from public.import_rows where batch_id = '${U}000000290801' order by a`)).map((r) => r.a))
        .toEqual(["duplicate", "inserted", "rejected", "updated"]);
      expect(await one("select kind, status, is_demo from public.invoices where id::text like '%290901'")).toEqual([{ kind: "credit_package", status: "open", is_demo: true }]);
      expect(await one("select nickname from public.students where id::text like '%290a01'")).toEqual([{ nickname: "Duda" }]);

      // Parceiros: o de marca é da conta marca@ e há um em cada outro estado, com campanhas em cada estado.
      expect(await one(`select p.partner_type::text as t, p.status::text as st from public.b2b_partner_members m join public.b2b_partners p on p.id = m.partner_id
        join auth.users u on u.id = m.profile_id where u.email = 'marca@listacerta.test'`)).toEqual([{ t: "brand", st: "active" }]);
      expect((await one("select status::text as st from public.b2b_partners where is_demo order by st")).map((r) => r.st)).toEqual(["active", "active", "pending", "rejected", "suspended"]);
      expect((await one("select status::text as st from public.b2b_campaigns where partner_id::text like '%290b01' order by st")).map((r) => r.st))
        .toEqual(["approved", "completed", "draft", "paused", "pending_review", "rejected"]);
    });
  });

  it("o plano local de demonstração do seed tem créditos e passe, não 10000 pedidos grátis", () => {
    // O setup dos testes de banco já publica o plano de teste (10000 grátis) antes do seed; por isso a conferência é no arquivo.
    const sql = readFileSync(resolve(process.cwd(), "scripts/s29-seed-jornadas.sql"), "utf8");
    expect(sql).not.toMatch(/'active', 10000/);
    expect(sql).toMatch(/'active', 100, 90, 12000, 150, 3/);
    expect(sql).toMatch(/plan_credit_packages[\s\S]{0,120}1000\), \(v_plan, 2, 5000\)/);
  });

  it("publica uma lista demo e dá à família um carrinho e um envio em revisão humana (idempotente)", async () => {
    await runSqlFile("scripts/s29-seed-jornadas.sql");
    await runSqlFile("scripts/s29-seed-jornadas.sql");
    await withSuperuser(async (c) => {
      const list = await c.query(
        `select l.status::text as st, l.is_demo, (select count(*)::int from public.list_items i where i.version_id = l.current_version_id) as items
           from public.school_lists l where l.school_id = '00000000-0000-4000-8000-0000000029b1' and l.school_year = 2027`,
      );
      expect(list.rows).toEqual([{ st: "published", is_demo: true, items: 4 }]);

      const cart = await c.query(
        `select c.is_demo, c.list_kind, (select count(*)::int from public.cart_items ci where ci.cart_id = c.id) as items,
                exists (select 1 from public.list_versions v where v.id = c.list_id and v.status = 'published') as from_published_version
           from public.carts c join auth.users u on u.id = c.owner_id where u.email = 'familia@listacerta.test'`,
      );
      expect(cart.rows).toEqual([{ is_demo: true, list_kind: "official", items: 4, from_published_version: true }]);

      const submission = await c.query(
        `select s.status::text as st, s.is_demo, (select count(*)::int from public.parent_list_copies p where p.submission_id = s.id) as copies
           from public.list_submissions s join auth.users u on u.id = s.submitted_by where u.email = 'familia@listacerta.test'`,
      );
      expect(submission.rows).toEqual([{ st: "human_review", is_demo: true, copies: 1 }]);
    });
  });
});
