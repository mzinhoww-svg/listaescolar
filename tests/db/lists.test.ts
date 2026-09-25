import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GRADES } from "../../features/grades/catalog";
import { attempt, cleanupUsers, IDS, inTx, seedUsers, withSuperuser, type Identity } from "./helpers";
import {
  LIST_STATES, backToSuper, publish, seedCandidate, seedInState, seedList, seedSchool, switchTo,
} from "./list-fixtures";

const TABLES = ["grades", "school_lists", "list_versions", "list_items", "list_status_events"];

describe("S05 schema: listas, versões e itens", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  for (const [name, values] of Object.entries({
    version_status: ["candidate", "published", "superseded", "archived"],
    grade_stage: ["ei", "ef", "em"],
    list_version_source: ["school_upload", "parent_upload", "admin"],
  })) {
    it(`enum ${name} tem os valores exatos, em ordem`, async () => {
      const labels = await withSuperuser(async (c) => {
        const r = await c.query<{ v: string }>(`select unnest(enum_range(null::public.${name}))::text as v`);
        return r.rows.map((x) => x.v);
      });
      expect(labels).toEqual(values);
    });
  }

  it("todas as tabelas têm RLS habilitada, id uuid, created_at e updated_at", async () => {
    await withSuperuser(async (c) => {
      for (const t of TABLES) {
        const rls = await c.query("select relrowsecurity from pg_class where oid = $1::regclass", [`public.${t}`]);
        expect(rls.rows[0]?.relrowsecurity, t).toBe(true);
        const cols = await c.query<{ column_name: string; data_type: string }>(
          "select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = $1",
          [t],
        );
        const byName = new Map(cols.rows.map((r) => [r.column_name, r.data_type]));
        expect(byName.get("id"), `${t}.id`).toBe("uuid");
        expect(byName.has("created_at"), `${t}.created_at`).toBe(true);
        expect(byName.has("updated_at"), `${t}.updated_at`).toBe(true);
      }
    });
  });

  it("grades espelha o catálogo TS: mesmos slugs, nomes, etapas e ordem", async () => {
    await withSuperuser(async (c) => {
      const r = await c.query<{ slug: string; name: string; stage: string; sort_order: number }>(
        "select slug, name, stage::text, sort_order from public.grades order by sort_order",
      );
      expect(r.rows).toEqual(GRADES.map((g, i) => ({ slug: g.slug, name: g.label, stage: g.stage, sort_order: i + 1 })));
      expect(r.rows).toHaveLength(16);
    });
  });

  describe("checks e integridade", () => {
    it("ano letivo fora de 2020..2100 é recusado; série inexistente é recusada", async () => {
      await inTx(async (c) => {
        const school = await seedSchool(c);
        for (const year of [2019, 2101]) {
          const r = await attempt(
            c,
            "insert into public.school_lists (school_id, grade_id, school_year) select $1, id, $2 from public.grades where slug = 'ef-1'",
            [school, year],
          );
          expect(r.code, String(year)).toBe("23514");
        }
        const bad = await attempt(
          c,
          "insert into public.school_lists (school_id, grade_id, school_year) values ($1, gen_random_uuid(), 2027)",
          [school],
        );
        expect(bad.code).toBe("23503");
      });
    });

    it("unique (escola, série, ano)", async () => {
      await inTx(async (c) => {
        const school = await seedSchool(c);
        await seedList(c, school, "ef-1", 2027);
        await seedList(c, school, "ef-2", 2027);
        await seedList(c, school, "ef-1", 2028);
        const dup = await attempt(
          c,
          "insert into public.school_lists (school_id, grade_id, school_year) select $1, id, 2027 from public.grades where slug = 'ef-1'",
          [school],
        );
        expect(dup.code).toBe("23505");
      });
    });

    it("lista published sem versão atual viola o check; lista nova nasce draft sem versão atual", async () => {
      await inTx(async (c) => {
        const school = await seedSchool(c);
        const list = await seedList(c, school);
        const row = await c.query("select status, current_version_id, published_at, archived_at from public.school_lists where id = $1", [list]);
        expect(row.rows[0]).toEqual({ status: "draft", current_version_id: null, published_at: null, archived_at: null });
        const bad = await attempt(c, "update public.school_lists set status = 'published', published_at = now() where id = $1", [list]);
        expect(bad.code).toBe("23514");
      });
    });

    it("current_version_id em lista não publicada viola o check", async () => {
      await inTx(async (c) => {
        const { listId, versionId } = await seedInState(c, "approved");
        const bad = await attempt(c, "update public.school_lists set current_version_id = $2 where id = $1", [listId, versionId]);
        expect(bad.code).toBe("23514");
      });
    });

    it("current_version_id apontando para versão de outra lista é recusado (FK composta)", async () => {
      await inTx(async (c) => {
        const a = await seedInState(c, "published", { inep: "51999901", slug: "ef-1" });
        const b = await seedInState(c, "published", { schoolId: a.schoolId, slug: "ef-2" });
        const upd = await attempt(c, "update public.school_lists set current_version_id = $2 where id = $1", [a.listId, b.versionId]);
        expect(upd.error).toBeNull(); // FK deferrable: a checagem é no fim da transação
        const chk = await attempt(c, "set constraints all immediate");
        expect(chk.code).toBe("23503");
      });
    });

    it("current_version_id apontando para versão não publicada é recusado", async () => {
      await inTx(async (c) => {
        const { listId } = await seedInState(c, "published");
        const cand = await seedCandidate(c, listId);
        const upd = await attempt(c, "update public.school_lists set current_version_id = $2 where id = $1", [listId, cand]);
        expect(upd.error).toBeNull();
        const chk = await attempt(c, "set constraints all immediate");
        expect(chk.code).toBe("23514");
      });
    });

    it("arquivar uma versão que ainda é a atual é recusado no fim da transação", async () => {
      await inTx(async (c) => {
        const { versionId } = await seedInState(c, "published");
        const upd = await attempt(c, "update public.list_versions set status = 'archived', archived_at = now() where id = $1", [versionId]);
        expect(upd.error).toBeNull();
        const chk = await attempt(c, "set constraints all immediate");
        expect(chk.code).toBe("23514");
      });
    });

    it("no máximo uma versão published por lista (índice parcial)", async () => {
      await inTx(async (c) => {
        const { listId } = await seedInState(c, "approved");
        const v2 = await seedCandidate(c, listId);
        const v3 = await seedCandidate(c, listId);
        const ok = await attempt(c, "update public.list_versions set status = 'published', published_at = now() where id = $1", [v2]);
        expect(ok.error).toBeNull();
        const dup = await attempt(c, "update public.list_versions set status = 'published', published_at = now() where id = $1", [v3]);
        expect(dup.code).toBe("23505");
      });
    });

    it("transições diretas ilegais de versão e mudança de list_id/version_number são recusadas", async () => {
      await inTx(async (c) => {
        const { listId, versionId } = await seedInState(c, "published");
        const other = await seedList(c, await seedSchool(c, "51999902"));
        const back = await attempt(c, "update public.list_versions set status = 'candidate', published_at = null where id = $1", [versionId]);
        expect(back.code).toBe("23514");
        const move = await attempt(c, "update public.list_versions set list_id = $2 where id = $1", [versionId, other]);
        expect(move.code).toBe("23514");
        const renum = await attempt(c, "update public.list_versions set version_number = 99 where id = $1", [versionId]);
        expect(renum.code).toBe("23514");
        expect(listId).toBeTruthy();
      });
    });

    it("version_number único por lista; published exige published_at; candidate não tem published_at", async () => {
      await inTx(async (c) => {
        const school = await seedSchool(c);
        const list = await seedList(c, school);
        const v = await seedCandidate(c, list);
        const dupNum = await attempt(c, "insert into public.list_versions (list_id, version_number, source) values ($1, 1, 'admin')", [list]);
        expect(dupNum.code).toBe("23505");
        const noTs = await attempt(c, "update public.list_versions set status = 'published' where id = $1", [v]);
        expect(noTs.code).toBe("23514");
        const candTs = await attempt(c, "update public.list_versions set published_at = now() where id = $1", [v]);
        expect(candTs.code).toBe("23514");
      });
    });

    it("escola com listas não pode ser apagada (restrict)", async () => {
      await inTx(async (c) => {
        const school = await seedSchool(c);
        await seedList(c, school);
        const r = await attempt(c, "delete from public.schools where id = $1", [school]);
        expect(r.code).toBe("23503");
      });
    });

    it("itens: quantidade > 0 (nula permitida), confiança 0..1, alertas em array de códigos do spec", async () => {
      await inTx(async (c) => {
        const school = await seedSchool(c);
        const list = await seedList(c, school);
        const v = await seedCandidate(c, list, 0);
        const ins = (pos: number, qty: string, conf: string, alerts: string) =>
          attempt(
            c,
            `insert into public.list_items (version_id, position, original_name, normalized_name, quantity, confidence, alerts)
             values ($1, $2, 'x', 'x', ${qty}, ${conf}, '${alerts}'::jsonb)`,
            [v, pos],
          );
        expect((await ins(1, "null", "null", "[]")).error).toBeNull();
        expect((await ins(2, "0.5", "1", '["handwritten","ambiguous_item"]')).error).toBeNull();
        expect((await ins(3, "0", "0.5", "[]")).code).toBe("23514");
        expect((await ins(4, "-1", "0.5", "[]")).code).toBe("23514");
        expect((await ins(5, "1", "1.5", "[]")).code).toBe("23514");
        expect((await ins(6, "1", "-0.1", "[]")).code).toBe("23514");
        expect((await ins(7, "1", "0.5", '{"a":1}')).code).toBe("23514");
        expect((await ins(8, "1", "0.5", '["codigo_inventado"]')).code).toBe("23514");
        expect((await ins(1, "1", "0.5", "[]")).code).toBe("23505");
        const blank = await attempt(c, "insert into public.list_items (version_id, position, original_name, normalized_name) values ($1, 9, '  ', 'x')", [v]);
        expect(blank.code).toBe("23514");
      });
    });

    it("item_count acompanha inserções e remoções de itens da candidata", async () => {
      await inTx(async (c) => {
        const school = await seedSchool(c);
        const list = await seedList(c, school);
        const v = await seedCandidate(c, list, 3);
        const count = async () => (await c.query("select item_count from public.list_versions where id = $1", [v])).rows[0]?.item_count;
        expect(await count()).toBe(3);
        await c.query("delete from public.list_items where version_id = $1 and position = 3", [v]);
        expect(await count()).toBe(2);
      });
    });
  });

  describe("itens imutáveis fora de candidate", () => {
    for (const state of ["published", "superseded", "archived"] as const) {
      it(`versão ${state}: insert/update/delete de item é recusado; candidate aceita`, async () => {
        await inTx(async (c) => {
          const { listId, versionId } = await seedInState(c, "published");
          const target = versionId;
          const spare = await seedCandidate(c, listId, 0);
          if (state === "superseded") {
            const v2 = await seedCandidate(c, listId, 1);
            await publish(c, listId, v2);
          }
          if (state === "archived") {
            await c.query("select public.list_archive($1, $2, null)", [listId, IDS.admin]);
          }
          const item = (await c.query<{ id: string }>("select id from public.list_items where version_id = $1 limit 1", [target])).rows[0]!.id;
          const ins = await attempt(c, "insert into public.list_items (version_id, position, original_name, normalized_name) values ($1, 50, 'novo', 'novo')", [target]);
          expect(ins.code, "insert").toBe("23514");
          const upd = await attempt(c, "update public.list_items set original_name = 'alterado' where id = $1", [item]);
          expect(upd.code, "update").toBe("23514");
          const del = await attempt(c, "delete from public.list_items where id = $1", [item]);
          expect(del.code, "delete").toBe("23514");
          const move = await attempt(c, "update public.list_items set version_id = $2 where id = $1", [item, spare]);
          expect(move.code, "move").toBe("23514");
        });
      });
    }

    it("candidate aceita insert, update e delete", async () => {
      await inTx(async (c) => {
        const school = await seedSchool(c);
        const list = await seedList(c, school);
        const v = await seedCandidate(c, list, 1);
        expect((await attempt(c, "insert into public.list_items (version_id, position, original_name, normalized_name) values ($1, 2, 'a', 'a')", [v])).error).toBeNull();
        expect((await attempt(c, "update public.list_items set original_name = 'b' where version_id = $1", [v])).error).toBeNull();
        expect((await attempt(c, "delete from public.list_items where version_id = $1", [v])).error).toBeNull();
      });
    });
  });
});

