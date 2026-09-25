// Funções de leitura das portas reais (S11 · Task 2): publication_context, school_labels, list_reader_get, lead_list_context.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attempt, cleanupUsers, ensureSchool, IDS, seedUsers, withClaims } from "./helpers";
import { adminReq, pubItem, publishOk, SYSTEM_ID } from "./integration-fixtures";
import { asService, asSuper, rpc, seedSubmission, tx } from "./review-fixtures";

beforeAll(seedUsers);
afterAll(cleanupUsers);

const call = async (c: Parameters<typeof asService>[0], fn: string, sig: string, args: unknown[]) => {
  await asService(c);
  const r = await rpc(c, fn, sig, args);
  await asSuper(c);
  if (r.error) throw new Error(`${fn}: ${r.error}`);
  return r.rows[0]!.r as Record<string, unknown> | null;
};
const ctx = (c: Parameters<typeof asService>[0], q: Record<string, unknown>) => call(c, "publication_context", "$1::jsonb", [JSON.stringify(q)]);

describe("publication_context", () => {
  it("escola, verificação, município habilitado, série por slug ou nome (sem inventar) e lista atual", async () => {
    await tx(async (c) => {
      const school = await ensureSchool(c);
      await c.query("update public.schools set verification_status = 'verified' where id = $1", [school]);
      const q = { schoolId: school, grade: "4º ano", schoolYear: 2027, submittedBy: IDS.parent };
      expect(await ctx(c, q)).toMatchObject({ school: { verification: "verified", municipalityEnabled: true }, gradeSlug: "ef-4", submitterLinked: false, currentList: null });
      expect((await ctx(c, { ...q, grade: "  4º   ANO " }))!.gradeSlug).toBe("ef-4");
      expect((await ctx(c, { ...q, grade: "ef-4" }))!.gradeSlug).toBe("ef-4");
      expect((await ctx(c, { ...q, grade: "Educação de Jovens" }))!.gradeSlug).toBeNull();
      expect((await ctx(c, { ...q, schoolId: randomUUID() }))!.school).toBeNull();
      expect(await ctx(c, { schoolId: null, grade: null, schoolYear: null, submittedBy: IDS.parent })).toMatchObject({ school: null, gradeSlug: null, currentList: null });
    });
  });

  it("município desabilitado e escola suspensa aparecem como são", async () => {
    await tx(async (c) => {
      const school = await ensureSchool(c);
      await c.query("update public.municipalities set is_enabled = false where id = (select municipality_id from public.schools where id = $1)", [school]);
      await c.query("update public.schools set verification_status = 'suspended' where id = $1", [school]);
      expect((await ctx(c, { schoolId: school, grade: "4º ano", schoolYear: 2027, submittedBy: IDS.parent }))!.school).toEqual({ verification: "suspended", municipalityEnabled: false });
    });
  });

  it("submitterLinked vem de school_members; currentList reflete a lista publicada", async () => {
    await tx(async (c) => {
      const school = await ensureSchool(c);
      const claim = (await c.query("select id from public.claims limit 1")).rows[0];
      expect(claim).toBeUndefined(); // sem claim, o vínculo é criado como co_admin (sem a exigência do owner)
      await c.query("insert into public.school_members (school_id, profile_id, member_role) values ($1, $2, 'co_admin')", [school, IDS.school_member]);
      const { out } = await publishOk(c, { schoolId: school, gradeSlug: "ef-4", schoolYear: 2027 });
      const r = await ctx(c, { schoolId: school, grade: "4º ano", schoolYear: 2027, submittedBy: IDS.school_member });
      expect(r).toMatchObject({ submitterLinked: true, currentList: { listId: out.listId, status: "published", currentVersionId: out.newVersionId } });
      expect((await ctx(c, { schoolId: school, grade: "4º ano", schoolYear: 2027, submittedBy: IDS.parent }))!.submitterLinked).toBe(false);
    });
  });

  it("consulta com chave extra ou tipo errado é recusada (22023)", async () => {
    await tx(async (c) => {
      await asService(c);
      expect((await rpc(c, "publication_context", "$1::jsonb", [JSON.stringify({ schoolId: null, grade: null, schoolYear: null, submittedBy: IDS.parent, extra: 1 })])).code).toBe("22023");
      expect((await rpc(c, "publication_context", "$1::jsonb", [JSON.stringify({ schoolId: "x", grade: null, schoolYear: null, submittedBy: IDS.parent })])).code).toBe("22023");
    });
  });
});

