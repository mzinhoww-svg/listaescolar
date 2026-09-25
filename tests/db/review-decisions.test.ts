import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attempt, cleanupUsers, DATABASE_URL, IDS, seedUsers, withSuperuser } from "./helpers";
import {
  approve, asService, asSuper, begin, complete, failPublish, item, open, reject, purgeSubmissions, reviewRows, rpc, save, seedSubmission, statusOf, tx,
} from "./review-fixtures";

const GOOD = [item({ name: "Caderno", quantity: 2 }), item({ name: "Lápis", quantity: 12, category: "escrita" })];
const payload = (items: unknown[] = GOOD, over: Record<string, unknown> = {}) => ({ grade: "4º ano", school_year: 2027, items, ...over });
const insReview = (c: Parameters<typeof attempt>[0], over: Record<string, unknown> = {}) => {
  const r = { entity_id: randomUUID(), decision: "edited", actor_id: IDS.admin, provider: null, prev: randomUUID(), next: randomUUID(), reasons: "[]", ...over };
  return attempt(
    c,
    `insert into public.ai_decisions (entity_type, entity_id, kind, provider, model, prompt_key, prompt_version, pipeline_version, decision, actor_id, previous_version_id, new_version_id, reasons)
     values ('list_submission', $1, 'review', $2, null, null, null, 's10.1', $3, $4, $5, $6, $7::jsonb)`,
    [r.entity_id, r.provider, r.decision, r.actor_id, r.prev, r.next, r.reasons],
  );
};

describe("0204: CHECKs de ai_decisions recriados pelos nomes fixos", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("os cinco nomes fixos existem", async () => {
    await tx(async (c) => {
      const r = await c.query(
        "select conname from pg_constraint where conrelid = 'public.ai_decisions'::regclass and conname like 'ai_decisions\\_%' and contype = 'c' order by conname",
      );
      const names = r.rows.map((x) => x.conname as string);
      for (const n of ["ai_decisions_kind_valid", "ai_decisions_kind_decision_valid", "ai_decisions_provider_coupling", "ai_decisions_reasons_scope", "ai_decisions_published_has_version", "ai_decisions_review_versions"]) {
        expect(names).toContain(n);
      }
    });
  });

  it("review: aceita as cinco decisões com ator; recusa sem ator, com provider, decisão fora do conjunto e sem versões", async () => {
    await tx(async (c) => {
      for (const decision of ["edited", "approved", "rejected", "published", "publish_failed"]) expect((await insReview(c, { decision })).error, decision).toBeNull();
      expect((await insReview(c, { actor_id: null })).code).toBe("23514");
      expect((await insReview(c, { provider: "fake" })).code).toBe("23514");
      expect((await insReview(c, { decision: "accepted" })).code).toBe("23514");
      expect((await insReview(c, { decision: "auto_publish" })).code).toBe("23514");
      expect((await insReview(c, { decision: "edited", prev: null })).code).toBe("23514");
      expect((await insReview(c, { decision: "approved", next: null })).code).toBe("23514");
    });
  });

  it("reasons: aceito em review e publication, recusado em extraction; extraction e publication da S08/S09 seguem válidos", async () => {
    await tx(async (c) => {
      expect((await insReview(c, { decision: "approved", reasons: '["critical_alerts_acknowledged"]' })).error).toBeNull();
      const ext = (reasons: string) =>
        attempt(c, "insert into public.ai_decisions (entity_type, entity_id, kind, provider, model, prompt_key, prompt_version, pipeline_version, decision, reasons) values ('list_submission', $1, 'extraction', 'fake', 'm', 'extract_list', 1, 's08.1', 'accepted', $2::jsonb)", [randomUUID(), reasons]);
      expect((await ext("[]")).error).toBeNull();
      expect((await ext('["critical_alert"]')).code).toBe("23514");
      const pub = attempt(c, "insert into public.ai_decisions (entity_type, entity_id, kind, pipeline_version, decision, reasons) values ('list_submission', $1, 'publication', 's09.1', 'human_review', '[\"critical_alert\"]'::jsonb)", [randomUUID()]);
      expect((await pub).error).toBeNull();
      expect((await attempt(c, "insert into public.ai_decisions (entity_type, entity_id, kind, provider, model, prompt_key, prompt_version, pipeline_version, decision) values ('list_submission', $1, 'other', 'fake', 'm', 'k', 1, 'v', 'accepted')", [randomUUID()])).code).toBe("23514");
    });
  });

  it("no máximo um review/published por envio; ai_record_decision segue recusando tudo que não é extraction", async () => {
    await tx(async (c) => {
      const id = randomUUID();
      expect((await insReview(c, { entity_id: id, decision: "published" })).error).toBeNull();
      expect((await insReview(c, { entity_id: id, decision: "published" })).code).toBe("23505");
      expect((await insReview(c, { entity_id: id, decision: "edited" })).error).toBeNull();
      expect((await insReview(c, { entity_id: id, decision: "edited" })).error).toBeNull();
      await asService(c);
      const r = await attempt(c, "select public.ai_record_decision($1::jsonb)", [JSON.stringify({ entity_type: "list_submission", entity_id: id, kind: "review", provider: null, model: null, prompt_key: null, prompt_version: 1, pipeline_version: "x", decision: "edited" })]);
      expect(r.code).toBe("22023");
    });
  });
});

