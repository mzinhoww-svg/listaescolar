import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { attempt, cleanupUsers, IDS, seedUsers, withClaims, withSuperuser, type Identity } from "./helpers";

type Status = "submitted" | "processing" | "review_needed" | "human_review" | "approved" | "published" | "rejected";
const GOOD_RESULT = { items: [{ name: "Caderno", quantity: 1, unit: null, confidence: 0.9 }], overallConfidence: 0.9, warnings: [] };

/** Envio (school_member) + job + ocr_jobs, gravados como superuser. Devolve o id do envio. */
async function seedSubmission(c: Client, opts: { status?: Status; result?: unknown | null; source?: "school" | "parent"; demo?: boolean } = {}): Promise<string> {
  const id = randomUUID();
  const consent = randomUUID();
  const owner = IDS.school_member;
  await c.query("insert into public.consents (id, profile_id, purpose, text_version) values ($1, $2, 'list_upload', 'v1')", [consent, owner]);
  await c.query(
    `insert into public.list_submissions (id, submitted_by, source, school_id, grade, school_year, storage_path, file_name, mime_type, size_bytes, consent_id)
     values ($1, $2, $3::public.submission_source, $4, '4o ano', 2027, $5, 'lista-secreta.pdf', 'application/pdf', 1000, $6)`,
    [id, owner, opts.source ?? "school", randomUUID(), `${owner}/${id}/lista.pdf`, consent],
  );
  if (opts.status && opts.status !== "submitted") await c.query("update public.list_submissions set status = $2::public.list_status where id = $1", [id, opts.status]);
  if (opts.demo) await c.query("update public.list_submissions set is_demo = true where id = $1", [id]);
  const result = opts.result === undefined ? GOOD_RESULT : opts.result;
  if (result !== null) {
    const job = await c.query<{ id: string }>(
      "insert into public.jobs (kind, payload, idempotency_key, submission_id) values ('ocr_jobs', '{}'::jsonb, $1, $2) returning id",
      [`k-${id}`, id],
    );
    await c.query("insert into public.ocr_jobs (job_id, submission_id, result) values ($1, $2, $3::jsonb)", [job.rows[0]!.id, id, JSON.stringify(result)]);
  }
  return id;
}

const verdict = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  decision: "auto_publish",
  justification: "rules_passed",
  reasons: [],
  overall_score: 0.9,
  item_scores: [0.9],
  alerts: [],
  pipeline_version: "s09.1",
  ...over,
});
const review = (reasons: string[] = ["critical_alert"]) => verdict({ decision: "human_review", justification: reasons[0], reasons });

const asService = (c: Client) => c.query("set local role service_role");
const asSuper = (c: Client) => c.query("reset role");
const recordV = (c: Client, id: string, v: unknown) => attempt(c, "select public.publication_record_verdict($1, $2::jsonb) as r", [id, JSON.stringify(v)]);
const status = async (c: Client, id: string) => (await c.query("select status::text as s from public.list_submissions where id = $1", [id])).rows[0]!.s as string;
const rowsOf = async (c: Client, id: string) =>
  (await c.query("select decision, kind, provider, model, prompt_key, prompt_version, reasons, pipeline_version, actor_id, previous_version_id, new_version_id, justification from public.ai_decisions where entity_id = $1 order by case decision when 'auto_publish' then 1 when 'human_review' then 1 when 'published' then 2 else 3 end", [id])).rows;

/** Transação superuser que sempre faz rollback, já no papel service_role (troque com asSuper/asService). */
async function svc(fn: (c: Client) => Promise<void>): Promise<void> {
  await withSuperuser(async (c) => {
    await c.query("begin");
    try {
      await fn(c);
    } finally {
      await c.query("rollback");
    }
  });
}

const NEW_FNS = [
  ["publication_load_input", "($1::uuid)", [randomUUID()]],
  ["publication_record_verdict", "($1::uuid, '{}'::jsonb)", [randomUUID()]],
  ["publication_complete", "($1::uuid, '{}'::jsonb)", [randomUUID()]],
  ["publication_fail", "($1::uuid, 'x')", [randomUUID()]],
  ["publication_pending", "(10, 0)", []],
] as const;

