import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { attempt, cleanupUsers, DATABASE_URL, IDS, inTx, seedUsers, withSuperuser } from "./helpers";
import {
  cleanupCommitted, LIST_STATES, seedInState, switchTo, VALID_TRANSITIONS, type ListState,
} from "./list-fixtures";

const CALL = "select public.list_transition($1, $2::public.list_status, $3, $4) as status";

describe("S05 list_transition: matriz 10x10 contra o banco real", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  const pairs = LIST_STATES.flatMap((from) => LIST_STATES.map((to) => [from, to] as [ListState, ListState]));
  expect(pairs).toHaveLength(100);

  it.each(pairs)("%s -> %s", async (from, to) => {
    await inTx(async (c) => {
      const { listId } = await seedInState(c, from);
      const valid = VALID_TRANSITIONS[from].includes(to);
      const r = await attempt(c, CALL, [listId, to, IDS.admin, "motivo"]);
      if (!valid) {
        expect(r.code).toBe("23514");
        expect(r.error).toContain("transição de lista inválida");
        const st = await c.query("select status::text from public.school_lists where id = $1", [listId]);
        expect(st.rows[0]?.status).toBe(from);
      } else if (to === "published") {
        // válida na matriz, mas exige uma versão: só list_publish_version publica.
        expect(r.code).toBe("22023");
        expect(r.error).toContain("list_publish_version");
      } else {
        expect(r.error).toBeNull();
        expect(r.rows[0]?.status).toBe(to);
        const st = await c.query("select status::text from public.school_lists where id = $1", [listId]);
        expect(st.rows[0]?.status).toBe(to);
      }
    });
  });

  it("origem inexistente: lista não encontrada (P0002)", async () => {
    await inTx(async (c) => {
      const r = await attempt(c, CALL, ["00000000-0000-4000-8000-00000000dead", "submitted", IDS.admin, null]);
      expect(r.code).toBe("P0002");
    });
  });

  it("destino fora do enum é recusado", async () => {
    await inTx(async (c) => {
      const { listId } = await seedInState(c, "draft");
      const r = await attempt(c, CALL, [listId, "inexistente", IDS.admin, null]);
      expect(r.code).toBe("22P02");
    });
  });

  it("p_actor_id é obrigatório para approved e rejected (e mensagem estável); demais aceitam nulo", async () => {
    await inTx(async (c) => {
      const { listId } = await seedInState(c, "processing");
      for (const to of ["approved", "rejected"]) {
        const r = await attempt(c, CALL, [listId, to, null, null]);
        expect(r.code, to).toBe("22023");
        expect(r.error).toContain("p_actor_id");
      }
      const ok = await attempt(c, CALL, [listId, "review_needed", null, null]);
      expect(ok.error).toBeNull();
    });
  });

  it("o par inválido tem precedência sobre o ator ausente", async () => {
    await inTx(async (c) => {
      const { listId } = await seedInState(c, "draft");
      const r = await attempt(c, CALL, [listId, "approved", null, null]);
      expect(r.code).toBe("23514");
    });
  });

  it("grava evento imutável com origem, destino, ator e motivo; rejected -> draft reabre o ciclo", async () => {
    await inTx(async (c) => {
      const { listId } = await seedInState(c, "processing");
      await c.query(CALL, [listId, "rejected", IDS.admin, "ilegível"]);
      await c.query(CALL, [listId, "draft", IDS.admin, "reenvio"]);
      const ev = await c.query(
        "select from_status::text, to_status::text, actor_id, reason from public.list_status_events where list_id = $1 order by created_at, id",
        [listId],
      );
      const last2 = ev.rows.slice(-2);
      expect(last2).toEqual([
        { from_status: "processing", to_status: "rejected", actor_id: IDS.admin, reason: "ilegível" },
        { from_status: "rejected", to_status: "draft", actor_id: IDS.admin, reason: "reenvio" },
      ]);
    });
  });

  it("published -> archived via list_transition arquiva versões e zera a versão atual", async () => {
    await inTx(async (c) => {
      const { listId } = await seedInState(c, "published");
      await c.query(CALL, [listId, "archived", IDS.admin, "fim do ano"]);
      const l = await c.query("select status::text, current_version_id, archived_at from public.school_lists where id = $1", [listId]);
      expect(l.rows[0]?.status).toBe("archived");
      expect(l.rows[0]?.current_version_id).toBeNull();
      expect(l.rows[0]?.archived_at).not.toBeNull();
      const v = await c.query("select status::text from public.list_versions where list_id = $1", [listId]);
      expect(v.rows.every((r) => r.status === "archived")).toBe(true);
    });
  });

  it("funções: SECURITY DEFINER, search_path vazio; EXECUTE só para service_role", async () => {
    await withSuperuser(async (c) => {
      const r = await c.query<{ proname: string; prosecdef: boolean; proconfig: string[] | null; acl: string | null }>(
        `select proname, prosecdef, proconfig, proacl::text as acl from pg_proc
          where pronamespace = 'public'::regnamespace
            and proname in ('list_transition','list_publish_version','list_approve_version','list_archive','list_create_candidate_version','list_transition_allowed')`,
      );
      expect(r.rows.map((x) => x.proname).sort()).toEqual([
        "list_approve_version", "list_archive", "list_create_candidate_version", "list_publish_version", "list_transition", "list_transition_allowed",
      ]);
      for (const f of r.rows) {
        // exceção explícita: list_transition_allowed é função pura (matriz imutável, sem acesso a tabelas);
        // as demais alteram estado e por isso são SECURITY DEFINER.
        expect(f.prosecdef, f.proname).toBe(f.proname !== "list_transition_allowed");
        expect(f.proconfig, f.proname).toContain('search_path=""');
        expect(f.acl, f.proname).toMatch(/service_role=X/);
        expect(f.acl, f.proname).not.toMatch(/(^|[{,])(=X|anon=|authenticated=)/);
      }
    });
    for (const who of ["anon", "parent"] as const) {
      await inTx(async (c) => {
        const { listId } = await seedInState(c, "draft");
        await switchTo(c, who);
        for (const sql of [
          "select public.list_transition($1, 'submitted', null, null)",
          "select public.list_archive($1, null, null)",
          "select public.list_approve_version($1, gen_random_uuid(), null)",
          "select public.list_publish_version($1, gen_random_uuid(), null)",
          "select * from public.list_create_candidate_version($1, 'admin', null, null)",
        ]) {
          expect((await attempt(c, sql, [listId])).code, `${who}: ${sql}`).toBe("42501");
        }
      });
    }
  });

  it("service_role executa list_transition", async () => {
    await inTx(async (c) => {
      const { listId } = await seedInState(c, "draft");
      await switchTo(c, "system");
      const r = await attempt(c, CALL, [listId, "submitted", null, null]);
      expect(r.error).toBeNull();
    });
  });
});

