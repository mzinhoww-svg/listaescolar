import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { attempt, cleanupUsers, DATABASE_URL, seedUsers, withClaims, withSuperuser } from "./helpers";
import { insertJob, insertSubmission, purgeQueues, SUB } from "./s07-fixtures";

const FUNCS = [
  "jobs_enqueue(text, jsonb, text, uuid)",
  "jobs_claim(uuid)",
  "jobs_complete(uuid, jsonb, integer)",
  "jobs_fail(uuid, text, integer)",
  "jobs_read(integer, integer)",
  "jobs_ack(bigint)",
  "jobs_set_vt(bigint, integer)",
  "jobs_requeue_stale()",
  "consents_revoke(uuid, uuid)",
];

async function sys<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  return withSuperuser(async (c) => {
    await c.query("set role service_role");
    try {
      return await fn(c);
    } finally {
      await c.query("reset role");
    }
  });
}
const q = (c: Client, sql: string, p: unknown[] = []) => c.query(sql, p);
const queueDepth = async (name: string) =>
  withSuperuser(async (c) => (await c.query<{ n: number }>(`select count(*)::int as n from pgmq.q_${name}`)).rows[0]!.n);

describe("jobs_* (fila pgmq)", () => {
  beforeAll(seedUsers);
  afterAll(async () => {
    await withSuperuser((c) => purgeQueues(c));
    await cleanupUsers();
  });
  beforeEach(async () => {
    await withSuperuser(async (c) => {
      await purgeQueues(c);
      await c.query("delete from public.list_submissions");
      await c.query("delete from public.jobs");
      await insertSubmission(c, "parent");
    });
  });

  it("extensão pgmq no schema pgmq com as filas ocr_jobs e ocr_jobs_dlq", async () => {
    await withSuperuser(async (c) => {
      const r = await c.query<{ queue_name: string }>("select queue_name from pgmq.list_queues()");
      const names = r.rows.map((x) => x.queue_name);
      expect(names).toContain("ocr_jobs");
      expect(names).toContain("ocr_jobs_dlq");
    });
  });

  for (const fn of FUNCS) {
    it(`EXECUTE de ${fn} só para service_role; SECURITY DEFINER com search_path vazio`, async () => {
      await withSuperuser(async (c) => {
        const r = await c.query<{ a: boolean; b: boolean; s: boolean; d: boolean; cfg: string[] | null }>(
          `select has_function_privilege('anon', p.oid, 'execute') a,
                  has_function_privilege('authenticated', p.oid, 'execute') b,
                  has_function_privilege('service_role', p.oid, 'execute') s,
                  p.prosecdef d, p.proconfig cfg
             from pg_proc p where p.oid = ('public.' || $1)::regprocedure`,
          [fn],
        );
        expect(r.rows[0]).toMatchObject({ a: false, b: false, s: true, d: true });
        expect(r.rows[0]?.cfg?.some((x) => /^search_path=("")?$/.test(x))).toBe(true);
      });
    });
  }

  it("anon e authenticated não conseguem chamar as funções nem tocar no schema pgmq", async () => {
    for (const who of ["anon", "parent", "admin"] as const) {
      await withClaims(who, async (c) => {
        const r = await attempt(c, "select public.jobs_claim('00000000-0000-4000-8000-0000000000ff')");
        expect(r.error).not.toBeNull();
        const t = await attempt(c, "select * from pgmq.q_ocr_jobs");
        expect(t.error).not.toBeNull();
        const f = await attempt(c, "select pgmq.send('ocr_jobs', '{}'::jsonb)");
        expect(f.error).not.toBeNull();
      });
    }
  });

  it("jobs_enqueue cria job queued, mensagem pgmq e é idempotente por chave", async () => {
    const { a, b } = await sys(async (c) => {
      const a = (await q(c, "select public.jobs_enqueue('ocr_jobs', '{}'::jsonb, $1, $2) as id", [SUB.parent, SUB.parent])).rows[0]!.id as string;
      const b = (await q(c, "select public.jobs_enqueue('ocr_jobs', '{}'::jsonb, $1, $2) as id", [SUB.parent, SUB.parent])).rows[0]!.id as string;
      return { a, b };
    });
    expect(a).toBe(b);
    expect(await queueDepth("ocr_jobs")).toBe(1);
    await withSuperuser(async (c) => {
      const j = await c.query("select status::text, attempts, kind, submission_id from public.jobs where id = $1", [a]);
      expect(j.rows[0]).toEqual({ status: "queued", attempts: 0, kind: "ocr_jobs", submission_id: SUB.parent });
      const m = await c.query("select message from pgmq.q_ocr_jobs");
      expect(m.rows[0]?.message).toEqual({ job_id: a });
    });
  });

  it("jobs_enqueue rejeita kind desconhecido, chave vazia e envio inexistente", async () => {
    await sys(async (c) => {
      await c.query("begin");
      const kind = await attempt(c, "select public.jobs_enqueue('outro', '{}'::jsonb, 'k1', null)");
      expect(kind.error).not.toBeNull();
      const key = await attempt(c, "select public.jobs_enqueue('ocr_jobs', '{}'::jsonb, '', null)");
      expect(key.error).not.toBeNull();
      const sub = await attempt(c, "select public.jobs_enqueue('ocr_jobs', '{}'::jsonb, 'k2', '99999999-0000-4000-8000-000000000000')");
      expect(sub.error).not.toBeNull();
      await c.query("rollback");
    });
  });

  async function enqueue(key = SUB.parent): Promise<string> {
    return sys(async (c) => (await q(c, "select public.jobs_enqueue('ocr_jobs', '{}'::jsonb, $1, $2) as id", [key, SUB.parent])).rows[0]!.id as string);
  }

  const claim = (id: string) => sys(async (c) => (await q(c, "select public.jobs_claim($1) as r", [id])).rows[0]!.r as string);
  const aged = (s: Client, id: string, sql: string) => s.query(`update public.jobs set ${sql} where id = $1`, [id]);

  it("jobs_claim: queued -> claimed (running, attempts+1); segunda chamada devolve busy", async () => {
    const id = await enqueue();
    expect([await claim(id), await claim(id)]).toEqual(["claimed", "busy"]);
    const row = await withSuperuser(async (c) => (await c.query("select status::text, attempts, locked_at is not null as locked from public.jobs where id = $1", [id])).rows[0]);
    expect(row).toEqual({ status: "running", attempts: 1, locked: true });
  });

  it("jobs_claim: só um 'claimed' sob concorrência (10 conexões), os demais 'busy'", async () => {
    const id = await enqueue();
    const clients = await Promise.all(
      Array.from({ length: 10 }, async () => {
        const c = new Client({ connectionString: DATABASE_URL });
        await c.connect();
        await c.query("set role service_role");
        return c;
      }),
    );
    try {
      const res = await Promise.all(clients.map(async (c) => (await c.query("select public.jobs_claim($1) as r", [id])).rows[0]!.r as string));
      expect(res.filter((r) => r === "claimed")).toHaveLength(1);
      expect(res.filter((r) => r === "busy")).toHaveLength(9);
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
    const n = await withSuperuser(async (c) => (await c.query("select attempts from public.jobs where id = $1", [id])).rows[0]!.attempts);
    expect(n).toBe(1);
  });

  it("jobs_claim: 'finished' para inexistente, succeeded e dead", async () => {
    const done = await withSuperuser((s) => insertJob(s, SUB.parent, "done", { status: "succeeded" }));
    const dead = await withSuperuser((s) => insertJob(s, SUB.parent, "dead1", { status: "dead", attempts: 5 }));
    expect(await claim(done)).toBe("finished");
    expect(await claim(dead)).toBe("finished");
    expect(await claim("99999999-0000-4000-8000-000000000000")).toBe("finished");
  });

  it("jobs_claim: running com lease vencido é retomado (attempts+1); com lease vigente devolve busy", async () => {
    const stale = await withSuperuser(async (s) => {
      const j = await insertJob(s, SUB.parent, "stale", { status: "running", attempts: 1 });
      await aged(s, j, "locked_at = now() - interval '1 hour'");
      return j;
    });
    expect(await claim(stale)).toBe("claimed");
    expect(await withSuperuser(async (s) => (await s.query("select attempts from public.jobs where id = $1", [stale])).rows[0]!.attempts)).toBe(2);
    const fresh = await withSuperuser(async (s) => {
      const j = await insertJob(s, SUB.parent, "fresh", { status: "running", attempts: 1 });
      await aged(s, j, "locked_at = now() - interval '4 minutes'");
      return j;
    });
    expect(await claim(fresh)).toBe("busy");
  });

  it("jobs_claim: retrying/queued com run_after no futuro devolve not_due; vencido devolve claimed", async () => {
    const later = await withSuperuser(async (s) => {
      const j = await insertJob(s, SUB.parent, "later", { status: "retrying", attempts: 1 });
      await aged(s, j, "run_after = now() + interval '1 hour'");
      return j;
    });
    const laterQ = await withSuperuser(async (s) => {
      const j = await insertJob(s, SUB.parent, "laterq", { status: "queued" });
      await aged(s, j, "run_after = now() + interval '1 hour'");
      return j;
    });
    expect([await claim(later), await claim(laterQ)]).toEqual(["not_due", "not_due"]);
    const due = await withSuperuser(async (s) => {
      const j = await insertJob(s, SUB.parent, "due", { status: "retrying", attempts: 1 });
      await aged(s, j, "run_after = now() - interval '1 second'");
      return j;
    });
    expect(await claim(due)).toBe("claimed");
  });

  it("jobs_complete: succeeded, grava ocr_jobs, submission -> review_needed; repetir não duplica", async () => {
    const id = await enqueue();
    await sys(async (c) => {
      await q(c, "select public.jobs_claim($1)", [id]);
      await q(c, "select public.jobs_complete($1, '{\"items\":[]}'::jsonb, 1234)", [id]);
      await q(c, "select public.jobs_complete($1, '{\"items\":[1]}'::jsonb, 99)", [id]);
    });
    await withSuperuser(async (c) => {
      expect((await c.query("select status::text, last_error from public.jobs where id = $1", [id])).rows[0]).toEqual({ status: "succeeded", last_error: null });
      const o = await c.query("select result, duration_ms from public.ocr_jobs where job_id = $1", [id]);
      expect(o.rows).toEqual([{ result: { items: [] }, duration_ms: 1234 }]);
      expect((await c.query("select status::text from public.list_submissions where id = $1", [SUB.parent])).rows[0]!.status).toBe("review_needed");
    });
  });

  it("jobs_complete não ressuscita envio já rejeitado/publicado e ignora job que não está running", async () => {
    const id = await enqueue();
    await sys(async (c) => {
      await q(c, "select public.jobs_complete($1, '{}'::jsonb, 1)", [id]); // queued: ignorado
    });
    await withSuperuser(async (c) => {
      expect((await c.query("select status::text from public.jobs where id = $1", [id])).rows[0]!.status).toBe("queued");
      expect((await c.query("select count(*)::int n from public.ocr_jobs")).rows[0]!.n).toBe(0);
      await c.query("update public.list_submissions set status = 'published' where id = $1", [SUB.parent]);
      await c.query("update public.jobs set status = 'running', locked_at = now() where id = $1", [id]);
    });
    await sys((c) => q(c, "select public.jobs_complete($1, '{}'::jsonb, 1)", [id]));
    await withSuperuser(async (c) => {
      expect((await c.query("select status::text from public.list_submissions where id = $1", [SUB.parent])).rows[0]!.status).toBe("published");
    });
  });

  it("jobs_fail com tentativas restantes: retrying, run_after no futuro, erro truncado, sem DLQ", async () => {
    const id = await enqueue();
    const long = "x".repeat(2000);
    const st = await sys(async (c) => {
      await q(c, "select public.jobs_claim($1)", [id]);
      return (await q(c, "select public.jobs_fail($1, $2, 120)::text as s", [id, long])).rows[0]!.s;
    });
    expect(st).toBe("retrying");
    await withSuperuser(async (c) => {
      const r = await c.query<{ status: string; err: number; delay: number; locked: boolean }>(
        `select status::text, length(last_error) err, extract(epoch from run_after - now())::int delay, locked_at is null locked from public.jobs where id = $1`,
        [id],
      );
      expect(r.rows[0]?.status).toBe("retrying");
      expect(r.rows[0]!.err).toBeLessThanOrEqual(500);
      expect(r.rows[0]!.delay).toBeGreaterThan(100);
      expect(r.rows[0]!.delay).toBeLessThanOrEqual(120);
      expect(r.rows[0]!.locked).toBe(true);
    });
    expect(await queueDepth("ocr_jobs_dlq")).toBe(0);
    expect(await claim(id)).toBe("not_due"); // run_after ainda no futuro
  });

  it("jobs_fail esgotando max_attempts: dead, mensagem na DLQ, envio rejected", async () => {
    const id = await withSuperuser((c) => insertJob(c, SUB.parent, "exhaust", { status: "queued", maxAttempts: 2 }));
    await sys(async (c) => {
      await q(c, "select public.jobs_claim($1)", [id]);
      expect((await q(c, "select public.jobs_fail($1, 'e1', 0)::text s", [id])).rows[0]!.s).toBe("retrying");
      await q(c, "select public.jobs_claim($1)", [id]);
      expect((await q(c, "select public.jobs_fail($1, 'e2', 0)::text s", [id])).rows[0]!.s).toBe("dead");
    });
    await withSuperuser(async (c) => {
      const r = await c.query("select status::text, attempts, last_error from public.jobs where id = $1", [id]);
      expect(r.rows[0]).toEqual({ status: "dead", attempts: 2, last_error: "e2" });
      const dlq = await c.query("select message from pgmq.q_ocr_jobs_dlq");
      expect(dlq.rows).toHaveLength(1);
      expect(dlq.rows[0]!.message.job_id).toBe(id);
      expect((await c.query("select status::text from public.list_submissions where id = $1", [SUB.parent])).rows[0]!.status).toBe("rejected");
    });
  });

  it("jobs_fail em job que não está running é no-op (não duplica DLQ)", async () => {
    const id = await withSuperuser((c) => insertJob(c, SUB.parent, "noop", { status: "succeeded", attempts: 9 }));
    await sys((c) => q(c, "select public.jobs_fail($1, 'boom', 0)", [id]));
    expect(await queueDepth("ocr_jobs_dlq")).toBe(0);
    await withSuperuser(async (c) => {
      expect((await c.query("select status::text from public.jobs where id = $1", [id])).rows[0]!.status).toBe("succeeded");
    });
  });

  it("jobs_claim de running antigo já sem tentativas vira dead (DLQ, envio rejected) e devolve finished", async () => {
    const id = await withSuperuser(async (c) => {
      const j = await insertJob(c, SUB.parent, "stale-max", { status: "running", attempts: 5 });
      await aged(c, j, "locked_at = now() - interval '1 hour'");
      return j;
    });
    expect(await claim(id)).toBe("finished");
    await withSuperuser(async (c) => {
      expect((await c.query("select status::text from public.jobs where id = $1", [id])).rows[0]!.status).toBe("dead");
      expect((await c.query("select status::text from public.list_submissions where id = $1", [SUB.parent])).rows[0]!.status).toBe("rejected");
    });
    expect(await queueDepth("ocr_jobs_dlq")).toBe(1);
  });

  it("jobs_claim de queued/retrying vencido sem tentativas restantes vira dead e devolve finished", async () => {
    const id = await withSuperuser((c) => insertJob(c, SUB.parent, "due-max", { status: "retrying", attempts: 5 }));
    expect(await claim(id)).toBe("finished");
    expect(await withSuperuser(async (c) => (await c.query("select status::text from public.jobs where id = $1", [id])).rows[0]!.status)).toBe("dead");
  });

  const requeue = () => sys(async (c) => (await q(c, "select public.jobs_requeue_stale() as n")).rows[0]!.n as number);

  it("jobs_requeue_stale: reenvia running com lease vencido e queued/retrying vencido sem mensagem; idempotente", async () => {
    const ids = await withSuperuser(async (s) => {
      const stale = await insertJob(s, SUB.parent, "rq-stale", { status: "running", attempts: 1 });
      await aged(s, stale, "locked_at = now() - interval '1 hour'");
      const due = await insertJob(s, SUB.parent, "rq-due", { status: "retrying", attempts: 1 });
      await aged(s, due, "run_after = now() - interval '1 minute'");
      const queued = await insertJob(s, SUB.parent, "rq-queued", { status: "queued" });
      const fresh = await insertJob(s, SUB.parent, "rq-fresh", { status: "running", attempts: 1 });
      await aged(s, fresh, "locked_at = now()");
      const future = await insertJob(s, SUB.parent, "rq-future", { status: "retrying", attempts: 1 });
      await aged(s, future, "run_after = now() + interval '1 hour'");
      return { stale, due, queued };
    });
    expect(await requeue()).toBe(3);
    expect(await requeue()).toBe(0); // idempotente: mensagens já presentes
    const msgs = await withSuperuser(async (c) => (await c.query("select message->>'job_id' as id from pgmq.q_ocr_jobs")).rows.map((r) => r.id).sort());
    expect(msgs).toEqual([ids.stale, ids.due, ids.queued].sort());
  });

  it("jobs_requeue_stale: não duplica mensagem de job criado por jobs_enqueue; reenvia após ack", async () => {
    const id = await enqueue();
    expect(await requeue()).toBe(0);
    expect(await queueDepth("ocr_jobs")).toBe(1);
    const msg = (await sys(async (c) => (await q(c, "select * from public.jobs_read(5, 30)")).rows))[0]!.msg_id as string;
    await sys((c) => q(c, "select public.jobs_ack($1)", [msg])); // mensagem consumida, job continua queued
    expect(await requeue()).toBe(1);
    expect(await queueDepth("ocr_jobs")).toBe(1);
    expect(id).toBeTruthy();
  });

  it("jobs_requeue_stale: job sem tentativas restantes vira dead (DLQ, envio rejected) em vez de reenviado", async () => {
    const id = await withSuperuser(async (c) => {
      const j = await insertJob(c, SUB.parent, "rq-max", { status: "running", attempts: 5 });
      await aged(c, j, "locked_at = now() - interval '1 hour'");
      return j;
    });
    expect(await requeue()).toBe(1);
    expect(await queueDepth("ocr_jobs")).toBe(0);
    expect(await queueDepth("ocr_jobs_dlq")).toBe(1);
    await withSuperuser(async (c) => {
      expect((await c.query("select status::text from public.jobs where id = $1", [id])).rows[0]!.status).toBe("dead");
      expect((await c.query("select status::text from public.list_submissions where id = $1", [SUB.parent])).rows[0]!.status).toBe("rejected");
    });
    expect(await requeue()).toBe(0);
  });

  it("jobs_read / jobs_set_vt / jobs_ack: leitura com visibilidade, reentrega e arquivamento", async () => {
    const id = await enqueue();
    const read1 = await sys(async (c) => (await q(c, "select * from public.jobs_read(5, 30)")).rows);
    expect(read1).toHaveLength(1);
    expect(read1[0]).toMatchObject({ job_id: id, read_ct: 1 });
    const msg = read1[0]!.msg_id as string;
    expect(await sys(async (c) => (await q(c, "select * from public.jobs_read(5, 30)")).rows)).toHaveLength(0); // invisível
    await sys((c) => q(c, "select public.jobs_set_vt($1, 0)", [msg]));
    const read2 = await sys(async (c) => (await q(c, "select * from public.jobs_read(5, 30)")).rows);
    expect(read2[0]).toMatchObject({ job_id: id, read_ct: 2 }); // reentrega
    const ack = await sys(async (c) => (await q(c, "select public.jobs_ack($1) as ok", [msg])).rows[0]!.ok);
    expect(ack).toBe(true);
    await sys((c) => q(c, "select public.jobs_set_vt($1, 0)", [msg]));
    expect(await sys(async (c) => (await q(c, "select * from public.jobs_read(5, 30)")).rows)).toHaveLength(0);
  });
});
