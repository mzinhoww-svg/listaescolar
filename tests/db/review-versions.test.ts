import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { attempt, cleanupUsers, IDS, seedUsers } from "./helpers";
import { ALERTS, asService, asSuper, item, open, seedSubmission, tx } from "./review-fixtures";

const valid = async (c: Client, v: unknown): Promise<boolean> =>
  (await c.query("select public.review_items_valid($1::jsonb) as ok", [JSON.stringify(v)])).rows[0].ok as boolean;

describe("0204: review_items_valid", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("aceita item completo, lista vazia e texto hostil como TEXTO", async () => {
    await tx(async (c) => {
      expect(await valid(c, [item()])).toBe(true);
      expect(await valid(c, [])).toBe(true);
      expect(await valid(c, [item({ name: '<img src=x onerror=alert(1)> "><script>', quantity: null, category: null, confidence: null, unit: null })])).toBe(true);
      expect(await valid(c, [item({ name: "Régua < 5 anos", alerts: [...ALERTS].slice(0, 3), origin: "edited" })])).toBe(true);
      expect(await valid(c, [item({ quantity: 9999, origin: "added" })])).toBe(true);
    });
  });

  it("recusa: não-array, chave extra, chave faltando, 501 itens, nome vazio/controle/301, quantidade inválida, categoria, alerta, origem", async () => {
    await tx(async (c) => {
      expect(await valid(c, { name: "x" })).toBe(false);
      expect(await valid(c, [item({ extra: 1 })])).toBe(false);
      const semUnit = Object.fromEntries(Object.entries(item()).filter(([k]) => k !== "unit"));
      expect(await valid(c, [semUnit])).toBe(false);
      expect(await valid(c, Array.from({ length: 501 }, () => item()))).toBe(false);
      expect(await valid(c, Array.from({ length: 500 }, () => item()))).toBe(true);
      for (const name of ["", "   ", "a\nb", "a‮b", "x".repeat(301), 5]) expect(await valid(c, [item({ name })])).toBe(false);
      expect(await valid(c, [item({ name: "x".repeat(300) })])).toBe(true);
      for (const quantity of [0, 10000, 1.5, "2", -1, true]) expect(await valid(c, [item({ quantity })])).toBe(false);
      expect(await valid(c, [item({ category: "moveis" })])).toBe(false);
      expect(await valid(c, [item({ alerts: ["procon"] })])).toBe(false);
      expect(await valid(c, [item({ alerts: Array.from({ length: 11 }, () => "handwritten") })])).toBe(false);
      expect(await valid(c, [item({ origin: "ai" })])).toBe(false);
      expect(await valid(c, [item({ confidence: 1.1 })])).toBe(false);
      expect(await valid(c, [item({ unit: "u".repeat(41) })])).toBe(false);
      expect(await valid(c, [null])).toBe(false);
    });
  });
});