describe("S05 list_transition: concorrência", () => {
  const INEP = "51999931";
  beforeAll(seedUsers);
  afterAll(async () => {
    await cleanupCommitted([INEP]);
    await cleanupUsers();
  });

  it("duas transições concorrentes a partir de processing: uma vence, a outra vê o novo estado e falha", async () => {
    const { listId } = await withSuperuser((c) => seedInState(c, "processing", { inep: INEP }));
    const a = new Client({ connectionString: DATABASE_URL });
    const b = new Client({ connectionString: DATABASE_URL });
    await Promise.all([a.connect(), b.connect()]);
    try {
      await a.query("begin");
      await a.query(CALL, [listId, "approved", IDS.admin, null]);
      const pendingB = b.query(CALL, [listId, "rejected", IDS.admin, null]).then(
        () => ({ ok: true as const, code: null as string | null }),
        (e: { code?: string }) => ({ ok: false as const, code: e.code ?? null }),
      );
      await new Promise((r) => setTimeout(r, 400)); // B bloqueia no lock da linha
      await a.query("commit");
      const resB = await pendingB;
      expect(resB.ok).toBe(false);
      expect(resB.code).toBe("23514"); // approved -> rejected não existe
      const st = await withSuperuser((c) => c.query("select status::text from public.school_lists where id = $1", [listId]));
      expect(st.rows[0]?.status).toBe("approved");
    } finally {
      await Promise.all([a.end(), b.end()]);
    }
  });
});