const ALL_IDENTITIES: Identity[] = ["anon", "parent", "school_member", "stationery_member", "orphan", "admin", "system", "system_profile"];
const PUBLIC_IDS: Identity[] = ["anon", "parent", "school_member", "stationery_member", "orphan"];
const PRIVILEGED: Identity[] = ["admin", "system", "system_profile"];

describe("S05 RLS: o público só vê lista publicada (e versões published/superseded dela)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  /** 10 estados + lista com versão superseded + lista publicada em município desabilitado. */
  async function seedWorld(c: Parameters<typeof seedInState>[0]) {
    const gradeFor: Record<string, string> = {};
    const schoolId = await seedSchool(c, "51999911");
    LIST_STATES.forEach((s, i) => (gradeFor[s] = GRADES[i]!.slug));
    const lists: Record<string, string> = {};
    for (const s of LIST_STATES) lists[s] = (await seedInState(c, s, { schoolId, slug: gradeFor[s] })).listId;
    const p2 = await seedInState(c, "published", { schoolId, slug: "em-1" });
    const v2 = await seedCandidate(c, p2.listId, 2);
    await publish(c, p2.listId, v2); // v1 vira superseded
    const disabled = await seedSchool(c, "52999911", false);
    await seedInState(c, "published", { schoolId: disabled, slug: "ef-1" });
    return { lists, p2 };
  }

  for (const who of PUBLIC_IDS) {
    it(`${who}: vê só a lista published e suas versões published/superseded; nada de candidate/archived/desabilitado`, async () => {
      await inTx(async (c) => {
        const { lists } = await seedWorld(c);
        await switchTo(c, who);
        const l = await c.query<{ id: string; status: string }>("select id, status::text from public.school_lists");
        expect(l.rows.map((r) => r.status).sort()).toEqual(["published", "published"]);
        expect(l.rows.map((r) => r.id)).toContain(lists.published);
        for (const s of LIST_STATES.filter((x) => x !== "published")) {
          expect(l.rows.map((r) => r.id), s).not.toContain(lists[s]);
        }
        const v = await c.query<{ status: string }>("select status::text from public.list_versions order by status");
        expect(v.rows.map((r) => r.status)).toEqual(["published", "published", "superseded"]);
        const items = await c.query("select id from public.list_items");
        expect(items.rowCount).toBe(6); // 3 versões visíveis x 2 itens
        const g = await c.query("select 1 from public.grades");
        expect(g.rowCount).toBe(16);
      });
    });

    it(`${who}: não lê alertas/confiança de itens, submission_id/created_by de versões nem eventos; não escreve`, async () => {
      await inTx(async (c) => {
        const { lists } = await seedWorld(c);
        await switchTo(c, who);
        expect((await attempt(c, "select * from public.list_items")).code).toBe("42501");
        expect((await attempt(c, "select alerts from public.list_items")).code).toBe("42501");
        expect((await attempt(c, "select confidence from public.list_items")).code).toBe("42501");
        expect((await attempt(c, "select submission_id from public.list_versions")).code).toBe("42501");
        expect((await attempt(c, "select created_by from public.list_versions")).code).toBe("42501");
        expect((await attempt(c, "select original_name, quantity, unit, category from public.list_items")).error).toBeNull();
        const ev = await attempt(c, "select * from public.list_status_events");
        if (who === "anon") expect(ev.code).toBe("42501");
        else expect(ev.rowCount).toBe(0);
        for (const sql of [
          "insert into public.school_lists (school_id, grade_id, school_year) select school_id, grade_id, 2030 from public.school_lists limit 1",
          "update public.school_lists set status = 'archived'",
          "delete from public.school_lists",
          "update public.list_versions set status = 'archived'",
          "delete from public.list_versions",
          "insert into public.list_items (version_id, position, original_name, normalized_name) select id, 99, 'x', 'x' from public.list_versions limit 1",
          "delete from public.list_items",
          "update public.grades set name = 'x'",
          "insert into public.list_status_events (list_id, to_status) select id, 'draft' from public.school_lists limit 1",
        ]) {
          const r = await attempt(c, sql);
          expect(r.code ?? `rows:${r.rowCount}`, sql).toMatch(/^(42501|rows:0)$/);
        }
        await backToSuper(c);
        const still = await c.query("select count(*)::int as n from public.school_lists where id = $1 and status = 'published'", [lists.published]);
        expect(still.rows[0]?.n).toBe(1);
      });
    });
  }

  for (const who of PRIVILEGED) {
    it(`${who}: lê todas as listas, versões e eventos`, async () => {
      await inTx(async (c) => {
        await seedWorld(c);
        await switchTo(c, who);
        expect((await c.query("select 1 from public.school_lists")).rowCount).toBe(12);
        expect((await c.query("select 1 from public.list_versions")).rowCount).toBe(13);
        expect((await c.query("select 1 from public.list_status_events")).rowCount).toBeGreaterThan(10);
      });
    });
  }

  it("cobre todas as identidades esperadas", () => {
    expect([...PUBLIC_IDS, ...PRIVILEGED].sort()).toEqual([...ALL_IDENTITIES].sort());
  });

  it("lista published com nova versão candidata: continua pública com a versão antiga; candidata invisível", async () => {
    await inTx(async (c) => {
      const { listId, versionId } = await seedInState(c, "published", { inep: "51999912" });
      const cand = await seedCandidate(c, listId, 2);
      await switchTo(c, "anon");
      const l = await c.query("select current_version_id from public.school_lists where id = $1", [listId]);
      expect(l.rows[0]?.current_version_id).toBe(versionId);
      const v = await c.query<{ id: string }>("select id from public.list_versions where list_id = $1", [listId]);
      expect(v.rows.map((r) => r.id)).toEqual([versionId]);
      expect((await c.query("select 1 from public.list_items where version_id = $1", [cand])).rowCount).toBe(0);
    });
  });

  it("lista arquivada some, inclusive versões superseded/archived dela", async () => {
    await inTx(async (c) => {
      const { listId } = await seedInState(c, "published", { inep: "51999913" });
      const v2 = await seedCandidate(c, listId, 1);
      await publish(c, listId, v2);
      await c.query("select public.list_archive($1, $2, 'teste')", [listId, IDS.admin]);
      await switchTo(c, "anon");
      expect((await c.query("select 1 from public.school_lists where id = $1", [listId])).rowCount).toBe(0);
      expect((await c.query("select 1 from public.list_versions where list_id = $1", [listId])).rowCount).toBe(0);
      expect((await c.query("select 1 from public.list_items")).rowCount).toBe(0);
    });
  });

  it("service_role não altera status/versão atual nem insere versões direto (só pelas funções)", async () => {
    await inTx(async (c) => {
      const { listId, versionId } = await seedInState(c, "approved", { inep: "51999914" });
      await switchTo(c, "system");
      expect((await attempt(c, "update public.school_lists set status = 'published' where id = $1", [listId])).code).toBe("42501");
      expect((await attempt(c, "update public.school_lists set current_version_id = $2 where id = $1", [listId, versionId])).code).toBe("42501");
      expect((await attempt(c, "insert into public.list_versions (list_id, version_number, source) values ($1, 9, 'admin')", [listId])).code).toBe("42501");
      expect((await attempt(c, "update public.list_versions set status = 'published' where id = $1", [versionId])).code).toBe("42501");
      expect((await attempt(c, "delete from public.list_versions where id = $1", [versionId])).code).toBe("42501");
      expect((await attempt(c, "delete from public.school_lists where id = $1", [listId])).code).toBe("42501");
      expect((await attempt(c, "update public.list_status_events set reason = 'x'")).code).toBe("42501");
      expect((await attempt(c, "insert into public.list_status_events (list_id, to_status) values ($1, 'draft')", [listId])).code).toBe("42501");
      // pode criar lista (rascunho) e mexer nos itens da candidata
      expect((await attempt(c, "insert into public.school_lists (school_id, grade_id, school_year) select school_id, grade_id, 2031 from public.school_lists where id = $1", [listId])).error).toBeNull();
      expect((await attempt(c, "insert into public.list_items (version_id, position, original_name, normalized_name, alerts, confidence) values ($1, 77, 'a', 'a', '[]', 0.5)", [versionId])).error).toBeNull();
      expect((await attempt(c, "select alerts, confidence from public.list_items where version_id = $1", [versionId])).rowCount).toBeGreaterThan(0);
    });
  });

  it("eventos são imutáveis (update/delete bloqueados por gatilho para superuser)", async () => {
    await inTx(async (c) => {
      await seedInState(c, "approved", { inep: "51999915" });
      expect((await attempt(c, "update public.list_status_events set reason = 'x'")).code).toBe("23514");
      expect((await attempt(c, "delete from public.list_status_events")).code).toBe("23514");
    });
  });
});