describe("school_labels", () => {
  it("devolve só nome e INEP dos ids pedidos; desconhecido some; nenhuma outra coluna", async () => {
    await tx(async (c) => {
      const a = await ensureSchool(c);
      const b = await ensureSchool(c);
      await c.query("update public.schools set email = 'segredo@escola.invalid', phone = '65999990000' where id = $1", [a]);
      const out = (await call(c, "school_labels", "$1::uuid[]", [[a, randomUUID()]]))!;
      expect(Object.keys(out)).toEqual([a]);
      expect(Object.keys(out[a] as object).sort()).toEqual(["inep", "name"]);
      expect(JSON.stringify(out)).not.toMatch(/segredo|65999/);
      expect(b).not.toBe(a);
    });
  });
});

const listReader = (c: Parameters<typeof asService>[0], listId: string, actor: string | null) => call(c, "list_reader_get", "$1::uuid, $2::uuid", [listId, actor]);
const leadCtx = (c: Parameters<typeof asService>[0], listId: string, actor: string | null) => call(c, "lead_list_context", "$1::uuid, $2::uuid", [listId, actor]);

describe("list_reader_get", () => {
  it("versão oficial publicada e superseded: itens públicos; candidata e de lista arquivada: null", async () => {
    await tx(async (c) => {
      const school = await ensureSchool(c);
      const a = await publishOk(c, { schoolId: school });
      const b = await publishOk(c, { schoolId: school, items: [pubItem({ originalName: "Lápis", normalizedName: "lapis", quantity: 12 })] });
      const rb = (await listReader(c, b.out.newVersionId, IDS.parent))!;
      expect(rb).toMatchObject({ kind: "official", isDemo: false });
      expect((rb.items as { name: string; quantity: number }[]).map((i) => [i.name, i.quantity])).toEqual([["Lápis", 12]]);
      expect((await listReader(c, a.out.newVersionId, null))!.kind).toBe("official"); // superseded, sem ator: público
      const cand = (await c.query("insert into public.list_versions (list_id, version_number, source) values ($1, 99, 'school_upload') returning id", [a.out.listId])).rows[0].id;
      expect(await listReader(c, cand, IDS.parent)).toBeNull();
      await c.query("select public.list_archive($1, $2, 'x')", [a.out.listId, SYSTEM_ID]);
      expect(await listReader(c, b.out.newVersionId, IDS.parent)).toBeNull();
    });
  });

  it("cópia do pai: só do próprio dono (alheia, sem ator e inexistente devolvem o mesmo null); nunca marcada demo", async () => {
    await tx(async (c) => {
      const sub = await seedSubmission(c, { status: "human_review", source: "parent", owner: "parent" });
      await asService(c);
      const opened = (await rpc(c, "parent_copy_open", "$1::uuid, $2::uuid", [sub, IDS.parent])).rows[0]!.r as { copyId: string };
      await asSuper(c);
      const mine = (await listReader(c, opened.copyId, IDS.parent))!;
      expect(mine).toMatchObject({ kind: "parent_copy", isDemo: false });
      expect((mine.items as unknown[]).length).toBeGreaterThan(0);
      expect(await listReader(c, opened.copyId, IDS.school_member)).toBeNull();
      expect(await listReader(c, opened.copyId, null)).toBeNull();
      expect(await listReader(c, randomUUID(), IDS.parent)).toBeNull();
    });
  });
});