describe("0203: ai_settings.auto_publish_enabled", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("default false, not null, e a mudança é auditada", async () => {
    const col = await withSuperuser(async (c) =>
      (await c.query("select is_nullable, column_default, data_type from information_schema.columns where table_name = 'ai_settings' and column_name = 'auto_publish_enabled'")).rows[0],
    );
    expect(col).toEqual({ is_nullable: "NO", column_default: "false", data_type: "boolean" });
    await withClaims("admin", async (c) => {
      expect((await c.query("select auto_publish_enabled from public.ai_settings where scope = 'default'")).rows[0].auto_publish_enabled).toBe(false);
      await c.query("update public.ai_settings set auto_publish_enabled = true where scope = 'default'");
      const r = await c.query("select actor_role, before, after from public.audit_log where entity_table = 'ai_settings' order by created_at desc, id desc limit 1");
      expect(r.rows[0].actor_role).toBe("admin");
      expect(JSON.stringify(r.rows[0].after)).toContain("\"auto_publish_enabled\":true");
      expect((await attempt(c, "update public.ai_settings set auto_publish_enabled = null where scope = 'default'")).error).not.toBeNull();
    });
  });
});

describe("0203: CHECKs de acoplamento de ai_decisions", () => {
  const base = {
    entity_type: "list_submission", entity_id: "", kind: "extraction", provider: "fake", model: "m-sint", prompt_key: "extract_list",
    prompt_version: 1, pipeline_version: "s08.1", decision: "accepted", reasons: "[]",
  };
  async function ins(c: Client, over: Record<string, unknown>) {
    const r = { ...base, entity_id: randomUUID(), ...over };
    return attempt(
      c,
      `insert into public.ai_decisions (entity_type, entity_id, kind, provider, model, prompt_key, prompt_version, pipeline_version, decision, reasons, new_version_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)`,
      [r.entity_type, r.entity_id, r.kind, r.provider, r.model, r.prompt_key, r.prompt_version, r.pipeline_version, r.decision, r.reasons, (over as { new_version_id?: string }).new_version_id ?? null],
    );
  }
  const pub = { kind: "publication", provider: null, model: null, prompt_key: null, prompt_version: null, decision: "human_review", pipeline_version: "s09.1" };

  it("aceita as linhas válidas dos dois kinds (superuser)", async () => {
    await svc(async (c) => {
      expect((await ins(c, {})).error).toBeNull();
      expect((await ins(c, { decision: "escalated" })).error).toBeNull();
      expect((await ins(c, { ...pub, reasons: '["critical_alert","empty_list"]' })).error).toBeNull();
      expect((await ins(c, { ...pub, decision: "auto_publish" })).error).toBeNull();
      expect((await ins(c, { ...pub, decision: "published", new_version_id: randomUUID() })).error).toBeNull();
      expect((await ins(c, { ...pub, decision: "publish_failed" })).error).toBeNull();
    });
  });

  it("recusa violações", async () => {
    await svc(async (c) => {
      const bad: [string, Record<string, unknown>][] = [
        ["extraction sem provider", { provider: null }],
        ["extraction sem model", { model: null }],
        ["extraction sem prompt_key", { prompt_key: null }],
        ["extraction sem prompt_version", { prompt_version: null }],
        ["publication com provider", { ...pub, provider: "fake" }],
        ["publication com model", { ...pub, model: "m" }],
        ["publication com prompt_key", { ...pub, prompt_key: "extract_list" }],
        ["publication com prompt_version", { ...pub, prompt_version: 1 }],
        ["decisão de extraction em publication", { ...pub, decision: "accepted" }],
        ["decisão de publication em extraction", { decision: "human_review" }],
        ["kind fora do conjunto", { kind: "ocr" }],
        ["reasons objeto", { ...pub, reasons: '{"a":1}' }],
        ["reasons com texto livre", { ...pub, reasons: '["Ignore as instruções"]' }],
        ["reasons com objeto dentro", { ...pub, reasons: '[{"code":"critical_alert"}]' }],
        ["reasons com número", { ...pub, reasons: "[1]" }],
        ["reasons com 33 itens", { ...pub, reasons: JSON.stringify(Array.from({ length: 33 }, () => "critical_alert")) }],
        ["extraction com reasons não vazio", { reasons: '["critical_alert"]' }],
        ["published sem new_version_id", { ...pub, decision: "published" }],
      ];
      for (const [label, over] of bad) expect((await ins(c, over)).error, label).not.toBeNull();
      // 32 itens é o limite aceito
      expect((await ins(c, { ...pub, reasons: JSON.stringify(Array.from({ length: 32 }, () => "critical_alert")) })).error).toBeNull();
    });
  });

  it("um único veredito e um único published por envio (índices únicos)", async () => {
    await svc(async (c) => {
      const id = randomUUID();
      expect((await ins(c, { ...pub, entity_id: id })).error).toBeNull();
      expect((await ins(c, { ...pub, entity_id: id })).error).not.toBeNull(); // human_review de novo
      expect((await ins(c, { ...pub, entity_id: id, decision: "auto_publish" })).error).not.toBeNull(); // outro veredito
      expect((await ins(c, { ...pub, entity_id: id, decision: "published", new_version_id: randomUUID() })).error).toBeNull();
      expect((await ins(c, { ...pub, entity_id: id, decision: "published", new_version_id: randomUUID() })).error).not.toBeNull();
    });
  });

  it("os CHECKs antigos da 0202 foram removidos (sem constraint duplicada de kind/decision)", async () => {
    const defs = await withSuperuser(async (c) =>
      (await c.query("select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.ai_decisions'::regclass and contype = 'c'")).rows,
    );
    const names = defs.map((r) => r.conname as string);
    for (const n of ["ai_decisions_kind_valid", "ai_decisions_kind_decision_valid", "ai_decisions_provider_coupling", "ai_decisions_reasons_scope", "ai_decisions_reasons_valid"]) expect(names).toContain(n);
    // nenhum CHECK antigo "só extraction" sobrevive
    for (const r of defs) expect(String(r.def), r.conname as string).not.toMatch(/^CHECK \(\(?kind = ANY \(ARRAY\['extraction'::text\]\)\)?\)$|^CHECK \(\(?kind = 'extraction'::text\)?\)$/);
    const kinds = defs.filter((r) => /\bkind\b/.test(String(r.def)) && !String(r.def).includes("decision") && !String(r.def).includes("provider") && !String(r.def).includes("reasons"));
    expect(kinds.map((r) => r.conname)).toEqual(["ai_decisions_kind_valid"]);
  });

  it("append-only continua valendo para linhas publication", async () => {
    await svc(async (c) => {
      const id = randomUUID();
      await ins(c, { ...pub, entity_id: id });
      expect((await attempt(c, "update public.ai_decisions set justification = 'x' where entity_id = $1", [id])).code).toBe("42501");
      expect((await attempt(c, "delete from public.ai_decisions where entity_id = $1", [id])).code).toBe("42501");
      expect((await attempt(c, "truncate public.ai_decisions")).code).toBe("42501");
    });
  });
});

