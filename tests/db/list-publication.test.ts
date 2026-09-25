import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { insertSubmission } from "./cross-track-fixtures";
import { Client } from "pg";
import { attempt, cleanupUsers, DATABASE_URL, IDS, inTx, seedUsers, withSuperuser } from "./helpers";
import {
  approveVersion, cleanupCommitted, LIST_STATES, publish, seedCandidate, seedInState, seedList, seedSchool, switchTo,
} from "./list-fixtures";

const PUBLISH = "select public.list_publish_version($1, $2, $3) as n";
const ARCHIVE = "select public.list_archive($1, $2, $3)";
const APPROVE = "select public.list_approve_version($1, $2, $3)";
const CREATE = "select version_id, version_number from public.list_create_candidate_version($1, $2::public.list_version_source, $3, $4)";

describe("S05 list_publish_version", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("publica de approved: versão published, lista published, versão atual, datas e evento", async () => {
    await inTx(async (c) => {
      const { listId, versionId } = await seedInState(c, "approved");
      await approveVersion(c, listId, versionId);
      const r = await attempt(c, PUBLISH, [listId, versionId, IDS.admin]);
      expect(r.error).toBeNull();
      expect(r.rows[0]?.n).toBe(1);
      const l = await c.query("select status::text, current_version_id, published_at from public.school_lists where id = $1", [listId]);
      expect(l.rows[0]?.status).toBe("published");
      expect(l.rows[0]?.current_version_id).toBe(versionId);
      expect(l.rows[0]?.published_at).not.toBeNull();
      const v = await c.query("select status::text, published_at, approved_by, approved_at from public.list_versions where id = $1", [versionId]);
      expect(v.rows[0]?.status).toBe("published");
      expect(v.rows[0]?.published_at).not.toBeNull();
      expect(v.rows[0]?.approved_by).toBe(IDS.admin); // a versão publicada mantém a aprovação
      expect(v.rows[0]?.approved_at).not.toBeNull();
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
      await approveVersion(c, listId, v2);
      const r = await attempt(c, PUBLISH, [listId, v2, IDS.admin]);
      expect(r.error).toBeNull();
      expect(r.rows[0]?.n).toBe(2);
      // troca de versão não é transição de estado: sem par published -> published, com motivo
      const ev = await c.query(
        "select from_status::text, to_status::text, version_id, reason from public.list_status_events where list_id = $1 order by created_at desc, id desc limit 1",
        [listId],
      );
      expect(ev.rows[0]).toEqual({ from_status: null, to_status: "published", version_id: v2, reason: "troca de versão" });
      const pairs = await c.query("select 1 from public.list_status_events where list_id = $1 and from_status = 'published' and to_status = 'published'", [listId]);
      expect(pairs.rowCount).toBe(0);
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

describe("S05 aprovação da versão (publicar exige versão aprovada e não vazia)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("publicar versão não aprovada falha (23514) e nada muda", async () => {
    await inTx(async (c) => {
      const { listId, versionId } = await seedInState(c, "approved");
      const r = await attempt(c, PUBLISH, [listId, versionId, IDS.admin]);
      expect(r.code).toBe("23514");
      expect(r.error).toContain("não aprovada");
      expect((await c.query("select status::text from public.school_lists where id = $1", [listId])).rows[0]?.status).toBe("approved");
      expect((await c.query("select status::text from public.list_versions where id = $1", [versionId])).rows[0]?.status).toBe("candidate");
    });
  });

  it("lista approved com duas candidatas: só a aprovada publica", async () => {
    await inTx(async (c) => {
      const { listId, versionId: v1 } = await seedInState(c, "approved");
      const v2 = await seedCandidate(c, listId, 1);
      await approveVersion(c, listId, v2);
      expect((await attempt(c, PUBLISH, [listId, v1, IDS.admin])).code).toBe("23514");
      expect((await attempt(c, PUBLISH, [listId, v2, IDS.admin])).error).toBeNull();
      const v = await c.query("select id, status::text from public.list_versions where list_id = $1 order by version_number", [listId]);
      expect(v.rows).toEqual([{ id: v1, status: "candidate" }, { id: v2, status: "published" }]);
    });
  });

  it("versão sem itens é recusada na publicação, mesmo aprovada (23514)", async () => {
    await inTx(async (c) => {
      const { listId } = await seedInState(c, "approved");
      const empty = await seedCandidate(c, listId, 0);
      await approveVersion(c, listId, empty);
      const r = await attempt(c, PUBLISH, [listId, empty, IDS.admin]);
      expect(r.code).toBe("23514");
      expect(r.error).toContain("sem itens");
    });
  });

  it("aprova: grava ator e data; recusa ator nulo, inexistente, outra lista, não-candidate e reaprovação", async () => {
    await inTx(async (c) => {
      const a = await seedInState(c, "published", { inep: "51999951", slug: "ef-1" });
      const b = await seedInState(c, "approved", { schoolId: a.schoolId, slug: "ef-2" });
      const cand = await seedCandidate(c, a.listId, 1);
      expect((await attempt(c, APPROVE, [a.listId, cand, null])).code).toBe("22023");
      expect((await attempt(c, APPROVE, [a.listId, "00000000-0000-4000-8000-00000000dead", IDS.admin])).code).toBe("22023");
      expect((await attempt(c, APPROVE, [a.listId, b.versionId, IDS.admin])).code).toBe("22023"); // versão de outra lista
      expect((await attempt(c, APPROVE, [a.listId, a.versionId, IDS.admin])).code).toBe("22023"); // já publicada
      expect((await attempt(c, APPROVE, ["00000000-0000-4000-8000-00000000dead", cand, IDS.admin])).code).toBe("P0002");
      const ok = await attempt(c, APPROVE, [a.listId, cand, IDS.admin]);
      expect(ok.error).toBeNull();
      const v = await c.query("select approved_by, approved_at, status::text from public.list_versions where id = $1", [cand]);
      expect(v.rows[0]?.approved_by).toBe(IDS.admin);
      expect(v.rows[0]?.approved_at).not.toBeNull();
      expect(v.rows[0]?.status).toBe("candidate");
      expect((await attempt(c, APPROVE, [a.listId, cand, IDS.admin])).code).toBe("22023"); // reaprovar
      // superseded também não aprova
      await attempt(c, PUBLISH, [a.listId, cand, IDS.admin]);
      expect((await attempt(c, APPROVE, [a.listId, a.versionId, IDS.admin])).code).toBe("22023");
    });
  });

  it("approved_by/approved_at: par obrigatório e imutáveis depois de preenchidos", async () => {
    await inTx(async (c) => {
      const { listId } = await seedInState(c, "approved");
      const v = await seedCandidate(c, listId, 1);
      const half = await attempt(c, "update public.list_versions set approved_by = $2 where id = $1", [v, IDS.admin]);
      expect(half.code).toBe("23514");
      await approveVersion(c, listId, v);
      for (const sql of [
        "update public.list_versions set approved_by = null, approved_at = null where id = $1",
        "update public.list_versions set approved_by = '00000000-0000-4000-8000-0000000000ff' where id = $1",
        "update public.list_versions set approved_at = now() + interval '1 day' where id = $1",
      ]) {
        expect((await attempt(c, sql, [v])).code, sql).toBe("23514");
      }
      await attempt(c, PUBLISH, [listId, v, IDS.admin]);
      expect((await attempt(c, "update public.list_versions set approved_at = now() + interval '1 hour' where id = $1", [v])).code).toBe("23514");
    });
  });

  it("published/superseded sem aprovação violam o check mesmo por update direto", async () => {
    await inTx(async (c) => {
      const { listId } = await seedInState(c, "approved");
      const v = await seedCandidate(c, listId, 1);
      const r = await attempt(c, "update public.list_versions set status = 'published', published_at = now() where id = $1", [v]);
      expect(r.code).toBe("23514");
    });
  });

  it("approved_by/approved_at não são legíveis por anon/authenticated", async () => {
    await inTx(async (c) => {
      await seedInState(c, "published");
      for (const who of ["anon", "parent"] as const) {
        await switchTo(c, who);
        expect((await attempt(c, "select approved_by from public.list_versions")).code, who).toBe("42501");
        expect((await attempt(c, "select approved_at from public.list_versions")).code, who).toBe("42501");
      }
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
      const sub = (await insertSubmission(c, school, true)).id; // 0600: submission_id agora tem FK
      const a = await seedList(c, school, "ef-1");
      const b = await seedList(c, school, "ef-2");
      const nums: number[] = [];
      for (const l of [a, a, b, a, b]) {
        const r = await c.query<{ version_number: number }>(CREATE, [l, "school_upload", sub, IDS.parent]);
        nums.push(r.rows[0]!.version_number);
      }
      expect(nums).toEqual([1, 2, 1, 3, 2]);
      const v = await c.query("select status::text, source::text, submission_id, created_by, item_count from public.list_versions where list_id = $1 order by version_number limit 1", [a]);
      expect(v.rows[0]).toEqual({
        status: "candidate", source: "school_upload", submission_id: sub, created_by: IDS.parent, item_count: 0,
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
  /** Espera (até 5 s) o backend de `c` ficar bloqueado num lock: prova que a concorrência é real. */
  async function untilBlocked(c: Client): Promise<void> {
    const pid = (c as unknown as { processID: number }).processID;
    for (let i = 0; i < 100; i++) {
      const r = await withSuperuser((s) =>
        s.query("select 1 from pg_stat_activity where pid = $1 and wait_event_type = 'Lock'", [pid]),
      );
      if (r.rowCount) return;
      await new Promise((res) => setTimeout(res, 50));
    }
    throw new Error("a segunda transação não ficou bloqueada em lock");
  }

  it("duas publicações simultâneas da mesma versão: uma vence, a outra falha; uma só published", async () => {
    const { listId, versionId } = await withSuperuser(async (c) => {
      const r = await seedInState(c, "approved", { inep: INEPS[0] });
      await approveVersion(c, r.listId, r.versionId);
      return r;
    });
    await twoClients(async (a, b) => {
      await a.query("begin");
      await a.query(PUBLISH, [listId, versionId, IDS.admin]);
      const pb = settle(b.query(PUBLISH, [listId, versionId, IDS.admin]));
      await untilBlocked(b);
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
      await approveVersion(c, s.listId, s.versionId);
      await approveVersion(c, s.listId, second);
      return { listId: s.listId, v1: s.versionId, v2: second };
    });
    await twoClients(async (a, b) => {
      await a.query("begin");
      await a.query(PUBLISH, [listId, v1, IDS.admin]);
      const pb = settle(b.query(PUBLISH, [listId, v2, IDS.admin]));
      await untilBlocked(b);
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
    const { listId, versionId } = await withSuperuser(async (c) => {
      const r = await seedInState(c, "approved", { inep: INEPS[2] });
      await approveVersion(c, r.listId, r.versionId);
      return r;
    });
    await twoClients(async (a, b) => {
      await a.query("begin");
      await a.query(PUBLISH, [listId, versionId, IDS.admin]);
      const pb = settle(b.query(ARCHIVE, [listId, IDS.admin, "corrida"]));
      await untilBlocked(b);
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

  it("dois escritores de itens na mesma candidata, com inserts multilinha: sem deadlock (40P01)", async () => {
    const { versionId } = await withSuperuser(async (c) => {
      const school = await seedSchool(c, "51999945");
      const listId = await seedList(c, school, "ef-4");
      return { versionId: await seedCandidate(c, listId, 0) };
    });
    const bulk = (from: number) =>
      `insert into public.list_items (version_id, position, original_name, normalized_name)
       select $1, g, 'item ' || g, 'item ' || g from generate_series(${from}, ${from + 99}) g`;
    try {
      await twoClients(async (a, b) => {
        for (let round = 0; round < 5; round++) {
          const [ra, rb] = await Promise.all([
            settle(a.query(bulk(round * 1000 + 1), [versionId])),
            settle(b.query(bulk(round * 1000 + 501), [versionId])),
          ]);
          expect([ra.code, rb.code], `rodada ${round}`).toEqual([null, null]);
        }
      });
      const n = await withSuperuser((c) => c.query("select item_count from public.list_versions where id = $1", [versionId]));
      expect(n.rows[0]?.item_count).toBe(1000);
    } finally {
      await cleanupCommitted(["51999945"]);
    }
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
        await untilBlocked(b);
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
