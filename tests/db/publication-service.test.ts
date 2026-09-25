import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPublicationDeps, type PublicationEnv } from "../../supabase/functions/_shared/publication/composition";
import { decideListPublication, resumePublication, type PublicationDeps } from "../../supabase/functions/_shared/publication/decide";
import { runPublicationSweep } from "../../supabase/functions/_shared/publication/sweep";
import { createRpcPublicationStore } from "../../supabase/functions/_shared/publication/rpc-store";
import type { ListPublisher, PublishRequest, PublishResult } from "../../supabase/functions/_shared/publication/ports";
import { cleanupUsers, IDS, seedUsers, withSuperuser } from "./helpers";
import { goodResult } from "../publication/helpers";

const SCHOOL = "50000000-0000-4000-8000-0000000000d1";
const FIXTURE = JSON.stringify({
  schools: [{ id: SCHOOL, verification: "verified", municipalityEnabled: true, linkedProfiles: [IDS.school_member] }],
  grades: { "4º ano": "ef-4" },
  validSchoolYears: [2027],
});
const ENV: PublicationEnv = { APP_ENV: "local", FAKE_PUBLICATION_FIXTURE: FIXTURE };
const systemClock = { now: () => Date.now(), delay: (ms: number, signal?: AbortSignal) => new Promise<void>((r) => { const t = setTimeout(r, ms); signal?.addEventListener("abort", () => clearTimeout(t), { once: true }); }) };

type RpcRes = { data: unknown; error: unknown };
/** RpcClient (service_role, uma transação curta por chamada) sobre uma conexão própria, como faz o worker. */
const rpc = {
  async rpc(fn: string, args: Record<string, unknown> = {}): Promise<RpcRes> {
    const Q: Record<string, [string, unknown[]]> = {
      ai_get_settings: ["select to_jsonb(public.ai_get_settings()) as data", []],
      publication_load_input: ["select public.publication_load_input($1::uuid) as data", [args.p_submission_id]],
      publication_record_verdict: ["select public.publication_record_verdict($1::uuid, $2::jsonb) as data", [args.p_submission_id, JSON.stringify(args.p_verdict)]],
      publication_begin_publish: ["select public.publication_begin_publish($1::uuid, $2::int) as data", [args.p_submission_id, args.p_lease_seconds]],
      publication_complete: ["select public.publication_complete($1::uuid, $2::jsonb) as data", [args.p_submission_id, JSON.stringify(args.p_result)]],
      publication_fail: ["select public.publication_fail($1::uuid, $2::text) as data", [args.p_submission_id, args.p_reason]],
      publication_expire: ["select public.publication_expire($1::uuid, $2::int) as data", [args.p_submission_id, args.p_min_age_seconds]],
      publication_pending: ["select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as data from public.publication_pending($1::int, $2::int) t", [args.p_limit, args.p_min_age_seconds]],
    };
    const q = Q[fn];
    if (!q) return { data: null, error: { message: "rpc_not_allowed" } };
    return withSuperuser(async (c) => {
      await c.query("begin");
      try {
        await c.query("set local role service_role");
        const r = await c.query(q[0], q[1]);
        await c.query("commit");
        return { data: r.rows[0].data, error: null };
      } catch (e) {
        await c.query("rollback");
        return { data: null, error: { message: String((e as Error).message), code: (e as { code?: string }).code } };
      }
    });
  },
};