describe("0203: ai_record_decision só para extraction", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);
  const ext = () => ({
    entity_type: "list_submission", entity_id: randomUUID(), kind: "extraction", provider: "fake", model: "m-sint", prompt_key: "extract_list",
    prompt_version: 1, pipeline_version: "s08.1", decision: "accepted",
  });
  it("recusa kind=publication (22023) e segue aceitando extraction", async () => {
    await withClaims("system", async (c) => {
      const pubTry = { ...ext(), kind: "publication", decision: "auto_publish" };
      expect((await attempt(c, "select public.ai_record_decision($1::jsonb)", [JSON.stringify(pubTry)])).code).toBe("22023");
      const noKind: Record<string, unknown> = ext();
      delete noKind.kind;
      expect((await attempt(c, "select public.ai_record_decision($1::jsonb)", [JSON.stringify(noKind)])).error).not.toBeNull();
      for (const d of ["accepted", "escalated", "failed"]) {
        expect((await attempt(c, "select public.ai_record_decision($1::jsonb)", [JSON.stringify({ ...ext(), decision: d })])).error, d).toBeNull();
      }
      expect((await attempt(c, "select public.ai_record_decision($1::jsonb)", [JSON.stringify({ ...ext(), reasons: ["x"] })])).error).not.toBeNull(); // reasons não é campo permitido
      expect((await attempt(c, "select count(*)::int as n from public.ai_decisions where kind = 'publication'")).rows[0]!.n).toBe(0);
    });
  });
});

