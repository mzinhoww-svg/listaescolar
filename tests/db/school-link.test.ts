// D-002 fechada no banco + escola atribuída na revisão (S11 · Task 2).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attemptH, cleanupUsers, ensureSchool, IDS, seedUsers } from "./helpers";
import { asService, asSuper, open, reviewRows, rpc, save, seedSubmission, statusOf, tx } from "./review-fixtures";

beforeAll(seedUsers);
afterAll(cleanupUsers);

const create = (c: Parameters<typeof asService>[0], o: { profile: string; source: "school" | "parent"; school: string | null }) => {
  const id = randomUUID();
  return attemptH(
    c,
    "select public.submissions_create($1::uuid, $2::uuid, $3::public.submission_source, $4::uuid, '4º ano', 2027, $5, 'l.pdf', 'application/pdf', 1000, false, 'list_upload', 'v1') as r",
    [id, o.profile, o.source, o.school, `${o.profile}/${id}/l.pdf`],
  );
};

describe("submissions_create: vínculo da escola (D-002)", () => {
  it("escola sem vínculo confirmado do remetente -> 42501 school_not_linked; sem escola idem", async () => {
    await tx(async (c) => {
      const school = await ensureSchool(c);
      await asService(c);
      const r = await create(c, { profile: IDS.school_member, source: "school", school });
      expect(r).toMatchObject({ code: "42501", hint: "school_not_linked" });
      expect(await create(c, { profile: IDS.school_member, source: "school", school: null })).toMatchObject({ code: "42501", hint: "school_not_linked" });
    });
  });

  it("com vínculo em school_members o envio da escola nasce; vínculo de OUTRA escola não vale", async () => {
    await tx(async (c) => {
      const school = await ensureSchool(c);
      const other = await ensureSchool(c);
      await c.query("insert into public.school_members (school_id, profile_id, member_role) values ($1, $2, 'co_admin')", [school, IDS.school_member]);
      await asService(c);
      expect((await create(c, { profile: IDS.school_member, source: "school", school })).error).toBeNull();
      expect(await create(c, { profile: IDS.school_member, source: "school", school: other })).toMatchObject({ hint: "school_not_linked" });
    });
  });

  it("o envio do pai segue inalterado (com ou sem escola, sem vínculo)", async () => {
    await tx(async (c) => {
      const school = await ensureSchool(c);
      await asService(c);
      expect((await create(c, { profile: IDS.parent, source: "parent", school: null })).error).toBeNull();
      expect((await create(c, { profile: IDS.parent, source: "parent", school })).error).toBeNull();
    });
  });
});

const assign = (c: Parameters<typeof asService>[0], sub: string, expected: number, school: string, actor: string = IDS.admin) =>
  attemptH(c, "select public.review_assign_school($1::uuid, $2::uuid, $3::int, $4::uuid) as r", [sub, actor, expected, school]);

describe("review_assign_school", () => {
  it("admin atribui a escola a um envio de pai sem escola em human_review; grava review/edited com school_assigned", async () => {
    await tx(async (c) => {
      const school = await ensureSchool(c);
      const id = await seedSubmission(c, { status: "human_review", source: "parent", owner: "parent", schoolId: null });
      await asService(c);
      await open(c, id);
      const r = await assign(c, id, 1, school);
      expect(r.rows[0]!.r).toBe("assigned");
      await asSuper(c);
      expect((await c.query("select school_id from public.list_submissions where id = $1", [id])).rows[0].school_id).toBe(school);
      const rows = await reviewRows(c, id);
      const last = rows.at(-1)!;
      expect(last).toMatchObject({ decision: "edited", actor_id: IDS.admin, reasons: ["school_assigned"] });
      expect(last.previous_version_id).toBe(last.new_version_id);
      expect(await statusOf(c, id)).toBe("human_review");
    });
  });

  it("recusas: não admin (42501), versão velha (stale), envio que já tem escola, fora de human_review, escola inexistente", async () => {
    await tx(async (c) => {
      const school = await ensureSchool(c);
      const id = await seedSubmission(c, { status: "human_review", source: "parent", owner: "parent", schoolId: null });
      await asService(c);
      await open(c, id);
      expect((await assign(c, id, 1, school, IDS.parent)).code).toBe("42501");
      expect((await assign(c, id, 7, school)).rows[0]!.r).toBe("stale");
      expect((await assign(c, id, 1, randomUUID())).code).toBe("22023");
      expect((await assign(c, id, 1, school)).rows[0]!.r).toBe("assigned");
      expect((await assign(c, id, 1, school)).rows[0]!.r).toBe("not_reviewable"); // já tem escola
      const done = await seedSubmission(c, { status: "approved", source: "parent", owner: "parent", schoolId: null });
      expect((await assign(c, done, 1, school)).rows[0]!.r).toBe("not_reviewable");
      void save; void rpc;
    });
  });
});