const created: string[] = [];
async function seed(opts: { source?: "school" | "parent"; status?: string; result?: unknown } = {}): Promise<string> {
  return withSuperuser(async (c) => {
    const id = randomUUID();
    const consent = randomUUID();
    await c.query("insert into public.consents (id, profile_id, purpose, text_version) values ($1, $2, 'list_upload', 'v1')", [consent, IDS.school_member]);
    await c.query(
      `insert into public.list_submissions (id, submitted_by, source, school_id, grade, school_year, storage_path, file_name, mime_type, size_bytes, consent_id)
       values ($1, $2, $3::public.submission_source, $4, '4º ano', 2027, $5, 'lista-secreta.pdf', 'application/pdf', 1000, $6)`,
      [id, IDS.school_member, opts.source ?? "school", SCHOOL, `${IDS.school_member}/${id}/lista.pdf`, consent],
    );
    await c.query("update public.list_submissions set status = $2::public.list_status where id = $1", [id, opts.status ?? "review_needed"]);
    const job = await c.query<{ id: string }>("insert into public.jobs (kind, payload, idempotency_key, submission_id) values ('ocr_jobs', '{}'::jsonb, $1, $2) returning id", [`k-${id}`, id]);
    await c.query("insert into public.ocr_jobs (job_id, submission_id, result) values ($1, $2, $3::jsonb)", [job.rows[0]!.id, id, JSON.stringify(opts.result ?? goodResult())]);
    created.push(id);
    return id;
  });
}
const rows = (id: string) =>
  withSuperuser(async (c) => (await c.query("select decision, justification, reasons, actor_id, previous_version_id, new_version_id, provider from public.ai_decisions where entity_id = $1 order by created_at, id", [id])).rows);
const statusOf = (id: string) => withSuperuser(async (c) => (await c.query("select status::text as s from public.list_submissions where id = $1", [id])).rows[0].s as string);
const setSettings = (sql: string, params: unknown[] = []) => withSuperuser((c) => c.query(`update public.ai_settings set ${sql} where scope = 'default'`, params));

/** Deps novas (cache de settings zerado) sobre o banco real, com as portas em memória; `over` troca peças. */
const makeDeps = (over: Partial<PublicationDeps> = {}): PublicationDeps => ({ ...createPublicationDeps({ env: ENV, rpc, clock: systemClock }), ...over });

let original: { auto_publish_enabled: boolean; confidence_threshold: string };
beforeAll(async () => {
  await seedUsers();
  original = await withSuperuser(async (c) => (await c.query("select auto_publish_enabled, confidence_threshold from public.ai_settings where scope = 'default'")).rows[0]);
  await setSettings("auto_publish_enabled = true, confidence_threshold = 0.8");
});
afterAll(async () => {
  await setSettings("auto_publish_enabled = $1, confidence_threshold = $2", [original.auto_publish_enabled, original.confidence_threshold]);
  await withSuperuser(async (c) => {
    await c.query("begin");
    try {
      await c.query("alter table public.ai_decisions disable trigger ai_decisions_no_update_delete");
      await c.query("delete from public.ai_decisions where entity_id = any($1::uuid[])", [created]);
      await c.query("alter table public.ai_decisions enable always trigger ai_decisions_no_update_delete");
      await c.query("delete from public.list_submissions where id = any($1::uuid[])", [created]);
      await c.query("delete from public.consents where profile_id = $1", [IDS.school_member]);
      await c.query("commit");
    } catch (e) {
      await c.query("rollback");
      throw e;
    }
  });
  await cleanupUsers();
});