describe("0203: publication_load_input", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);
  it("devolve só as chaves previstas, sem arquivo, caminho nem contato", async () => {
    await svc(async (c) => {
      const id = await seedSubmission(c, { status: "review_needed" });
      await asService(c);
      const r = await c.query("select public.publication_load_input($1) as j", [id]);
      const j = r.rows[0].j as Record<string, unknown>;
      expect(Object.keys(j).sort()).toEqual(["grade", "is_demo", "result", "school_id", "source", "status", "submitted_by", "school_year"].sort());
      expect(j.status).toBe("review_needed");
      expect(j.source).toBe("school");
      expect(j.result).toEqual(GOOD_RESULT);
      expect(JSON.stringify(j)).not.toMatch(/lista-secreta|storage_path|notify|file_name/);
    });
  });
  it("sem resultado: result null; inexistente: P0002", async () => {
    await svc(async (c) => {
      const id = await seedSubmission(c, { status: "processing", result: null });
      await asService(c);
      expect((await c.query("select public.publication_load_input($1) as j", [id])).rows[0].j.result).toBeNull();
      expect((await attempt(c, "select public.publication_load_input($1)", [randomUUID()])).code).toBe("P0002");
    });
  });
});

describe("0203: publication_record_verdict", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("auto_publish: linha e status approved na mesma transação; repetição = already_decided", async () => {
    await svc(async (c) => {
      const id = await seedSubmission(c, { status: "review_needed" });
      await asService(c);
      const r = await recordV(c, id, verdict());
      expect(r.error).toBeNull();
      expect(r.rows[0]!.r).toBe("recorded");
      expect(await status(c, id)).toBe("approved");
      const rows = await rowsOf(c, id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ decision: "auto_publish", kind: "publication", provider: null, model: null, prompt_key: null, prompt_version: null, reasons: [], pipeline_version: "s09.1", actor_id: null, justification: "rules_passed" });
      expect((await recordV(c, id, verdict())).rows[0]!.r).toBe("already_decided");
      expect((await recordV(c, id, review())).rows[0]!.r).toBe("already_decided");
      expect(await rowsOf(c, id)).toHaveLength(1);
    });
  });

  it("human_review: linha com todos os motivos e status human_review", async () => {
    await svc(async (c) => {
      const id = await seedSubmission(c, { status: "review_needed" });
      await asService(c);
      expect((await recordV(c, id, review(["critical_alert", "empty_list"]))).rows[0]!.r).toBe("recorded");
      expect(await status(c, id)).toBe("human_review");
      const rows = await rowsOf(c, id);
      expect(rows[0]).toMatchObject({ decision: "human_review", reasons: ["critical_alert", "empty_list"], justification: "critical_alert" });
    });
  });

  it("not_ready: status anterior a review_needed, ou review_needed sem resultado; nada é gravado", async () => {
    await svc(async (c) => {
      const a = await seedSubmission(c, { status: "processing" });
      const b = await seedSubmission(c, { status: "review_needed", result: null });
      const d = await seedSubmission(c, { status: "rejected" });
      await asService(c);
      for (const id of [a, b, d]) {
        expect((await recordV(c, id, verdict())).rows[0]!.r).toBe("not_ready");
        expect(await rowsOf(c, id)).toHaveLength(0);
      }
      expect(await status(c, a)).toBe("processing");
    });
  });

  it("already_decided para status adiante sem linha (human_review/approved/published)", async () => {
    await svc(async (c) => {
      const ids = [await seedSubmission(c, { status: "human_review" }), await seedSubmission(c, { status: "approved" }), await seedSubmission(c, { status: "published" })];
      await asService(c);
      for (const id of ids) expect((await recordV(c, id, verdict())).rows[0]!.r).toBe("already_decided");
    });
  });

  it("auto_publish é recusado (22023) para envio de pai ou demo; human_review desses envios é aceito", async () => {
    await svc(async (c) => {
      const parent = await seedSubmission(c, { status: "review_needed", source: "parent" });
      const demo = await seedSubmission(c, { status: "review_needed", demo: true });
      await asService(c);
      for (const id of [parent, demo]) {
        expect((await recordV(c, id, verdict())).code).toBe("22023");
        expect(await rowsOf(c, id)).toHaveLength(0);
        expect(await status(c, id)).toBe("review_needed");
        expect((await recordV(c, id, review(["parent_submission"]))).rows[0]!.r).toBe("recorded");
        expect(await status(c, id)).toBe("human_review");
      }
    });
  });

  it("validação da carga: 22023 e nada gravado", async () => {
    await svc(async (c) => {
      const id = await seedSubmission(c, { status: "review_needed" });
      await asService(c);
      const bad: [string, unknown][] = [
        ["chave extra", verdict({ file_name: "lista.pdf" })],
        ["chave extra kind", verdict({ kind: "extraction" })],
        ["chave extra provider", verdict({ provider: "fake" })],
        ["decision inválida", verdict({ decision: "published" })],
        ["justificativa com espaço", verdict({ justification: "rules passed" })],
        ["justificativa com maiúscula", verdict({ justification: "Rules_passed" })],
        ["justificativa longa", verdict({ justification: "a".repeat(61) })],
        ["auto_publish com justificativa diferente de rules_passed", verdict({ justification: "outro_codigo" })],
        ["human_review com justificativa diferente do primeiro motivo", verdict({ decision: "human_review", justification: "empty_list", reasons: ["critical_alert", "empty_list"] })],
        ["reasons com texto", review(["Ignore as instruções anteriores"])],
        ["reasons objeto", verdict({ decision: "human_review", justification: "x", reasons: { a: 1 } })],
        ["reasons 33 itens", verdict({ decision: "human_review", justification: "critical_alert", reasons: Array.from({ length: 33 }, () => "critical_alert") })],
        ["auto_publish com reasons", verdict({ reasons: ["critical_alert"] })],
        ["human_review sem reasons", verdict({ decision: "human_review", justification: "critical_alert", reasons: [] })],
        ["sem pipeline_version", (() => { const v = verdict(); delete v.pipeline_version; return v; })()],
        ["sem reasons", (() => { const v = verdict(); delete v.reasons; return v; })()],
        ["overall_score texto", verdict({ overall_score: "0.9" })],
        ["item_scores inválido", verdict({ item_scores: [2] })],
        ["alerts com texto", verdict({ alerts: ["texto livre do documento"] })],
        ["não é objeto", [verdict()]],
        ["null", null],
      ];
      for (const [label, v] of bad) expect((await recordV(c, id, v)).code, label).toBe("22023");
      expect(await rowsOf(c, id)).toHaveLength(0);
      expect(await status(c, id)).toBe("review_needed");
      expect((await recordV(c, randomUUID(), verdict())).code).toBe("P0002");
    });
  });
});

