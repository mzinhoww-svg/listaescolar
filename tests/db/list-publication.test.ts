import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { attempt, cleanupUsers, DATABASE_URL, IDS, inTx, seedUsers, withSuperuser } from "./helpers";
import {
  cleanupCommitted, LIST_STATES, publish, seedCandidate, seedInState, seedList, seedSchool, switchTo,
} from "./list-fixtures";

const PUBLISH = "select public.list_publish_version($1, $2, $3) as n";
const ARCHIVE = "select public.list_archive($1, $2, $3)";
const CREATE = "select version_id, version_number from public.list_create_candidate_version($1, $2::public.list_version_source, $3, $4)";

describe("S05 list_publish_version", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("publica de approved: versão published, lista published, versão atual, datas e evento", async () => {
    await inTx(async (c) => {
      const { listId, versionId } = await seedInState(c, "approved");
      const r = await attempt(c, PUBLISH, [listId, versionId, IDS.admin]);
      expect(r.error).toBeNull();
      expect(r.rows[0]?.n).toBe(1);
      const l = await c.query("select status::text, current_version_id, published_at from public.school_lists where id = $1", [listId]);
      expect(l.rows[0]?.status).toBe("published");
      expect(l.rows[0]?.current_version_id).toBe(versionId);
      expect(l.rows[0]?.published_at).not.toBeNull();
      const v = await c.query("select status::text, published_at from public.list_versions where id = $1", [versionId]);
      expect(v.rows[0]?.status).toBe("published");
      expect(v.rows[0]?.published_at).not.toBeNull();
      const ev = await c.query(
        "select from_status::text, to_status::text, actor_id, version_id from public.list_status_events where list_id = $1 order by created_at desc, id desc limit 1",
        [listId],
      );
      expect(ev.rows[0]).toEqual({ from_status: "approved", to_status: "published", actor_id: IDS.admin, version_id: versionId });
      await c.query("set constraints all immediate"); // consistência no fim da transação
    });
  });

  for (const state of LIST_STATES.filter((s) => s !== "approved" && s !== "published")) {
    it(`lista ${state} não publica (23514) e nada muda`, async () => {
      await inTx(async (c) => {
        const { listId, versionId } = await seedInState(c, state);
        // archived não aceita candidata nova: usa a que já existe (arquivada, não candidate)
        const r = await attempt(c, PUBLISH, [listId, versionId, IDS.admin]);
        expect(r.code).toBe("23514");
        const l = await c.query("select status::text, current_version_id from public.school_lists where id = $1", [listId]);
        expect(l.rows[0]?.status).toBe(state);
        expect(l.rows[0]?.current_version_id).toBeNull();
      });
    });
  }

  it("versão de outra lista é recusada; nada muda", async () => {
    await inTx(async (c) => {
      const a = await seedInState(c, "approved", { inep: "51999921", slug: "ef-1" });
      const b = await seedInState(c, "approved", { schoolId: a.schoolId, slug: "ef-2" });
      const r = await attempt(c, PUBLISH, [a.listId, b.versionId, IDS.admin]);
      expect(r.code).toBe("22023");
      const st = await c.query("select status::text from public.school_lists where id = $1", [a.listId]);
      expect(st.rows[0]?.status).toBe("approved");
      expect((await c.query("select status::text from public.list_versions where id = $1", [b.versionId])).rows[0]?.status).toBe("candidate");
    });
  });

  it("versão inexistente, ator nulo e lista inexistente", async () => {
    await inTx(async (c) => {
      const { listId, versionId } = await seedInState(c, "approved");
      expect((await attempt(c, PUBLISH, [listId, "00000000-0000-4000-8000-00000000dead", IDS.admin])).code).toBe("22023");
      const noActor = await attempt(c, PUBLISH, [listId, versionId, null]);
      expect(noActor.code).toBe("22023");
      expect(noActor.error).toContain("p_actor_id");
      expect((await attempt(c, PUBLISH, ["00000000-0000-4000-8000-00000000dead", versionId, IDS.admin])).code).toBe("P0002");
    });
  });

  it("troca atômica: lista published + nova candidata -> nova published, anterior superseded", async () => {
    await inTx(async (c) => {
      const { listId, versionId: v1 } = await seedInState(c, "published");
      const v2 = await seedCandidate(c, listId, 3);
      const r = await attempt(c, PUBLISH, [listId, v2, IDS.admin]);
      expect(r.error).toBeNull();
      expect(r.rows[0]?.n).toBe(2);
      const v = await c.query("select id, status::text from public.list_versions where list_id = $1 order by version_number", [listId]);
      expect(v.rows).toEqual([{ id: v1, status: "superseded" }, { id: v2, status: "published" }]);
      const l = await c.query("select status::text, current_version_id from public.school_lists where id = $1", [listId]);
      expect(l.rows[0]).toEqual({ status: "published", current_version_id: v2 });
      await c.query("set constraints all immediate");
    });
  });

  it("não republica versão já publicada/superseded/archived (só candidate)", async () => {
    await inTx(async (c) => {
      const { listId, versionId: v1 } = await seedInState(c, "published");
      expect((await attempt(c, PUBLISH, [listId, v1, IDS.admin])).code).toBe("22023");
      const v2 = await seedCandidate(c, listId, 1);
      await publish(c, listId, v2);
      expect((await attempt(c, PUBLISH, [listId, v1, IDS.admin])).code).toBe("22023"); // superseded
    });
  });

  it("depois de publicar, itens ficam imutáveis e a antiga superseded continua pública com a lista", async () => {
    await inTx(async (c) => {
      const { listId, versionId: v1 } = await seedInState(c, "published");
      const v2 = await seedCandidate(c, listId, 1);
      await publish(c, listId, v2);
      expect((await attempt(c, "update public.list_items set original_name = 'x' where version_id = $1", [v2])).code).toBe("23514");
      await switchTo(c, "anon");
      const v = await c.query<{ id: string; status: string }>("select id, status::text from public.list_versions where list_id = $1 order by version_number", [listId]);
      expect(v.rows).toEqual([{ id: v1, status: "superseded" }, { id: v2, status: "published" }]);
    });
  });
});