describe("decideListPublication contra o banco real (portas em memória)", () => {
  it("decisão completa: veredito + publicação gravados, ator nulo, envio published", async () => {
    const id = await seed();
    const r = await decideListPublication(id, makeDeps());
    expect(r.status).toBe("auto_published");
    const rs = await rows(id);
    expect(rs.map((x) => x.decision)).toEqual(["auto_publish", "published"]);
    expect(rs.every((x) => x.actor_id === null && x.provider === null)).toBe(true);
    expect(rs[1]).toMatchObject({ previous_version_id: null, justification: "published" });
    expect(rs[1].new_version_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await statusOf(id)).toBe("published");
    expect(JSON.stringify(rs)).not.toMatch(/Caderno|Lápis|lista-secreta/i);
    expect(await decideListPublication(id, makeDeps())).toEqual({ status: "already_decided" });
  });

  it("duas instâncias do serviço decidindo o mesmo envio ao mesmo tempo: um veredito, uma publicação", async () => {
    const id = await seed();
    let calls = 0;
    const shared = createPublicationDeps({ env: ENV, rpc, clock: systemClock }).publisher!;
    const counting: ListPublisher = { publish: async (req: PublishRequest): Promise<PublishResult> => { calls += 1; return shared.publish(req); } };
    const a = makeDeps({ publisher: counting });
    const b = makeDeps({ publisher: counting });
    const out = await Promise.all([decideListPublication(id, a), decideListPublication(id, b), decideListPublication(id, makeDeps({ publisher: counting }))]);
    expect(out.map((x) => x.status).sort()).toEqual(["already_decided", "already_decided", "auto_published"]);
    expect(calls).toBe(1);
    expect((await rows(id)).map((x) => x.decision)).toEqual(["auto_publish", "published"]);
    expect(await statusOf(id)).toBe("published");
  });

  it("envio de pai: human_review com parent_submission (e nunca chama a porta)", async () => {
    const id = await seed({ source: "parent" });
    let calls = 0;
    const r = await decideListPublication(id, makeDeps({ publisher: { publish: async () => { calls += 1; throw new Error("x"); } } }));
    expect(r).toMatchObject({ status: "human_review" });
    expect((await rows(id))[0]).toMatchObject({ decision: "human_review" });
    expect((await rows(id))[0].reasons).toContain("parent_submission");
    expect(calls).toBe(0);
    expect(await statusOf(id)).toBe("human_review");
  });

  it("auto_publish_enabled=false: auto_publish_disabled (interruptor por dado, sem deploy)", async () => {
    await setSettings("auto_publish_enabled = false");
    try {
      const id = await seed();
      await decideListPublication(id, makeDeps());
      expect((await rows(id))[0].reasons).toEqual(["auto_publish_disabled"]);
    } finally {
      await setSettings("auto_publish_enabled = true");
    }
  });

  it("mudar confidence_threshold no banco muda o veredito (cache zerado)", async () => {
    await setSettings("confidence_threshold = 0.99");
    try {
      const id = await seed();
      await decideListPublication(id, makeDeps());
      expect((await rows(id))[0].reasons).toEqual(["overall_below_threshold"]);
    } finally {
      await setSettings("confidence_threshold = 0.8");
    }
    const id2 = await seed();
    expect((await decideListPublication(id2, makeDeps())).status).toBe("auto_published");
  });

  it("sem portas (produção até a S11): human_review registrado com publisher_unavailable e context_unavailable", async () => {
    const id = await seed();
    await decideListPublication(id, createPublicationDeps({ env: { APP_ENV: "production", FAKE_PUBLICATION_FIXTURE: FIXTURE }, rpc, clock: systemClock }));
    expect((await rows(id))[0].reasons).toEqual(expect.arrayContaining(["publisher_unavailable", "context_unavailable"]));
  });

  it("varredor: decide o envio parado e retoma o approved (porta transitória, depois ok)", async () => {
    const id = await seed();
    const real = createPublicationDeps({ env: ENV, rpc, clock: systemClock }).publisher!;
    let n = 0;
    const flaky: ListPublisher = { publish: async (req) => { n += 1; if (n === 1) throw Object.assign(new Error("down"), { name: "PortError", code: "port_down", transient: true }); return real.publish(req); } };
    const first = await decideListPublication(id, makeDeps({ publisher: flaky }));
    expect(first).toEqual({ status: "publish_pending" });
    expect(await statusOf(id)).toBe("approved");
    // lease ainda ativa: o varredor não toca (pending exclui) e a retomada direta responde busy/pending
    expect(await resumePublication(id, makeDeps({ publisher: flaky }))).toEqual({ status: "publish_pending" });
    expect(n).toBe(1);
    await withSuperuser((c) => c.query("update public.publication_leases set lease_until = now() - interval '1 second' where submission_id = $1", [id]));
    const s = await runPublicationSweep(makeDeps({ publisher: flaky }), { limit: 50, deadlineMs: 60_000, minAgeSeconds: 0 });
    expect(s.errors).toBe(0);
    expect(await statusOf(id)).toBe("published");
    expect((await rows(id)).map((x) => x.decision)).toEqual(["auto_publish", "published"]);
    const idle = await seed();
    await runPublicationSweep(makeDeps(), { limit: 50, deadlineMs: 60_000, minAgeSeconds: 0 });
    expect(await statusOf(idle)).toBe("published");
  });

  it("permanente na porta: publish_failed e envio em human_review", async () => {
    const id = await seed();
    const r = await decideListPublication(id, makeDeps({ publisher: { publish: async () => { throw Object.assign(new Error("x"), { name: "PortError", code: "list_archived", transient: false }); } } }));
    expect(r).toEqual({ status: "publish_failed", reason: "list_archived" });
    expect((await rows(id)).map((x) => x.decision)).toEqual(["auto_publish", "publish_failed"]);
    expect(await statusOf(id)).toBe("human_review");
  });
});