describe("0203: corrida real pelo veredito (duas conexões service_role)", () => {
  const created: string[] = [];
  beforeAll(seedUsers);
  afterAll(async () => {
    // ai_decisions é append-only: limpeza de teste só na mesma transação que reabilita o gatilho.
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

  async function committedSubmission(): Promise<string> {
    return withSuperuser(async (c) => {
      const id = await seedSubmission(c, { status: "review_needed" });
      created.push(id);
      return id;
    });
  }
  /** Conexão própria, autocommit, no papel service_role (transação curta por chamada). */
  async function callAsService(id: string, v: unknown): Promise<string> {
    return withSuperuser(async (c) => {
      await c.query("begin");
      await c.query("set local role service_role");
      const r = await c.query("select public.publication_record_verdict($1, $2::jsonb) as r", [id, JSON.stringify(v)]);
      await c.query("commit");
      return r.rows[0].r as string;
    });
  }
  const committedState = (id: string) => withSuperuser(async (c) => ({ status: await status(c, id), rows: await rowsOf(c, id) }));

  it("Promise.all: exatamente um 'recorded', uma linha, status coerente com a linha", async () => {
    for (const [a, b] of [[verdict(), verdict()], [verdict(), review()], [review(), verdict()], [review(["empty_list"]), review(["critical_alert"])]] as const) {
      const id = await committedSubmission();
      const out = await Promise.all([callAsService(id, a), callAsService(id, b)]);
      expect(out.filter((x) => x === "recorded")).toHaveLength(1);
      expect(out.filter((x) => x === "already_decided")).toHaveLength(1);
      const s = await committedState(id);
      expect(s.rows).toHaveLength(1);
      expect(s.status).toBe(s.rows[0]!.decision === "auto_publish" ? "approved" : "human_review");
    }
  });

  it("sobreposição garantida: o segundo espera o lock do primeiro e perde", async () => {
    const id = await committedSubmission();
    const a = new (await import("pg")).Client({ connectionString: (await import("./helpers")).DATABASE_URL });
    await a.connect();
    try {
      await a.query("begin");
      await a.query("set local role service_role");
      expect((await a.query("select public.publication_record_verdict($1, $2::jsonb) as r", [id, JSON.stringify(verdict())])).rows[0].r).toBe("recorded");
      const second = callAsService(id, review());
      // espera a segunda conexão ficar bloqueada no lock do envio
      let waiting = 0;
      for (let i = 0; i < 100 && waiting === 0; i++) {
        waiting = await withSuperuser(async (c) => (await c.query("select count(*)::int as n from pg_stat_activity where wait_event_type = 'Lock' and query like '%publication_record_verdict%'")).rows[0].n as number);
        if (waiting === 0) await new Promise((r) => setTimeout(r, 50));
      }
      expect(waiting).toBeGreaterThan(0);
      await a.query("commit");
      expect(await second).toBe("already_decided");
    } finally {
      await a.end();
    }
    const s = await committedState(id);
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0]!.decision).toBe("auto_publish");
    expect(s.status).toBe("approved");
  });
});