describe("0204: review_save_version", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("versão n+1 + review/edited (previous = versão anterior, new = nova, ator = admin); a versão 1 fica intacta", async () => {
    await tx(async (c) => {
      const id = await seedSubmission(c);
      await asService(c);
      await open(c, id);
      const s = await save(c, id, 1, payload());
      expect(s.error).toBeNull();
      expect(s.rows[0]!.r).toMatchObject({ state: "saved", version: 2 });
      const v = (await c.query("select id, version, origin, actor_id, items from public.review_versions where submission_id = $1 order by version", [id])).rows;
      expect(v.map((x) => [x.version, x.origin])).toEqual([[1, "extraction"], [2, "admin_edit"]]);
      expect(v[1]!.actor_id).toBe(IDS.admin);
      expect((v[0]!.items as unknown[]).length).toBe(3);
      const rows = await reviewRows(c, id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ decision: "edited", actor_id: IDS.admin, previous_version_id: v[0]!.id, new_version_id: v[1]!.id, justification: "human_edit", provider: null, model: null });
      expect(JSON.stringify(rows)).not.toContain("Caderno");
    });
  });

  it("stale sem gravar; not_reviewable fora de human_review; ator não admin 42501; payload com chave extra ou inválido 22023", async () => {
    await tx(async (c) => {
      const id = await seedSubmission(c);
      const aprovado = await seedSubmission(c, { status: "approved" });
      await asService(c);
      await open(c, id);
      await open(c, aprovado);
      expect((await save(c, id, 7, payload())).rows[0]!.r).toMatchObject({ state: "stale", version: 1 });
      expect((await save(c, aprovado, 1, payload())).rows[0]!.r).toMatchObject({ state: "not_reviewable" });
      expect((await c.query("select count(*)::int as n from public.review_versions where submission_id = any($1::uuid[])", [[id, aprovado]])).rows[0].n).toBe(2);
      expect((await save(c, id, 1, payload(), IDS.parent)).code).toBe("42501");
      expect((await save(c, id, 1, payload(), IDS.system)).code).toBe("42501");
      expect((await save(c, id, 1, { ...payload(), actor_id: IDS.parent })).code).toBe("22023");
      expect((await save(c, id, 1, payload([item({ quantity: 0 })]))).code).toBe("22023");
      expect((await save(c, id, 1, payload(GOOD, { grade: "" }))).code).toBe("22023");
      expect((await save(c, id, 1, payload(GOOD, { school_year: 1999 }))).code).toBe("22023");
      expect((await save(c, id, 1, { grade: "4º ano", school_year: 2027 })).code).toBe("22023");
      expect((await save(c, randomUUID(), 1, payload())).code).toBe("P0002");
      expect((await reviewRows(c, id)).length).toBe(0);
    });
  });
});