describe("S05 list_archive", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("published -> archived: todas as versões archived, sem versão atual, archived_at, evento com motivo", async () => {
    await inTx(async (c) => {
      const { listId } = await seedInState(c, "published");
      const v2 = await seedCandidate(c, listId, 1);
      await publish(c, listId, v2);
      await seedCandidate(c, listId, 1); // candidata pendente também vira archived
      const r = await attempt(c, ARCHIVE, [listId, IDS.admin, "ano encerrado"]);
      expect(r.error).toBeNull();
      const l = await c.query("select status::text, current_version_id, archived_at from public.school_lists where id = $1", [listId]);
      expect(l.rows[0]?.status).toBe("archived");
      expect(l.rows[0]?.current_version_id).toBeNull();
      expect(l.rows[0]?.archived_at).not.toBeNull();
      const v = await c.query("select status::text, archived_at from public.list_versions where list_id = $1", [listId]);
      expect(v.rowCount).toBe(3);
      expect(v.rows.every((x) => x.status === "archived" && x.archived_at !== null)).toBe(true);
      const ev = await c.query("select from_status::text, to_status::text, reason, actor_id from public.list_status_events where list_id = $1 order by created_at desc, id desc limit 1", [listId]);
      expect(ev.rows[0]).toEqual({ from_status: "published", to_status: "archived", reason: "ano encerrado", actor_id: IDS.admin });
      await c.query("set constraints all immediate");
    });
  });

  for (const state of LIST_STATES.filter((s) => s !== "published")) {
    it(`lista ${state} não arquiva (23514)`, async () => {
      await inTx(async (c) => {
        const { listId } = await seedInState(c, state);
        expect((await attempt(c, ARCHIVE, [listId, IDS.admin, null])).code).toBe("23514");
      });
    });
  }

  it("arquivada é terminal: não reabre, não recebe versão nem publicação", async () => {
    await inTx(async (c) => {
      const { listId, versionId } = await seedInState(c, "archived");
      expect((await attempt(c, "select public.list_transition($1, 'draft', $2, null)", [listId, IDS.admin])).code).toBe("23514");
      expect((await attempt(c, PUBLISH, [listId, versionId, IDS.admin])).code).toBe("23514");
      expect((await attempt(c, CREATE, [listId, "admin", null, null])).code).toBe("23514");
    });
  });

  it("lista inexistente: P0002", async () => {
    await inTx(async (c) => {
      expect((await attempt(c, ARCHIVE, ["00000000-0000-4000-8000-00000000dead", IDS.admin, null])).code).toBe("P0002");
    });
  });
});