describe("0204: review_versions", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("append-only: UPDATE, DELETE e TRUNCATE bloqueados (inclusive em replica); DELETE só pela cascata do envio", async () => {
    await tx(async (c) => {
      const id = await seedSubmission(c);
      await asService(c);
      expect((await open(c, id)).error).toBeNull();
      await asSuper(c);
      expect((await attempt(c, "update public.review_versions set grade = 'x' where submission_id = $1", [id])).code).toBe("42501");
      expect((await attempt(c, "delete from public.review_versions where submission_id = $1", [id])).code).toBe("42501");
      expect((await attempt(c, "truncate public.review_versions")).code).toBe("42501");
      await c.query("set local session_replication_role = replica");
      expect((await attempt(c, "update public.review_versions set grade = 'x' where submission_id = $1", [id])).code).toBe("42501");
      expect((await attempt(c, "delete from public.review_versions where submission_id = $1", [id])).code).toBe("42501");
      await c.query("set local session_replication_role = origin");
      // apagar o envio (ex.: exclusão de conta) leva as versões junto pela cascata
      expect((await attempt(c, "delete from public.list_submissions where id = $1", [id])).error).toBeNull();
      expect((await c.query("select count(*)::int as n from public.review_versions where submission_id = $1", [id])).rows[0].n).toBe(0);
    });
  });

  it("versão 1 tem ator nulo e origem extraction; demais exigem ator e origem admin_edit", async () => {
    await tx(async (c) => {
      const id = await seedSubmission(c);
      const ins = (version: number, origin: string, actor: string | null) =>
        attempt(c, "insert into public.review_versions (submission_id, version, items, origin, actor_id) values ($1, $2, '[]'::jsonb, $3, $4)", [id, version, origin, actor]);
      expect((await ins(1, "extraction", IDS.admin)).code).toBe("23514");
      expect((await ins(2, "admin_edit", null)).code).toBe("23514");
      expect((await ins(2, "extraction", null)).code).toBe("23514");
      expect((await ins(201, "admin_edit", IDS.admin)).code).toBe("23514");
      expect((await ins(1, "extraction", null)).error).toBeNull();
      expect((await ins(1, "extraction", null)).code).toBe("23505");
      expect((await ins(2, "admin_edit", IDS.admin)).error).toBeNull();
      expect((await attempt(c, "insert into public.review_versions (submission_id, version, items, origin, actor_id) values ($1, 3, '[{\"name\":\"x\"}]'::jsonb, 'admin_edit', $2)", [id, IDS.admin])).code).toBe("23514");
    });
  });

  it("RLS ligada, sem política e sem grant para anon/authenticated", async () => {
    await tx(async (c) => {
      const t = (await c.query("select relrowsecurity as rls from pg_class where oid = 'public.review_versions'::regclass")).rows[0];
      expect(t.rls).toBe(true);
      expect((await c.query("select count(*)::int as n from pg_policies where tablename = 'review_versions'")).rows[0].n).toBe(0);
      await c.query("set local role authenticated");
      expect((await attempt(c, "select 1 from public.review_versions")).code).toBe("42501");
      await c.query("reset role");
      await c.query("set local role anon");
      expect((await attempt(c, "select 1 from public.review_versions")).code).toBe("42501");
    });
  });
});

describe("0204: review_open", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("cria a versão 1 fiel ao ocr_jobs.result, sem ator, e é idempotente", async () => {
    await tx(async (c) => {
      const id = await seedSubmission(c, { grade: "4º ano", year: 2027 });
      await asService(c);
      const a = await open(c, id);
      expect(a.error).toBeNull();
      expect(a.rows[0]!.r).toMatchObject({ version: 1 });
      const b = await open(c, id);
      expect(b.rows[0]!.r).toEqual(a.rows[0]!.r);
      const v = (await c.query("select version, grade, school_year, origin, actor_id, items from public.review_versions where submission_id = $1", [id])).rows;
      expect(v).toHaveLength(1);
      expect(v[0]).toMatchObject({ version: 1, grade: "4º ano", school_year: 2027, origin: "extraction", actor_id: null });
      const items = v[0]!.items as Record<string, unknown>[];
      expect(items).toHaveLength(3);
      expect(items[0]).toEqual({ name: "Caderno 96 folhas", quantity: 2, unit: "un", category: "papelaria", confidence: 0.92, alerts: [], origin: "extracted" });
      expect(items[1]).toMatchObject({ name: "Lápis preto", quantity: null, unit: null, alerts: ["low_confidence_item"] });
      // quantidade fracionária não vira número inventado; categoria ausente = null; texto com "<" preservado
      expect(items[2]).toMatchObject({ name: "Régua < 5 anos", quantity: null, category: null, alerts: [] });
    });
  });

  it("usa o resultado mais recente; sem resultado, resultado inválido ou estado não revisável -> P0002", async () => {
    await tx(async (c) => {
      const semResultado = await seedSubmission(c, { result: null });
      const invalido = await seedSubmission(c, { result: { items: [{ name: "  ", quantity: 1, unit: null, confidence: 0.5 }], overallConfidence: 0.5, warnings: [] } });
      const cedo = await seedSubmission(c, { status: "review_needed" });
      const ok = await seedSubmission(c, { status: "approved" });
      await asService(c);
      for (const id of [semResultado, invalido, cedo]) expect((await open(c, id)).code).toBe("P0002");
      expect((await open(c, ok)).error).toBeNull();
      expect((await open(c, randomUUID())).code).toBe("P0002");
    });
  });

  it("só admin: parent, school_member, sem perfil e nulo -> 42501", async () => {
    await tx(async (c) => {
      const id = await seedSubmission(c);
      await asService(c);
      for (const actor of [IDS.parent, IDS.school_member, IDS.orphan, IDS.system]) expect((await open(c, id, actor)).code).toBe("42501");
      expect((await attempt(c, "select public.review_open($1::uuid, null)", [id])).code).toBe("42501");
    });
  });
});
