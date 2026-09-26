import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";

import { seedKey, seedPartner, seedPublishedList } from "./b2b-fixtures";
import { cleanupUsers, IDS, inTx, seedUsers } from "./helpers";
import { backToSuper, seedCandidate, seedInState, switchTo, transition } from "./list-fixtures";

type J = Record<string, unknown>;

const SCHOOL_KEYS = ["inep", "is_demo", "municipality", "name", "neighborhood", "network", "published_lists_count", "verified"];
const LIST_KEYS = ["grade", "id", "is_demo", "item_count", "published_at", "school_inep", "school_year", "version"];
const ITEM_KEYS = ["category", "name", "normalized_name", "position", "quantity", "unit"];

async function schools(c: Client, env: string, cov: string[] | null, o: Partial<{ city: string; uf: string; q: string; has: boolean; afterName: string; afterInep: string; limit: number }> = {}): Promise<J[]> {
  const r = await c.query("select public.b2b_v1_schools($1, $2::text[], $3, $4, $5, $6, $7, $8, $9) as j", [env, cov, o.city ?? null, o.uf ?? null, o.q ?? null, o.has ?? null, o.afterName ?? null, o.afterInep ?? null, o.limit ?? 50]);
  return r.rows.map((x) => x.j as J);
}
async function school(c: Client, env: string, cov: string[] | null, inep: string): Promise<J | null> {
  return (await c.query("select public.b2b_v1_school($1, $2::text[], $3) as j", [env, cov, inep])).rows[0]?.j as J | null;
}
async function schoolLists(c: Client, env: string, cov: string[] | null, inep: string, year: number | null = null, limit = 50): Promise<J[]> {
  return (await c.query("select public.b2b_v1_school_lists($1, $2::text[], $3, $4, null, null, null, $5) as j", [env, cov, inep, year, limit])).rows.map((x) => x.j as J);
}
async function list(c: Client, env: string, cov: string[] | null, id: string): Promise<J | null> {
  return (await c.query("select public.b2b_v1_list($1, $2::text[], $3) as j", [env, cov, id])).rows[0]?.j as J | null;
}
async function items(c: Client, env: string, cov: string[] | null, id: string, after: number | null = null, limit = 200): Promise<J[]> {
  return (await c.query("select public.b2b_v1_list_items($1, $2::text[], $3, $4, $5) as j", [env, cov, id, after, limit])).rows.map((x) => x.j as J);
}

/** Escola sensível: contato, endereço, CEP, e-mail (nunca saem). */
async function sensitizeSchool(c: Client, schoolId: string): Promise<void> {
  await c.query("update public.schools set email = 'diretora.secreta@escola.invalid', phone = '+5565988887777', address = 'Rua Sigilosa, 99', cep = '78000123' where id = $1", [schoolId]);
}