describe("lead_list_context", () => {
  it("oficial: escola, série, ano, itens e município da escola; isDemo da lista", async () => {
    await tx(async (c) => {
      const school = await ensureSchool(c);
      await c.query("update public.schools set name = 'Escola Modelo' where id = $1", [school]);
      const { out } = await publishOk(c, { schoolId: school, gradeSlug: "ef-4", schoolYear: 2027 });
      const r = (await leadCtx(c, out.newVersionId, IDS.parent))!;
      expect(r).toMatchObject({ schoolName: "Escola Modelo", gradeLabel: "4º ano", schoolYear: 2027, isDemo: false });
      expect(r.municipalityId).toMatch(/^[0-9a-f-]{36}$/);
      expect((r.items as unknown[]).length).toBe(1);
    });
  });

  it("cópia do pai: escola/série/ano do envio; sem escola devolve null (nada inventado); alheia null", async () => {
    await tx(async (c) => {
      const school = await ensureSchool(c);
      const withSchool = await seedSubmission(c, { status: "human_review", source: "parent", owner: "parent", schoolId: school, grade: "5º ano", year: 2027 });
      const noSchool = await seedSubmission(c, { status: "human_review", source: "parent", owner: "parent", schoolId: null });
      await asService(c);
      const open = async (s: string) => ((await rpc(c, "parent_copy_open", "$1::uuid, $2::uuid", [s, IDS.parent])).rows[0]!.r as { copyId: string }).copyId;
      const c1 = await open(withSchool);
      const c2 = await open(noSchool);
      await asSuper(c);
      expect(await leadCtx(c, c1, IDS.parent)).toMatchObject({ schoolName: "Escola Fixture", gradeLabel: "5º ano", schoolYear: 2027, isDemo: false });
      expect(await leadCtx(c, c2, IDS.parent)).toBeNull();
      expect(await leadCtx(c, c1, IDS.school_member)).toBeNull();
    });
  });
});

describe("privilégios das funções novas", () => {
  const fns: [string, string, unknown[]][] = [
    ["list_publish_from_pipeline", "$1::jsonb", ["{}"]],
    ["publication_context", "$1::jsonb", ["{}"]],
    ["school_labels", "$1::uuid[]", [[]]],
    ["list_reader_get", "$1::uuid, $2::uuid", [randomUUID(), null]],
    ["lead_list_context", "$1::uuid, $2::uuid", [randomUUID(), null]],
    ["review_assign_school", "$1::uuid, $2::uuid, 1, $3::uuid", [randomUUID(), IDS.admin, randomUUID()]],
    ["publication_reconcile_orphan", "$1::uuid, $2::uuid", [randomUUID(), IDS.admin]],
  ];
  for (const who of ["anon", "parent", "admin"] as const) {
    it(`${who} não executa nenhuma`, async () => {
      await withClaims(who, async (c) => {
        for (const [fn, sig, args] of fns) expect((await attempt(c, `select public.${fn}(${sig})`, args)).code, fn).toBe("42501");
      });
    });
  }
});

describe("list_kind em carrinhos e leads", () => {
  it("padrão demo; valores fora de official/parent_copy/demo são recusados", async () => {
    await tx(async (c) => {
      const cart = (await c.query("insert into public.carts (owner_id) values ($1) returning id, list_kind", [IDS.parent])).rows[0];
      expect(cart.list_kind).toBe("demo");
      expect((await attempt(c, "update public.carts set list_kind = 'official' where id = $1", [cart.id])).error).toBeNull();
      expect((await attempt(c, "update public.carts set list_kind = 'x' where id = $1", [cart.id])).code).toBe("23514");
      expect((await c.query("select column_default from information_schema.columns where table_name = 'leads' and column_name = 'list_kind'")).rows[0].column_default).toContain("demo");
    });
  });
});
void adminReq;