describe("0203: publication_complete", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);
  const done = (over: Record<string, unknown> = {}) => ({ previous_version_id: null, new_version_id: randomUUID(), ...over });
  const completeV = (c: Client, id: string, v: unknown) => attempt(c, "select public.publication_complete($1, $2::jsonb) as r", [id, JSON.stringify(v)]);

  it("de approved com auto_publish grava published (versões) e move para published; repetição é no-op", async () => {
    await svc(async (c) => {
      const id = await seedSubmission(c, { status: "review_needed" });
      await asService(c);
      await recordV(c, id, verdict());
      const prev = randomUUID();
      const next = randomUUID();
      const r = await completeV(c, id, done({ previous_version_id: prev, new_version_id: next }));
      expect(r.error).toBeNull();
      expect(r.rows[0]!.r).toBe("completed");
      expect(await status(c, id)).toBe("published");
      const rows = await rowsOf(c, id);
      expect(rows.map((x) => x.decision)).toEqual(["auto_publish", "published"]);
      expect(rows[1]).toMatchObject({ previous_version_id: prev, new_version_id: next, kind: "publication", provider: null, actor_id: null, pipeline_version: "s09.1" });
      expect((await completeV(c, id, done())).rows[0]!.r).toBe("already_completed");
      expect(await rowsOf(c, id)).toHaveLength(2);
    });
  });

  it("primeira publicação: previous nulo é aceito", async () => {
    await svc(async (c) => {
      const id = await seedSubmission(c, { status: "review_needed" });
      await asService(c);
      await recordV(c, id, verdict());
      expect((await completeV(c, id, { new_version_id: randomUUID() })).rows[0]!.r).toBe("completed");
      expect((await rowsOf(c, id))[1]!.previous_version_id).toBeNull();
    });
  });

  it("published sem veredito auto_publish é impossível (not_approved, nada gravado)", async () => {
    await svc(async (c) => {
      const noVerdict = await seedSubmission(c, { status: "approved" }); // approved "à força", sem linha
      const review1 = await seedSubmission(c, { status: "review_needed" });
      const human = await seedSubmission(c, { status: "review_needed" });
      await asService(c);
      await recordV(c, human, review());
      for (const id of [noVerdict, review1, human]) {
        expect((await completeV(c, id, done())).rows[0]!.r, id).toBe("not_approved");
        expect((await rowsOf(c, id)).filter((x) => x.decision === "published")).toHaveLength(0);
      }
      expect(await status(c, human)).toBe("human_review");
    });
  });

  it("exige new_version_id uuid; chave extra e tipos errados são 22023", async () => {
    await svc(async (c) => {
      const id = await seedSubmission(c, { status: "review_needed" });
      await asService(c);
      await recordV(c, id, verdict());
      const bad: [string, unknown][] = [
        ["sem new_version_id", { previous_version_id: null }],
        ["new_version_id nulo", { new_version_id: null }],
        ["new_version_id não uuid", { new_version_id: "abc" }],
        ["previous não uuid", done({ previous_version_id: "abc" })],
        ["chave extra", done({ list_id: randomUUID() })],
        ["não é objeto", []],
      ];
      for (const [label, v] of bad) expect((await completeV(c, id, v)).code, label).toBe("22023");
      expect(await status(c, id)).toBe("approved");
      expect((await completeV(c, randomUUID(), done())).code).toBe("P0002");
    });
  });
});