describe("0204: review_approve e review_reject", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  const bad: [string, Record<string, unknown>][] = [
    ["sem itens", { items: [] }],
    ["quantidade nula", { items: [item({ quantity: null })] }],
    ["categoria nula", { items: [item({ category: null })] }],
    ["sem série", { grade: null }],
    ["sem ano", { school_year: null }],
  ];
  for (const [nome, over] of bad) {
    it(`bloqueio intrínseco (${nome}) -> 22023 e nada muda`, async () => {
      await tx(async (c) => {
        const id = await seedSubmission(c);
        await asService(c);
        await open(c, id);
        await save(c, id, 1, payload(GOOD, over));
        expect((await approve(c, id, 2)).code).toBe("22023");
        expect(await statusOf(c, id)).toBe("human_review");
        expect(await reviewRows(c, id)).toHaveLength(1); // só o edited
      });
    });
  }

  it("envio sem school_id não aprova (só recusa)", async () => {
    await tx(async (c) => {
      const id = await seedSubmission(c, { schoolId: null });
      await asService(c);
      await open(c, id);
      await save(c, id, 1, payload());
      expect((await approve(c, id, 2)).code).toBe("22023");
      expect((await reject(c, id, 2)).rows[0]!.r).toBe("rejected");
    });
  });

  it("aprova: envio approved + review/approved (new = versão aprovada, reasons); stale e not_reviewable; reasons inválidos", async () => {
    await tx(async (c) => {
      const id = await seedSubmission(c);
      await asService(c);
      await open(c, id);
      await save(c, id, 1, payload());
      expect((await approve(c, id, 1)).rows[0]!.r).toBe("stale");
      expect((await approve(c, id, 2, ["outro"])).code).toBe("22023");
      expect((await approve(c, id, 2, [], IDS.parent)).code).toBe("42501");
      expect(await statusOf(c, id)).toBe("human_review");
      expect((await approve(c, id, 2, ["critical_alerts_acknowledged"])).rows[0]!.r).toBe("approved");
      expect(await statusOf(c, id)).toBe("approved");
      const v2 = (await c.query("select id from public.review_versions where submission_id = $1 and version = 2", [id])).rows[0].id;
      const last = (await reviewRows(c, id)).at(-1)!;
      expect(last).toMatchObject({ decision: "approved", actor_id: IDS.admin, new_version_id: v2, justification: "human_approved", reasons: ["critical_alerts_acknowledged"] });
      expect((await approve(c, id, 2)).rows[0]!.r).toBe("not_reviewable");
      expect((await save(c, id, 2, payload())).rows[0]!.r).toMatchObject({ state: "not_reviewable" });
    });
  });

  it("recusa: motivo da lista fechada; fora dela 22023; grava review/rejected com o código e a versão vigente", async () => {
    await tx(async (c) => {
      const id = await seedSubmission(c);
      await asService(c);
      await open(c, id);
      expect((await reject(c, id, 1, "texto livre com nome de aluno")).code).toBe("22023");
      expect((await reject(c, id, 3)).rows[0]!.r).toBe("stale");
      expect((await reject(c, id, 1, "illegible_document", IDS.school_member)).code).toBe("42501");
      expect((await reject(c, id, 1, "illegible_document")).rows[0]!.r).toBe("rejected");
      expect(await statusOf(c, id)).toBe("rejected");
      const v1 = (await c.query("select id from public.review_versions where submission_id = $1", [id])).rows[0].id;
      expect((await reviewRows(c, id)).at(-1)).toMatchObject({ decision: "rejected", justification: "illegible_document", reasons: ["illegible_document"], new_version_id: v1, actor_id: IDS.admin });
      expect((await reject(c, id, 1)).rows[0]!.r).toBe("not_reviewable");
    });
  });
});