describe("S05 list_create_candidate_version", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("números sequenciais por lista, começando em 1; independentes entre listas", async () => {
    await inTx(async (c) => {
      const school = await seedSchool(c);
      const a = await seedList(c, school, "ef-1");
      const b = await seedList(c, school, "ef-2");
      const nums: number[] = [];
      for (const l of [a, a, b, a, b]) {
        const r = await c.query<{ version_number: number }>(CREATE, [l, "school_upload", "00000000-0000-4000-8000-0000000000aa", IDS.parent]);
        nums.push(r.rows[0]!.version_number);
      }
      expect(nums).toEqual([1, 2, 1, 3, 2]);
      const v = await c.query("select status::text, source::text, submission_id, created_by, item_count from public.list_versions where list_id = $1 order by version_number limit 1", [a]);
      expect(v.rows[0]).toEqual({
        status: "candidate", source: "school_upload", submission_id: "00000000-0000-4000-8000-0000000000aa", created_by: IDS.parent, item_count: 0,
      });
    });
  });

  it("lista published continua pública e com a versão antiga; candidata nova é invisível", async () => {
    await inTx(async (c) => {
      const { listId, versionId } = await seedInState(c, "published");
      const r = await c.query<{ version_id: string; version_number: number }>(CREATE, [listId, "parent_upload", null, null]);
      expect(r.rows[0]?.version_number).toBe(2);
      const st = await c.query("select status::text, current_version_id from public.school_lists where id = $1", [listId]);
      expect(st.rows[0]).toEqual({ status: "published", current_version_id: versionId });
      await switchTo(c, "anon");
      expect((await c.query("select 1 from public.list_versions where id = $1", [r.rows[0]!.version_id])).rowCount).toBe(0);
      expect((await c.query("select 1 from public.list_versions where id = $1", [versionId])).rowCount).toBe(1);
    });
  });

  it("lista inexistente, fonte inválida e criador inexistente", async () => {
    await inTx(async (c) => {
      const school = await seedSchool(c);
      const list = await seedList(c, school);
      expect((await attempt(c, CREATE, ["00000000-0000-4000-8000-00000000dead", "admin", null, null])).code).toBe("P0002");
      expect((await attempt(c, CREATE, [list, "fonte_inventada", null, null])).code).toBe("22P02");
      expect((await attempt(c, CREATE, [list, "admin", null, "00000000-0000-4000-8000-00000000dead"])).code).toBe("23503");
    });
  });
});