describe("0203: publication_fail", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);
  const failV = (c: Client, id: string, reason: string) => attempt(c, "select public.publication_fail($1, $2) as r", [id, reason]);

  it("approved vira human_review com linha publish_failed; repetição é no-op", async () => {
    await svc(async (c) => {
      const id = await seedSubmission(c, { status: "review_needed" });
      await asService(c);
      await recordV(c, id, verdict());
      const r = await failV(c, id, "publisher_rejected");
      expect(r.error).toBeNull();
      expect(r.rows[0]!.r).toBe("failed");
      expect(await status(c, id)).toBe("human_review");
      const rows = await rowsOf(c, id);
      expect(rows.map((x) => x.decision)).toEqual(["auto_publish", "publish_failed"]);
      expect(rows[1]).toMatchObject({ justification: "publisher_rejected", new_version_id: null, kind: "publication" });
      expect((await failV(c, id, "publisher_rejected")).rows[0]!.r).toBe("already_failed");
      expect(await rowsOf(c, id)).toHaveLength(2);
    });
  });

  it("recusa estados errados e motivo que não é código", async () => {
    await svc(async (c) => {
      const notApproved = await seedSubmission(c, { status: "review_needed" });
      const published = await seedSubmission(c, { status: "review_needed" });
      const ok = await seedSubmission(c, { status: "review_needed" });
      await asService(c);
      await recordV(c, published, verdict());
      await c.query("select public.publication_complete($1, $2::jsonb)", [published, JSON.stringify({ new_version_id: randomUUID() })]);
      await recordV(c, ok, verdict());
      expect((await failV(c, notApproved, "x_y")).rows[0]!.r).toBe("not_approved");
      expect((await failV(c, published, "x_y")).rows[0]!.r).toBe("not_approved");
      expect(await status(c, published)).toBe("published");
      for (const bad of ["Texto livre", "a b", "", "A".repeat(10), "a".repeat(61), "a:b", "a.b", "a-b", "1abc"]) expect((await failV(c, ok, bad)).code, bad).toBe("22023");
      expect(await status(c, ok)).toBe("approved");
      expect((await failV(c, randomUUID(), "x_y")).code).toBe("P0002");
    });
  });
});