describe("0204: publicação humana (begin/complete/fail)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  async function approved(c: Parameters<typeof asService>[0]): Promise<string> {
    const id = await seedSubmission(c);
    await asService(c);
    await open(c, id);
    await save(c, id, 1, payload());
    await approve(c, id, 2);
    return id;
  }
  const res = { newVersionId: randomUUID(), previousVersionId: null, listId: randomUUID() };

  it("leased com a versão aprovada; segunda chamada busy; envio não aprovado ou aprovado por veredito automático -> not_approved", async () => {
    await tx(async (c) => {
      const id = await approved(c);
      const a = (await begin(c, id)).rows[0]!.r as { state: string; approvedVersionId: string };
      const v2 = (await c.query("select id from public.review_versions where submission_id = $1 and version = 2", [id])).rows[0].id;
      expect(a).toEqual({ state: "leased", approvedVersionId: v2 });
      expect(((await begin(c, id)).rows[0]!.r as { state: string }).state).toBe("busy");
      const humano = await seedSubmission(c);
      expect(((await begin(c, humano)).rows[0]!.r as { state: string }).state).toBe("not_approved");
      const auto = await seedSubmission(c, { status: "approved" });
      await asSuper(c);
      await c.query("insert into public.ai_decisions (entity_type, entity_id, kind, pipeline_version, decision, justification) values ('list_submission', $1, 'publication', 's09.1', 'auto_publish', 'rules_passed')", [auto]);
      await asService(c);
      expect(((await begin(c, auto)).rows[0]!.r as { state: string }).state).toBe("not_approved");
      expect((await begin(c, id, IDS.parent)).code).toBe("42501");
    });
  });

  it("complete: exige newVersionId; grava review/published (previous/new da lista) + published; repetição já concluída; índice único", async () => {
    await tx(async (c) => {
      const id = await approved(c);
      await begin(c, id);
      expect((await complete(c, id, { previousVersionId: null, listId: res.listId })).code).toBe("22023");
      expect((await complete(c, id, { ...res, extra: 1 })).code).toBe("22023");
      expect((await complete(c, id, { ...res, newVersionId: "nao-uuid" })).code).toBe("22023");
      const prev = randomUUID();
      expect((await complete(c, id, { ...res, previousVersionId: prev })).rows[0]!.r).toBe("completed");
      expect(await statusOf(c, id)).toBe("published");
      expect((await reviewRows(c, id)).at(-1)).toMatchObject({ decision: "published", actor_id: IDS.admin, previous_version_id: prev, new_version_id: res.newVersionId, justification: "human_published" });
      expect((await complete(c, id, res)).rows[0]!.r).toBe("already_completed");
      expect(((await begin(c, id)).rows[0]!.r as { state: string }).state).toBe("already_completed");
      expect((await reviewRows(c, id)).filter((r) => r.decision === "published")).toHaveLength(1);
      await asSuper(c);
      expect((await c.query("select count(*)::int as n from public.publication_leases where submission_id = $1", [id])).rows[0].n).toBe(0);
    });
  });

  it("complete sem aprovação humana -> not_approved; publish_fail devolve a human_review e libera nova aprovação", async () => {
    await tx(async (c) => {
      const cru = await seedSubmission(c);
      await asService(c);
      expect((await complete(c, cru, res)).rows[0]!.r).toBe("not_approved");
      expect((await failPublish(c, cru, "publish_rejected")).rows[0]!.r).toBe("not_approved");
      const id = await approved(c);
      await begin(c, id);
      expect((await failPublish(c, id, "Bad Code")).code).toBe("22023");
      expect((await failPublish(c, id, "list_archived")).rows[0]!.r).toBe("failed");
      expect(await statusOf(c, id)).toBe("human_review");
      expect((await failPublish(c, id, "list_archived")).rows[0]!.r).toBe("not_approved");
      await asSuper(c);
      expect((await c.query("select count(*)::int as n from public.publication_leases where submission_id = $1", [id])).rows[0].n).toBe(0);
      const last = (await reviewRows(c, id)).at(-1)!;
      await asService(c);
      expect(last).toMatchObject({ decision: "publish_failed", reasons: ["list_archived"], justification: "list_archived", actor_id: IDS.admin });
      // corrige e aprova de novo: a aprovação mais recente vale
      expect((await approve(c, id, 2)).rows[0]!.r).toBe("approved");
      expect(((await begin(c, id)).rows[0]!.r as { state: string }).state).toBe("leased");
    });
  });

  it("publication/publish_orphaned bloqueia a publicação humana (orphaned)", async () => {
    await tx(async (c) => {
      const id = await approved(c);
      await asSuper(c);
      await c.query("insert into public.ai_decisions (entity_type, entity_id, kind, pipeline_version, decision, justification, new_version_id) values ('list_submission', $1, 'publication', 's09.1', 'publish_orphaned', 'published_after_failure', $2)", [id, randomUUID()]);
      await asService(c);
      expect(((await begin(c, id)).rows[0]!.r as { state: string }).state).toBe("orphaned");
      expect((await complete(c, id, res)).rows[0]!.r).toBe("orphaned");
    });
  });

  it("o varredor e o expirador da S09 não tocam envio aprovado por humano", async () => {
    await tx(async (c) => {
      const id = await approved(c);
      await c.query("update public.list_submissions set updated_at = now() - interval '3 hours' where id = $1", [id]);
      const rows = (await c.query("select * from public.publication_pending(50, 0)")).rows;
      expect(rows.find((r) => r.submission_id === id)).toBeUndefined();
      expect((await rpc(c, "publication_expire", "$1::uuid, 0", [id])).rows[0]!.r).toBe("not_approved");
      expect(await statusOf(c, id)).toBe("approved");
    });
  });

  it("função nova alguma é executável por anon ou authenticated; nada toca school_lists/list_versions/schools", async () => {
    await tx(async (c) => {
      const fns = (await c.query("select p.oid::regprocedure::text as sig, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype and (p.proname like 'review\\_%' or p.proname like 'parent\\_copy\\_%')")).rows;
      expect(fns.length).toBeGreaterThanOrEqual(11);
      for (const f of fns) {
        for (const role of /review_items_valid/.test(f.sig) ? ["anon"] : ["anon", "authenticated"]) {
          expect((await c.query("select has_function_privilege($1, $2::regprocedure, 'execute') as ok", [role, f.sig])).rows[0].ok, `${role} ${f.sig}`).toBe(false);
        }
        if (!/review_items_valid/.test(f.sig)) expect((await c.query("select has_function_privilege('service_role', $1::regprocedure, 'execute') as ok", [f.sig])).rows[0].ok, f.sig).toBe(/(review_items_from_result|review_assert_admin|review_last_decision)/.test(f.sig) ? false : true);
        if (!/review_items_valid|review_items_from_result/.test(f.sig)) {
          expect(f.prosecdef, f.sig).toBe(true);
          expect(String(f.proconfig)).toContain("search_path=");
        }
      }
      const src = (await c.query("select string_agg(prosrc, ' ') as s from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.proname like 'review\\_%' or p.proname like 'parent\\_copy\\_%')")).rows[0].s as string;
      expect(src).not.toMatch(/school_lists|list_versions|public\.schools/);
    });
  });
});