describe("lease, expiração e publicação órfã (funções da 0203)", () => {
  const store = createRpcPublicationStore(rpc);
  async function approved(): Promise<string> {
    const id = await seed();
    await decideListPublication(id, makeDeps({ publisher: { publish: async () => { throw Object.assign(new Error("down"), { name: "PortError", code: "port_down", transient: true }); } } }));
    await withSuperuser((c) => c.query("delete from public.publication_leases where submission_id = $1", [id])); // tira a lease da tentativa acima
    expect(await statusOf(id)).toBe("approved");
    return id;
  }

  it("begin_publish: leased, depois busy; expirador respeita a lease e só falha sem chamada em andamento", async () => {
    const id = await approved();
    expect(await store.beginPublish(id, 120)).toBe("leased");
    expect(await store.beginPublish(id, 120)).toBe("busy");
    expect(await store.expire(id, 0)).toBe("in_progress");
    expect(await statusOf(id)).toBe("approved");
    expect(await store.pending(50, 0)).not.toContainEqual(expect.objectContaining({ submissionId: id }));
    await withSuperuser((c) => c.query("update public.publication_leases set lease_until = now() - interval '1 second' where submission_id = $1", [id]));
    expect(await store.expire(id, 3600)).toBe("not_due");
    expect(await store.expire(id, 0)).toBe("failed");
    expect(await statusOf(id)).toBe("human_review");
    expect((await rows(id)).map((x) => [x.decision, x.justification])).toEqual([["auto_publish", "rules_passed"], ["publish_failed", "publish_expired"]]);
    expect(await store.expire(id, 0)).toBe("already_failed");
  });

  it("complete depois de publish_failed: registra publish_orphaned (versões) e não fica em silêncio", async () => {
    const id = await approved();
    await store.beginPublish(id, 120);
    await withSuperuser((c) => c.query("update public.publication_leases set lease_until = now() - interval '1 second' where submission_id = $1", [id]));
    expect(await store.expire(id, 0)).toBe("failed");
    const v = randomUUID();
    const prev = randomUUID();
    expect(await store.complete(id, { newVersionId: v, previousVersionId: prev })).toBe("orphaned");
    expect(await store.complete(id, { newVersionId: v, previousVersionId: prev })).toBe("orphaned"); // idempotente
    const rs = await rows(id);
    expect(rs.map((x) => x.decision)).toEqual(["auto_publish", "publish_failed", "publish_orphaned"]);
    expect(rs[2]).toMatchObject({ new_version_id: v, previous_version_id: prev, justification: "published_after_failure" });
    expect(await statusOf(id)).toBe("human_review");
  });

  it("begin_publish e complete fora de approved: not_approved; ambos exigem service_role", async () => {
    const id = await seed(); // review_needed
    expect(await store.beginPublish(id, 120)).toBe("not_approved");
    expect(await store.complete(id, { newVersionId: randomUUID(), previousVersionId: null })).toBe("not_approved");
    const denied = await withSuperuser(async (c) => {
      await c.query("begin");
      try {
        await c.query("set local role authenticated");
        const r = await c.query("select public.publication_begin_publish($1::uuid, 60)", [id]).then(() => "ok", (e: Error) => e.message);
        return r;
      } finally {
        await c.query("rollback");
      }
    });
    expect(denied).toMatch(/permission denied/);
  });

  it("begin_publish valida a lease (1 a 3600 s)", async () => {
    const id = await approved();
    await expect(store.beginPublish(id, 0)).rejects.toThrow();
    await expect(store.beginPublish(id, 99_999)).rejects.toThrow();
  });
});