describe("S05 concorrência (transações reais)", () => {
  const INEPS = ["51999941", "51999942", "51999943"];
  beforeAll(seedUsers);
  afterAll(async () => {
    await cleanupCommitted(INEPS);
    await cleanupUsers();
  });

  async function twoClients<T>(fn: (a: Client, b: Client) => Promise<T>): Promise<T> {
    const a = new Client({ connectionString: DATABASE_URL });
    const b = new Client({ connectionString: DATABASE_URL });
    await Promise.all([a.connect(), b.connect()]);
    try {
      return await fn(a, b);
    } finally {
      await Promise.all([a.end(), b.end()]);
    }
  }
  const settle = <T>(p: Promise<T>) =>
    p.then(
      (v) => ({ ok: true as const, v, code: null as string | null }),
      (e: { code?: string }) => ({ ok: false as const, v: null, code: e.code ?? null }),
    );
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("duas publicações simultâneas da mesma versão: uma vence, a outra falha; uma só published", async () => {
    const { listId, versionId } = await withSuperuser(async (c) => {
      const r = await seedInState(c, "approved", { inep: INEPS[0] });
      return r;
    });
    await twoClients(async (a, b) => {
      await a.query("begin");
      await a.query(PUBLISH, [listId, versionId, IDS.admin]);
      const pb = settle(b.query(PUBLISH, [listId, versionId, IDS.admin]));
      await wait(400);
      await a.query("commit");
      const rb = await pb;
      expect(rb.ok).toBe(false);
      expect(rb.code).toBe("22023");
    });
    const v = await withSuperuser((c) => c.query("select status::text from public.list_versions where list_id = $1", [listId]));
    expect(v.rows.map((r) => r.status)).toEqual(["published"]);
  });

  it("duas candidatas publicadas em paralelo: nunca duas published; termina consistente", async () => {
    const { listId, v1, v2 } = await withSuperuser(async (c) => {
      const s = await seedInState(c, "approved", { inep: INEPS[1] });
      const second = await seedCandidate(c, s.listId, 1);
      return { listId: s.listId, v1: s.versionId, v2: second };
    });
    await twoClients(async (a, b) => {
      await a.query("begin");
      await a.query(PUBLISH, [listId, v1, IDS.admin]);
      const pb = settle(b.query(PUBLISH, [listId, v2, IDS.admin]));
      await wait(400);
      await a.query("commit");
      const rb = await pb;
      expect(rb.ok).toBe(true); // B espera o lock, vê a lista published e troca a versão (superseded)
    });
    const rows = await withSuperuser(async (c) => {
      const v = await c.query("select id, status::text from public.list_versions where list_id = $1 order by version_number", [listId]);
      const l = await c.query("select current_version_id from public.school_lists where id = $1", [listId]);
      return { v: v.rows, cur: l.rows[0]?.current_version_id as string };
    });
    expect(rows.v).toEqual([{ id: v1, status: "superseded" }, { id: v2, status: "published" }]);
    expect(rows.cur).toBe(v2);
  });

  it("publicar e arquivar ao mesmo tempo: serializa; nunca published com versão arquivada", async () => {
    const { listId, versionId } = await withSuperuser((c) => seedInState(c, "approved", { inep: INEPS[2] }));
    await twoClients(async (a, b) => {
      await a.query("begin");
      await a.query(PUBLISH, [listId, versionId, IDS.admin]);
      const pb = settle(b.query(ARCHIVE, [listId, IDS.admin, "corrida"]));
      await wait(400);
      await a.query("commit");
      expect((await pb).ok).toBe(true); // B só roda depois: lista já published
    });
    const rows = await withSuperuser(async (c) => {
      const l = await c.query("select status::text, current_version_id from public.school_lists where id = $1", [listId]);
      const v = await c.query("select status::text from public.list_versions where list_id = $1", [listId]);
      return { l: l.rows[0], v: v.rows.map((x) => x.status) };
    });
    expect(rows.l).toEqual({ status: "archived", current_version_id: null });
    expect(rows.v).toEqual(["archived"]);
  });

  it("versão candidata concorrente recebe números distintos e sequenciais", async () => {
    const { listId } = await withSuperuser(async (c) => {
      const school = await seedSchool(c, "51999944");
      return { listId: await seedList(c, school, "ef-3") };
    });
    try {
      await twoClients(async (a, b) => {
        await a.query("begin");
        const ra = await a.query(CREATE, [listId, "admin", null, null]);
        const pb = settle(b.query(CREATE, [listId, "admin", null, null]));
        await wait(400);
        await a.query("commit");
        const rb = await pb;
        expect(rb.ok).toBe(true);
        expect(ra.rows[0]?.version_number).toBe(1);
        expect((rb.v as { rows: { version_number: number }[] }).rows[0]?.version_number).toBe(2);
      });
    } finally {
      await cleanupCommitted(["51999944"]);
    }
  });
});