describe("0204: corrida real entre dois admins (duas conexões)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  async function twoClients<T>(fn: (a: Client, b: Client) => Promise<T>): Promise<T> {
    const a = new Client({ connectionString: DATABASE_URL });
    const b = new Client({ connectionString: DATABASE_URL });
    await Promise.all([a.connect(), b.connect()]);
    try {
      await Promise.all([a.query("set role service_role"), b.query("set role service_role")]);
      return await fn(a, b);
    } finally {
      await Promise.all([a.end(), b.end()]);
    }
  }
  const once = async <T,>(c: Client, f: () => Promise<T>): Promise<T> => {
    await c.query("begin");
    try {
      const r = await f();
      await c.query("commit");
      return r;
    } catch (e) {
      await c.query("rollback");
      throw e;
    }
  };
  async function committed(): Promise<string> {
    return withSuperuser(async (c) => {
      const id = await seedSubmission(c);
      await c.query("select public.review_open($1::uuid, $2::uuid)", [id, IDS.admin]);
      return id;
    });
  }
  const drop = (id: string) => purgeSubmissions([id]);

  it("dois save com a mesma versão esperada: um saved e um stale, uma só versão nova", async () => {
    const id = await committed();
    try {
      const out = await twoClients((a, b) =>
        Promise.all([once(a, () => save(a, id, 1, payload([item({ name: "A" })]))), once(b, () => save(b, id, 1, payload([item({ name: "B" })])))]),
      );
      const states = out.map((o) => (o.rows[0]?.r as { state: string } | undefined)?.state).sort();
      expect(out.map((o) => o.error)).toEqual([null, null]);
      expect(states).toEqual(["saved", "stale"]);
      await withSuperuser(async (c) => {
        expect((await c.query("select count(*)::int as n from public.review_versions where submission_id = $1", [id])).rows[0].n).toBe(2);
        expect((await reviewRows(c, id)).filter((r) => r.decision === "edited")).toHaveLength(1);
      });
    } finally {
      await drop(id);
    }
  });

  it("approve x reject na mesma versão: um vence, o outro recebe not_reviewable", async () => {
    const id = await committed();
    try {
      await withSuperuser((c) => c.query("select public.review_save_version($1::uuid, $2::uuid, 1, $3::jsonb)", [id, IDS.admin, JSON.stringify(payload())]));
      const out = await twoClients((a, b) => Promise.all([once(a, () => approve(a, id, 2)), once(b, () => reject(b, id, 2))]));
      const r = out.map((o) => o.rows[0]?.r).sort();
      expect(out.map((o) => o.error)).toEqual([null, null]);
      expect(r.filter((x) => x === "not_reviewable")).toHaveLength(1);
      expect(r.filter((x) => x === "approved" || x === "rejected")).toHaveLength(1);
      await withSuperuser(async (c) => {
        expect((await reviewRows(c, id)).filter((x) => x.decision === "approved" || x.decision === "rejected")).toHaveLength(1);
      });
    } finally {
      await drop(id);
    }
  });

  it("dois begin_publish simultâneos: um leased e um busy", async () => {
    const id = await committed();
    try {
      await withSuperuser(async (c) => {
        await c.query("select public.review_save_version($1::uuid, $2::uuid, 1, $3::jsonb)", [id, IDS.admin, JSON.stringify(payload())]);
        await c.query("select public.review_approve($1::uuid, $2::uuid, 2, '[]'::jsonb)", [id, IDS.admin]);
      });
      const out = await twoClients((a, b) => Promise.all([once(a, () => begin(a, id)), once(b, () => begin(b, id))]));
      const s = out.map((o) => (o.rows[0]?.r as { state: string }).state).sort();
      expect(s).toEqual(["busy", "leased"]);
    } finally {
      await drop(id);
    }
  });
});