describe("0203: publication_pending", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);
  const pending = async (c: Client, limit: number, age: number) =>
    (await c.query("select submission_id, state, updated_at from public.publication_pending($1, $2)", [limit, age])).rows as { submission_id: string; state: string; updated_at: Date }[];
  const backdate = async (c: Client, id: string, secs: number) => {
    await c.query("alter table public.list_submissions disable trigger list_submissions_set_updated_at"); // dentro da transação de teste (rollback)
    await c.query("update public.list_submissions set updated_at = now() - make_interval(secs => $2) where id = $1", [id, secs]);
    await c.query("alter table public.list_submissions enable trigger list_submissions_set_updated_at");
  };

  it("lista decide (review_needed com resultado, sem veredito) e publish (approved sem published), por idade", async () => {
    await svc(async (c) => {
      const old = await seedSubmission(c, { status: "review_needed" });
      const fresh = await seedSubmission(c, { status: "review_needed" });
      const noResult = await seedSubmission(c, { status: "review_needed", result: null });
      const approved = await seedSubmission(c, { status: "review_needed" });
      const published = await seedSubmission(c, { status: "review_needed" });
      const human = await seedSubmission(c, { status: "review_needed" });
      await asService(c);
      await recordV(c, approved, verdict());
      await recordV(c, published, verdict());
      await c.query("select public.publication_complete($1, $2::jsonb)", [published, JSON.stringify({ new_version_id: randomUUID() })]);
      await recordV(c, human, review());
      await asSuper(c);
      await backdate(c, old, 600);
      await backdate(c, approved, 300);
      await asService(c);
      const got = await pending(c, 50, 120);
      const byId = new Map(got.map((r) => [r.submission_id, r.state]));
      expect(byId.get(old)).toBe("decide");
      expect(byId.get(approved)).toBe("publish");
      for (const id of [fresh, noResult, published, human]) expect(byId.has(id), id).toBe(false);
      // sem idade mínima, o envio novo entra
      expect((await pending(c, 50, 0)).some((r) => r.submission_id === fresh)).toBe(true);
      // ordem por idade (mais antigo primeiro)
      const ordered = got.map((r) => r.updated_at.getTime());
      expect([...ordered].sort((x, y) => x - y)).toEqual(ordered);
    });
  });

  it("publish exige veredito auto_publish e nenhum published/publish_failed: 'approved à força' fica fora", async () => {
    await svc(async (c) => {
      const forced = await seedSubmission(c, { status: "approved" }); // aprovação humana/correção manual, sem veredito
      const failed = await seedSubmission(c, { status: "review_needed" });
      const ok = await seedSubmission(c, { status: "review_needed" });
      await asService(c);
      await recordV(c, failed, verdict());
      await c.query("select public.publication_fail($1, 'publisher_rejected')", [failed]);
      await c.query("update public.list_submissions set status = 'approved' where id = $1", [failed]); // aprovação humana posterior
      await recordV(c, ok, verdict());
      const byId = new Map((await pending(c, 50, 0)).map((r) => [r.submission_id, r.state]));
      expect(byId.get(ok)).toBe("publish");
      expect(byId.has(forced)).toBe(false);
      expect(byId.has(failed)).toBe(false);
    });
  });

  it("respeita o limite (teto 50, mínimo 1)", async () => {
    await svc(async (c) => {
      for (let i = 0; i < 3; i++) await seedSubmission(c, { status: "review_needed" });
      await asService(c);
      expect(await pending(c, 2, 0)).toHaveLength(2);
      expect((await pending(c, 0, 0)).length).toBe(1);
      expect((await pending(c, 100000, 0)).length).toBeLessThanOrEqual(50);
    });
  });
});

describe("0203: privilégios das funções novas", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);
  for (const who of ["anon", "parent", "school_member", "stationery_member", "orphan", "admin", "system_profile"] as const satisfies Identity[]) {
    for (const [fn, args, params] of NEW_FNS) {
      it(`${who} não executa ${fn}`, async () => {
        await withClaims(who, async (c) => {
          expect((await attempt(c, `select public.${fn}${args}`, [...params])).code).toBe("42501");
        });
      });
    }
  }
  it("service_role executa; public não tem EXECUTE; validador puro só authenticated/service_role", async () => {
    await withSuperuser(async (c) => {
      for (const [fn] of NEW_FNS) {
        const r = await c.query(
          `select has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u,
                  has_function_privilege('service_role', p.oid, 'execute') s, p.prosecdef d, p.proconfig::text cfg
             from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`,
          [fn],
        );
        expect(r.rows, fn).toHaveLength(1);
        expect(r.rows[0], fn).toMatchObject({ a: false, u: false, s: true, d: true });
        expect(r.rows[0]!.cfg, fn).toContain("search_path=");
      }
      const v = await c.query("select has_function_privilege('anon', 'public.ai_reason_codes_valid(jsonb)', 'execute') a, has_function_privilege('authenticated', 'public.ai_reason_codes_valid(jsonb)', 'execute') u");
      expect(v.rows[0]).toEqual({ a: false, u: true });
    });
  });
  it("ai_reason_codes_valid: aceita códigos, recusa o resto", async () => {
    await withSuperuser(async (c) => {
      const ok = async (j: unknown) => (await c.query("select public.ai_reason_codes_valid($1::jsonb) as v", [JSON.stringify(j)])).rows[0].v as boolean;
      expect(await ok([])).toBe(true);
      expect(await ok(["critical_alert", "empty_list"])).toBe(true);
      expect(await ok(Array.from({ length: 32 }, () => "a"))).toBe(true);
      expect(await ok(Array.from({ length: 33 }, () => "a"))).toBe(false);
      for (const bad of [{}, "a", 1, [1], [{ a: 1 }], ["A"], ["a b"], ["1a"], [null], ["a".repeat(65)]]) expect(await ok(bad), JSON.stringify(bad)).toBe(false);
    });
  });
});
