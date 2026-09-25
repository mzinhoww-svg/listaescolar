import { describe, expect, it, vi } from "vitest";
import { decideListPublication, resumePublication } from "../../supabase/functions/_shared/publication/decide";
import type { ListPublisher, PublishRequest, PublishResult } from "../../supabase/functions/_shared/publication/ports";
import { REASON_CODE_PATTERN } from "../../supabase/functions/_shared/publication/codes";
import { SUBMISSION, SCHOOL, goodContext, goodInput, goodResult, kit, permanent, settings, transient } from "./helpers";

const ALLOWED_KEYS = ["decision", "justification", "reasons", "overall_score", "item_scores", "alerts", "pipeline_version", "started_at", "finished_at", "latency_ms"];

describe("decideListPublication: fluxo feliz", () => {
  it("primeira publicação: previousVersionId nulo, linhas auto_publish + published, envio published", async () => {
    const k = kit();
    const r = await decideListPublication(SUBMISSION, k.deps);
    expect(r.status).toBe("auto_published");
    if (r.status !== "auto_published") return;
    expect(r.previousVersionId).toBeNull();
    expect(r.newVersionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(k.store.rows.map((x) => x.decision)).toEqual(["auto_publish", "published"]);
    expect(k.store.rows[1]).toMatchObject({ previousVersionId: null, newVersionId: r.newVersionId });
    expect(k.store.status).toBe("published");
    expect(k.publisher.calls).toHaveLength(1);
    expect(k.publisher.calls[0]).toMatchObject({
      idempotencyKey: SUBMISSION,
      submissionId: SUBMISSION,
      schoolId: SCHOOL,
      gradeSlug: "ef-4",
      schoolYear: 2027,
      source: "school_upload",
      actor: { kind: "system" },
    });
    expect(k.publisher.calls[0]!.items[0]).toMatchObject({ position: 1, originalName: "Caderno", normalizedName: "caderno", category: "papelaria", quantity: 2, unit: "un" });
  });

  it("segunda publicação da mesma lista: previousVersionId = a versão anterior", async () => {
    const k = kit();
    const first = await decideListPublication(SUBMISSION, k.deps);
    // segundo envio (outro id) na mesma escola/série/ano, pela mesma porta
    const second = await k.publisher.publish({ ...(k.publisher.calls[0] as PublishRequest), idempotencyKey: "outro", submissionId: "outro" });
    expect(first.status).toBe("auto_published");
    if (first.status !== "auto_published") return;
    expect(second.previousVersionId).toBe(first.newVersionId);
  });

  it("payload do veredito: só chaves permitidas e códigos do alfabeto; sem texto do documento", async () => {
    const k = kit();
    await decideListPublication(SUBMISSION, k.deps);
    const payload = k.store.rows[0]!.payload!;
    expect(Object.keys(payload).every((x) => ALLOWED_KEYS.includes(x))).toBe(true);
    expect(payload).toMatchObject({ decision: "auto_publish", justification: "rules_passed", reasons: [], pipeline_version: "s09.1" });
    expect(payload.item_scores).toEqual([0.9, 0.95]);
    expect(JSON.stringify(payload)).not.toMatch(/Caderno|Lápis|caderno|lapis/);
    for (const c of payload.reasons) expect(c).toMatch(REASON_CODE_PATTERN);
  });
});

describe("decideListPublication: cada família de falha vai a human_review sem chamar o publisher", () => {
  type Case = { name: string; code: string; input?: Partial<ReturnType<typeof goodInput>>; ctx?: Partial<ReturnType<typeof goodContext>>; set?: Partial<ReturnType<typeof settings>>; result?: (r: Record<string, unknown>) => void };
  const cases: Case[] = [
    { name: "score abaixo do limiar", code: "overall_below_threshold", result: (r) => { r.overallConfidence = 0.5; } },
    { name: "lowConfidence", code: "low_confidence_extraction", result: (r) => { r.lowConfidence = true; } },
    { name: "alerta crítico", code: "critical_alert", result: (r) => { r.alerts = ["handwritten"]; } },
    { name: "item sinalizado", code: "item_flagged", result: (r) => { (r.items as { alerts: string[] }[])[0]!.alerts = ["restrictive_brand_or_spec"]; } },
    { name: "lista vazia", code: "empty_list", result: (r) => { r.items = []; } },
    { name: "envio de pai", code: "parent_submission", input: { source: "parent" } },
    { name: "envio demo", code: "demo_submission", input: { isDemo: true } },
    { name: "escola não verificada", code: "school_not_verified", ctx: { school: { verification: "claimed", municipalityEnabled: true } } },
    { name: "série não resolvida", code: "grade_unresolved", ctx: { gradeSlug: null } },
    { name: "ano inválido", code: "school_year_invalid", ctx: { validSchoolYears: [2020] } },
    { name: "remetente sem vínculo", code: "submitter_not_linked", ctx: { submitterLinked: false } },
    { name: "interruptor desligado", code: "auto_publish_disabled", set: { autoPublishEnabled: false } },
    { name: "limiar vindo de settings", code: "overall_below_threshold", set: { confidenceThreshold: 0.99 } },
  ];
  for (const c of cases) {
    it(c.name, async () => {
      const result = goodResult();
      c.result?.(result);
      const k = kit({ settings: { load: async () => settings(c.set) } }, goodInput({ ...c.input, result }), goodContext(c.ctx));
      const r = await decideListPublication(SUBMISSION, k.deps);
      expect(r).toMatchObject({ status: "human_review" });
      if (r.status === "human_review") expect(r.reasons).toContain(c.code);
      expect(k.store.rows.map((x) => x.decision)).toEqual(["human_review"]);
      expect(k.store.rows[0]!.reasons).toContain(c.code);
      expect(k.store.status).toBe("human_review");
      expect(k.publisher.calls).toHaveLength(0);
    });
  }
});

describe("decideListPublication: portas e configuração", () => {
  it("settings transitório: retry_later, nada gravado", async () => {
    const k = kit({ settings: { load: async () => { throw transient("settings_unavailable"); } } });
    expect(await decideListPublication(SUBMISSION, k.deps)).toEqual({ status: "retry_later" });
    expect(k.store.rows).toEqual([]);
    expect(k.store.calls.recordVerdict).toBe(0);
    expect(k.store.status).toBe("review_needed");
  });

  it("contexto transitório (ou erro desconhecido): retry_later, nada gravado", async () => {
    for (const err of [transient(), new Error("socket hang up")]) {
      const k = kit({ context: { load: async () => { throw err; } } });
      expect(await decideListPublication(SUBMISSION, k.deps)).toEqual({ status: "retry_later" });
      expect(k.store.rows).toEqual([]);
    }
  });

  it("configuração ausente (settings nulo): human_review com settings_unavailable, registrado", async () => {
    const k = kit({ settings: { load: async () => null } });
    const r = await decideListPublication(SUBMISSION, k.deps);
    expect(r).toMatchObject({ status: "human_review" });
    expect(k.store.rows[0]!.reasons).toContain("settings_unavailable");
    expect(k.publisher.calls).toHaveLength(0);
  });

  it("contexto com erro permanente: human_review com context_unavailable", async () => {
    const k = kit({ context: { load: async () => { throw permanent("no_context"); } } });
    await decideListPublication(SUBMISSION, k.deps);
    expect(k.store.rows[0]!.reasons).toContain("context_unavailable");
  });

  it("portas ausentes: context_unavailable e publisher_unavailable, registrado, nunca publica", async () => {
    const k = kit({ context: null, publisher: null });
    const r = await decideListPublication(SUBMISSION, k.deps);
    expect(r).toMatchObject({ status: "human_review" });
    expect(k.store.rows[0]!.reasons).toEqual(expect.arrayContaining(["context_unavailable", "publisher_unavailable"]));
    const k2 = kit({ publisher: null });
    await decideListPublication(SUBMISSION, k2.deps);
    expect(k2.store.rows[0]!.reasons).toContain("publisher_unavailable");
  });

  it("not_ready e already_decided não têm efeito", async () => {
    const k = kit({}, goodInput({ status: "processing_async" }));
    expect(await decideListPublication(SUBMISSION, k.deps)).toEqual({ status: "not_ready" });
    expect(k.store.rows).toEqual([]);
    const k2 = kit({}, goodInput({ status: "published" }));
    expect(await decideListPublication(SUBMISSION, k2.deps)).toEqual({ status: "already_decided" });
    const k3 = kit({}, goodInput({ result: null }));
    expect(await decideListPublication(SUBMISSION, k3.deps)).toEqual({ status: "not_ready" });
    for (const x of [k, k2, k3]) expect(x.publisher.calls).toHaveLength(0);
  });
});

describe("decideListPublication: falhas ao publicar", () => {
  it("publisher transitório: fica approved; o varredor completa depois", async () => {
    const k = kit();
    const real = k.publisher;
    let n = 0;
    const flaky: ListPublisher = { publish: async (req) => { n += 1; if (n === 1) throw transient("port_down"); return real.publish(req); } };
    k.deps.publisher = flaky;
    const r = await decideListPublication(SUBMISSION, k.deps);
    expect(r).toEqual({ status: "publish_pending" });
    expect(k.store.status).toBe("approved");
    expect(k.store.rows.map((x) => x.decision)).toEqual(["auto_publish"]);
    k.clock.advance(200_000); // a lease da primeira tentativa vence
    const again = await resumePublication(SUBMISSION, k.deps);
    expect(again.status).toBe("auto_published");
    expect(k.store.status).toBe("published");
    expect(k.store.rows.map((x) => x.decision)).toEqual(["auto_publish", "published"]);
  });

  it("publisher com erro desconhecido é tratado como transitório", async () => {
    const k = kit({ publisher: { publish: async () => { throw new Error("ECONNRESET"); } } });
    expect(await decideListPublication(SUBMISSION, k.deps)).toEqual({ status: "publish_pending" });
    expect(k.store.status).toBe("approved");
  });

  it("publisher permanente: publish_failed e o envio volta a human_review", async () => {
    const k = kit({ publisher: { publish: async () => { throw permanent("list_archived"); } } });
    const r = await decideListPublication(SUBMISSION, k.deps);
    expect(r).toEqual({ status: "publish_failed", reason: "list_archived" });
    expect(k.store.status).toBe("human_review");
    expect(k.store.rows.map((x) => x.decision)).toEqual(["auto_publish", "publish_failed"]);
    expect(k.store.rows[1]!.reasons).toEqual(["list_archived"]);
  });

  it("código de erro fora do alfabeto vira publish_rejected", async () => {
    const k = kit({ publisher: { publish: async () => { throw permanent("Erro com espaço e Texto"); } } });
    const r = await decideListPublication(SUBMISSION, k.deps);
    expect(r).toEqual({ status: "publish_failed", reason: "publish_rejected" });
  });

  it("publisher lento (além do teto de 45 s): transitório, sem travar", async () => {
    const k = kit({ publisher: { publish: () => new Promise<PublishResult>(() => undefined) } });
    const p = decideListPublication(SUBMISSION, k.deps);
    await vi.waitFor(() => expect(k.clock.pending()).toBeGreaterThan(0));
    k.clock.advance(45_000);
    expect(await p).toEqual({ status: "publish_pending" });
    expect(k.store.status).toBe("approved");
  });

  it("approved parado há mais de 1 h: publish_failed (publish_expired) sem chamar a porta", async () => {
    const k = kit({ publisher: { publish: async () => { throw transient("port_down"); } } });
    await decideListPublication(SUBMISSION, k.deps);
    const spy = vi.fn();
    k.deps.publisher = { publish: async (r) => { spy(r); throw new Error("não deveria"); } };
    k.clock.advance(3_601_000);
    const r = await resumePublication(SUBMISSION, k.deps);
    expect(r).toEqual({ status: "publish_failed", reason: "publish_expired" });
    expect(spy).not.toHaveBeenCalled();
    expect(k.store.status).toBe("human_review");
    expect(k.store.rows.map((x) => x.decision)).toEqual(["auto_publish", "publish_failed"]);
  });

  it("resume sem porta (publisher nulo) com veredito gravado: publish_failed publisher_unavailable", async () => {
    const k = kit({ publisher: { publish: async () => { throw transient(); } } });
    await decideListPublication(SUBMISSION, k.deps);
    k.deps.publisher = null;
    k.clock.advance(200_000);
    expect(await resumePublication(SUBMISSION, k.deps)).toEqual({ status: "publish_failed", reason: "publisher_unavailable" });
  });
});

describe("decideListPublication: concorrência e corridas", () => {
  it("duas decisões ao mesmo tempo: um veredito, publisher chamado uma vez", async () => {
    const k = kit();
    const [a, b] = await Promise.all([decideListPublication(SUBMISSION, k.deps), decideListPublication(SUBMISSION, k.deps)]);
    expect([a.status, b.status].sort()).toEqual(["already_decided", "auto_published"]);
    expect(k.publisher.calls).toHaveLength(1);
    expect(k.store.rows.filter((x) => x.decision === "auto_publish")).toHaveLength(1);
    expect(k.store.rows.filter((x) => x.decision === "published")).toHaveLength(1);
  });

  it("decisão concorrente com o varredor de retomada: só um chama a porta (lease)", async () => {
    const k = kit();
    let release!: (r: PublishResult) => void;
    const slow: ListPublisher = { publish: () => new Promise<PublishResult>((res) => { release = res; }) };
    k.deps.publisher = slow;
    const first = decideListPublication(SUBMISSION, k.deps);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    const spy = vi.fn(async (r: PublishRequest) => k.publisher.publish(r));
    k.deps.publisher = { publish: spy };
    expect(await resumePublication(SUBMISSION, k.deps)).toEqual({ status: "publish_pending" });
    expect(spy).not.toHaveBeenCalled();
    release({ listId: "l", previousVersionId: null, newVersionId: "70000000-0000-4000-8000-000000000001" });
    expect((await first).status).toBe("auto_published");
  });

  it("expirador (> 1 h) não falha uma publicação cuja chamada ainda está em andamento", async () => {
    const k = kit();
    let n = 0;
    let release!: (r: PublishResult) => void;
    k.deps.publisher = {
      publish: (req) => {
        n += 1;
        if (n === 1) throw transient("port_down");
        return new Promise<PublishResult>((res) => { release = res; void req; });
      },
    };
    await decideListPublication(SUBMISSION, k.deps); // 1ª tentativa falha; fica approved
    k.clock.advance(3_599_000); // quase 1 h
    const inFlight = resumePublication(SUBMISSION, k.deps); // retoma; chamada da porta em andamento (lease ativa)
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    k.clock.advance(2_000); // passou de 1 h com a chamada ainda em andamento
    const sweeper = await resumePublication(SUBMISSION, k.deps);
    expect(sweeper).toEqual({ status: "publish_pending" });
    expect(k.store.status).toBe("approved");
    expect(k.store.rows.map((x) => x.decision)).toEqual(["auto_publish"]);
    release({ listId: "l", previousVersionId: null, newVersionId: "70000000-0000-4000-8000-000000000002" });
    expect((await inFlight).status).toBe("auto_published");
    expect(k.store.status).toBe("published");
  });

  it("complete depois de publish_failed: registro publish_orphaned e alerta (não é silêncio)", async () => {
    const k = kit();
    const real = k.publisher;
    k.deps.publisher = {
      publish: async (req) => {
        const out = await real.publish(req);
        await k.store.fail(SUBMISSION, "publish_expired"); // o expirador venceu a corrida
        return out;
      },
    };
    const r = await decideListPublication(SUBMISSION, k.deps);
    expect(r.status).toBe("publish_orphaned");
    if (r.status === "publish_orphaned") expect(r.newVersionId).toBe(k.store.rows.at(-1)!.newVersionId);
    expect(k.alerts).toEqual([{ code: "published_after_failure", submissionId: SUBMISSION }]);
    expect(k.store.status).toBe("human_review");
    expect(k.store.rows.map((x) => x.decision)).toEqual(["auto_publish", "publish_failed", "publish_orphaned"]);
  });

  it("alerta que lança não derruba a decisão", async () => {
    const k = kit();
    const real = k.publisher;
    k.deps.onAlert = () => { throw new Error("log fora do ar"); };
    k.deps.publisher = { publish: async (req) => { const o = await real.publish(req); await k.store.fail(SUBMISSION, "publish_expired"); return o; } };
    expect((await decideListPublication(SUBMISSION, k.deps)).status).toBe("publish_orphaned");
  });
});