describe("S24 · leitura pública da API (b2b_v1_*)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("regra pública: só lista published com versão atual, escola não suspensa, município habilitado, por ambiente", async () => {
    await inTx(async (c) => {
      const real = await seedPublishedList(c, { demo: false });
      const demo = await seedPublishedList(c, { demo: true });
      await sensitizeSchool(c, real.schoolId);
      const disabled = await seedPublishedList(c, { demo: false, enabledMunicipality: false });
      const suspendedSeed = await seedPublishedList(c, { demo: false });
      await c.query("update public.schools set verification_status = 'suspended' where id = $1", [suspendedSeed.schoolId]);
      const notPublished: Record<string, string> = {};
      for (const st of ["draft", "human_review", "approved", "archived"] as const) {
        const s = await seedInState(c, st, { inep: String(53_000_000 + Math.floor(Math.random() * 900_000)) });
        await c.query("update public.school_lists set is_demo = false where id = $1", [s.listId]);
        await c.query("update public.schools set is_demo = false where id = $1", [s.schoolId]);
        notPublished[st] = s.listId;
      }
      const liveLists = await schoolLists(c, "live", null, real.inep);
      expect(liveLists.map((l) => l.id)).toEqual([real.listId]);
      expect(await list(c, "live", null, demo.listId)).toBeNull();
      expect(await list(c, "test", null, demo.listId)).not.toBeNull();
      expect(await list(c, "test", null, real.listId)).toBeNull();
      expect(await list(c, "live", null, disabled.listId)).toBeNull();
      expect(await list(c, "live", null, suspendedSeed.listId)).toBeNull();
      expect(await school(c, "live", null, suspendedSeed.inep)).toBeNull();
      expect(await school(c, "live", null, disabled.inep)).toBeNull();
      for (const [st, id] of Object.entries(notPublished)) expect(await list(c, "live", null, id), st).toBeNull();
      expect(await items(c, "live", null, notPublished.approved!)).toEqual([]);
      // escola demo não aparece em live; escola real não aparece em test
      expect(await school(c, "live", null, demo.inep)).toBeNull();
      expect(await school(c, "test", null, real.inep)).toBeNull();
      expect((await school(c, "test", null, demo.inep))?.is_demo).toBe(true);
    });
  });

  it("whitelist exata de colunas e nenhum dado de contato/perfil/interno", async () => {
    await inTx(async (c) => {
      const real = await seedPublishedList(c, { demo: false, items: 3 });
      await sensitizeSchool(c, real.schoolId);
      const s = (await school(c, "live", null, real.inep))!;
      expect(Object.keys(s).sort()).toEqual(SCHOOL_KEYS);
      expect(Object.keys(s.municipality as J).sort()).toEqual(["ibge_code", "name", "uf"]);
      expect(s).toMatchObject({ inep: real.inep, verified: false, is_demo: false, published_lists_count: 1, network: "municipal" });
      const l = (await list(c, "live", null, real.listId))!;
      expect(Object.keys(l).sort()).toEqual(LIST_KEYS);
      expect(Object.keys(l.grade as J).sort()).toEqual(["name", "slug", "stage"]);
      expect(l).toMatchObject({ id: real.listId, school_inep: real.inep, school_year: 2027, version: 1, item_count: 3, is_demo: false });
      expect((l.grade as J).slug).toBe("ef-1");
      const it = await items(c, "live", null, real.listId);
      expect(it).toHaveLength(3);
      expect(Object.keys(it[0]!).sort()).toEqual(ITEM_KEYS);
      expect(it.map((x) => x.position)).toEqual([1, 2, 3]);
      expect(it[0]).toMatchObject({ name: "Caderno 1", normalized_name: "caderno 1", category: "papelaria", quantity: 2, unit: "un" });
      const all = JSON.stringify([s, l, it, await schools(c, "live", null), await schoolLists(c, "live", null, real.inep)]);
      for (const bad of ["diretora.secreta", "+5565988887777", "Rua Sigilosa", "78000123", "confidence", "alerts", "created_by", "approved_by", "submission_id", "current_version_id", "publication_key", "registry_source", "source_batch_id", real.versionId, IDS.admin]) {
        expect(all, bad).not.toContain(bad);
      }
      // escola verificada -> verified true (claimed continua false: cadastro não é verificação)
      await c.query("reset role");
      await c.query("update public.schools set verification_status = 'verified' where id = $1", [real.schoolId]);
      expect((await school(c, "live", null, real.inep))?.verified).toBe(true);
    });
  });

  it("só a versão atual é exposta (superseded fica fora); itens da versão atual", async () => {
    await inTx(async (c) => {
      const real = await seedPublishedList(c, { demo: false, items: 2 });
      const v2 = await seedCandidate(c, real.listId, 5);
      await c.query("select public.list_approve_version($1, $2, $3)", [real.listId, v2, IDS.admin]);
      await c.query("select public.list_publish_version($1, $2, $3)", [real.listId, v2, IDS.admin]);
      const l = (await list(c, "live", null, real.listId))!;
      expect(l.version).toBe(2);
      expect(l.item_count).toBe(5);
      expect(await items(c, "live", null, real.listId)).toHaveLength(5);
      const versions = await c.query("select status from public.list_versions where list_id = $1 order by version_number", [real.listId]);
      expect(versions.rows.map((r) => r.status)).toEqual(["superseded", "published"]);
    });
  });

  it("cobertura por UF: fora da cobertura = inexistente; nulo = nacional; filtros city/uf/q/has_lists", async () => {
    await inTx(async (c) => {
      const mt = await seedPublishedList(c, { demo: false });
      await c.query("update public.municipalities set is_enabled = true where ibge_code = '5208707'");
      await c.query("insert into public.municipalities (ibge_code, uf, name, is_enabled) values ('5208707', 'GO', 'Goiânia', true) on conflict (ibge_code) do update set is_enabled = true");
      const go = await seedPublishedList(c, { demo: false, enabledMunicipality: false });
      await c.query("update public.municipalities set is_enabled = true where ibge_code = '5208707'");
      expect(await school(c, "live", ["MT"], go.inep)).toBeNull();
      expect(await list(c, "live", ["MT"], go.listId)).toBeNull();
      expect(await items(c, "live", ["MT"], go.listId)).toEqual([]);
      expect(await school(c, "live", ["GO"], go.inep)).not.toBeNull();
      expect(await school(c, "live", ["MT", "GO"], go.inep)).not.toBeNull();
      expect(await school(c, "live", null, go.inep)).not.toBeNull();
      const onlyMt = await schools(c, "live", ["MT"]);
      expect(onlyMt.map((s) => s.inep)).toContain(mt.inep);
      expect(onlyMt.map((s) => s.inep)).not.toContain(go.inep);
      expect((await schools(c, "live", null, { city: "5208707" })).map((s) => s.inep)).toEqual([go.inep]);
      expect((await schools(c, "live", null, { uf: "GO" })).map((s) => s.inep)).toEqual([go.inep]);
      // q com acento e caixa: "Escóla LISTA" casa "escola lista teste"
      const byQ = await schools(c, "live", null, { q: "Escóla LISTA" });
      expect(byQ.map((s) => s.inep)).toEqual(expect.arrayContaining([mt.inep, go.inep]));
      expect((await schools(c, "live", null, { q: "zzz-nao-existe" })).length).toBe(0);
      // has_lists: escola sem lista publicada fica de fora com true
      await c.query(
        `insert into public.schools (inep, name, normalized_name, network, municipality_id)
         select '54999901', 'Escola Sem Lista', 'escola sem lista', 'municipal', m.id from public.municipalities m where m.ibge_code = '5103403'`,
      );
      expect((await schools(c, "live", null, { has: true })).map((s) => s.inep)).not.toContain("54999901");
      expect((await schools(c, "live", null, { has: false })).map((s) => s.inep)).toContain("54999901");
      expect((await schools(c, "live", null, { q: "sem lista" }))[0]).toMatchObject({ inep: "54999901", published_lists_count: 0 });
    });
  });

  it("paginação keyset estável e sem repetição (escolas, listas, itens)", async () => {
    await inTx(async (c) => {
      const s1 = await seedPublishedList(c, { demo: false, slug: "ef-1", items: 7 });
      for (const slug of ["ef-3", "ef-2", "ei-pre-1"]) await seedPublishedList(c, { demo: false, slug, schoolId: s1.schoolId, inep: s1.inep });
      await seedPublishedList(c, { demo: false, slug: "ef-1", year: 2026, schoolId: s1.schoolId, inep: s1.inep });
      for (let i = 0; i < 4; i++) await seedPublishedList(c, { demo: false });
      // escolas: páginas de 2, ordem (normalized_name, inep)
      const seen: string[] = [];
      let afterName: string | undefined;
      let afterInep: string | undefined;
      for (let guard = 0; guard < 20; guard++) {
        const page = await schools(c, "live", null, { limit: 2, afterName, afterInep });
        if (page.length === 0) break;
        for (const s of page) seen.push(s.inep as string);
        const last = page[page.length - 1]!;
        afterName = (await c.query("select normalized_name as n from public.schools where inep = $1", [last.inep])).rows[0]?.n as string;
        afterInep = last.inep as string;
        if (page.length < 2) break;
      }
      expect(new Set(seen).size).toBe(seen.length);
      expect(seen.length).toBeGreaterThanOrEqual(5);
      // listas da escola: ordem (school_year desc, grade.sort_order, id)
      const lists = await schoolLists(c, "live", null, s1.inep);
      expect(lists.map((l) => `${l.school_year}:${(l.grade as J).slug}`)).toEqual(["2027:ei-pre-1", "2027:ef-1", "2027:ef-2", "2027:ef-3", "2026:ef-1"]);
      expect((await schoolLists(c, "live", null, s1.inep, 2026)).map((l) => l.school_year)).toEqual([2026]);
      expect((await school(c, "live", null, s1.inep))?.published_lists_count).toBe(5);
      const r2 = await c.query("select public.b2b_v1_school_lists($1, null, $2, null, $3, $4, $5, 50) as j", ["live", s1.inep, 2027, 5, lists[1]!.id]);
      expect(r2.rows.map((x) => (x.j as J).id)).toEqual(lists.slice(2).map((l) => l.id));
      // itens por position em páginas de 3
      const p1 = await items(c, "live", null, s1.listId, null, 3);
      const p2 = await items(c, "live", null, s1.listId, p1[2]!.position as number, 3);
      const p3 = await items(c, "live", null, s1.listId, p2[2]!.position as number, 3);
      expect([...p1, ...p2, ...p3].map((i) => i.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(await c.query("select 1")).toBeTruthy();
    });
  });

  it("resultado é subconjunto do que anon lê pela RLS; cópia de pai nunca aparece; match_items traz normalized_name", async () => {
    await inTx(async (c) => {
      const real = await seedPublishedList(c, { demo: false, items: 2 });
      const draft = await seedInState(c, "approved", { inep: "55999901" });
      await c.query("update public.school_lists set is_demo = false where id = $1", [draft.listId]);
      await c.query("update public.schools set is_demo = false where id = $1", [draft.schoolId]);
      // cópia de pai com nome de aluno no item
      const submission = (await c.query(
        `insert into public.list_submissions (submitted_by, source, school_id, grade, school_year, storage_path, file_name, mime_type, size_bytes)
         values ($1, 'parent', $2, '1º ano', 2027, $3, 'l.pdf', 'application/pdf', 100) returning id`,
        [IDS.parent, real.schoolId, `${IDS.parent}/x/l.pdf`],
      )).rows[0]?.id as string;
      await c.query("insert into public.parent_list_copies (submission_id, owner_id, items) values ($1, $2, $3::jsonb)", [submission, IDS.parent, JSON.stringify([{ name: "Caderno do Aluno Fulaninho", quantity: 1 }])]);
      const ids = (await schools(c, "live", null)).map((s) => s.inep as string);
      const listIds = (await c.query("select id from public.school_lists where school_id in (select id from public.schools where inep = any($1::text[]))", [ids])).rows.map((r) => r.id as string);
      const visibleLists: string[] = [];
      for (const id of listIds) if (await list(c, "live", null, id)) visibleLists.push(id);
      expect(visibleLists).toContain(real.listId);
      expect(visibleLists).not.toContain(draft.listId);
      await switchTo(c, "anon");
      const anonLists = (await c.query("select id from public.school_lists where id = any($1::uuid[])", [visibleLists])).rows.map((r) => r.id);
      expect(anonLists.sort()).toEqual([...visibleLists].sort());
      const anonSchools = (await c.query("select inep from public.schools where inep = any($1::text[])", [ids])).rows.map((r) => r.inep);
      expect(anonSchools.sort()).toEqual([...ids].sort());
      await backToSuper(c);
      const m = await c.query("select public.b2b_v1_list_match_items($1, null, $2) as j", ["live", real.listId]);
      const mi = m.rows.map((x) => x.j as J);
      expect(mi).toHaveLength(2);
      expect(Object.keys(mi[0]!).sort()).toEqual(ITEM_KEYS);
      const everything = JSON.stringify([mi, await items(c, "live", null, real.listId), await schools(c, "live", null)]);
      expect(everything).not.toContain("Fulaninho");
      expect(everything).not.toContain(IDS.parent);
      await transition(c, draft.listId, "published").catch(() => undefined);
    });
  });

  it("b2b_partner_overview: agregados do portal por ambiente e cobertura, sem dado pessoal", async () => {
    await inTx(async (c) => {
      const p = await seedPartner(c, { status: "active", ownerId: IDS.parent, coverageUfs: ["MT"], limits: { liveDay: 500 } });
      const k = await seedKey(c, p, { environment: "live" });
      await seedPublishedList(c, { demo: false });
      await seedPublishedList(c, { demo: true });
      await c.query("insert into public.b2b_usage_daily (key_id, partner_id, day, endpoint, status_class, request_count, match_items_total, match_items_matched) values ($1, $2, current_date, 'schools.list', '2xx', 7, 0, 0), ($1, $2, current_date, 'carts.match', '2xx', 2, 10, 6), ($1, $2, current_date, 'lists.items', '4xx', 3, 0, 0), ($1, $2, current_date, 'lists.items', '429', 1, 0, 0), ($1, $2, current_date - 40, 'schools.list', '2xx', 100, 0, 0)", [k.id, p]);
      const o = (await c.query("select public.b2b_partner_overview($1, 30) as j", [p])).rows[0]?.j as J;
      expect(o.calls_month).toBe(13);
      expect(o.calls_today).toBe(13);
      expect(o.errors_4xx_today).toBe(3);
      expect(o.rate_limited_today).toBe(1);
      expect(o.match_total).toBe(10);
      expect(o.match_matched).toBe(6);
      expect(o.lists_available_live).toBeGreaterThanOrEqual(1);
      expect(o.lists_available_test).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(o.calls_by_day)).toBe(true);
      expect((o.calls_by_day as J[]).length).toBe(30);
      expect((o.calls_by_day as J[]).at(-1)).toMatchObject({ count: 13 });
      const keys = o.keys as J[];
      expect(keys.map((x) => x.id)).toEqual([k.id]);
      expect(keys[0]).toMatchObject({ environment: "live", last4: k.secret.slice(-4), status: "active" });
      expect(JSON.stringify(o)).not.toContain(k.secret);
      expect(JSON.stringify(o)).not.toContain("key_hash");
      expect(keys[0]!.last_used_on).toBeTruthy();
      const none = (await c.query("select public.b2b_partner_overview($1, 30) as j", ["00000000-0000-4000-8000-0000000000ff"])).rows[0]?.j;
      expect(none).toBeNull();
    });
  });
});
