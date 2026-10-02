import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InMemoryLeadListContextReader } from "@/features/leads/memory-context-reader";
import type { LeadCartReader, LeadNotifier, LeadStore } from "@/features/leads/ports";
import { LeadService } from "@/features/leads/service";
import type { ExtractionPipeline, JobQueue, SubmissionStore } from "@/features/submissions/ports";
import { submitList, type SubmitInput } from "@/features/submissions/service";
import type { SessionActor } from "@/features/stationeries/actor";
import { capture, createEmitter, type Emit } from "../../supabase/functions/_shared/analytics/capture";
import { buildEvent } from "../../supabase/functions/_shared/analytics/sanitize";
import { isEventName, type EventName } from "../../supabase/functions/_shared/analytics/schema";
import { decideListPublication } from "../../supabase/functions/_shared/publication/decide";
import { processMessage } from "../../supabase/functions/_shared/worker-core";
import { extractionResultSchema } from "../../supabase/functions/_shared/extraction-schema";
import { FakeClock } from "../helpers/fake-clock";
import { pdf } from "../helpers/files";
import { SUBMISSION, kit } from "../publication/helpers";

type Seen = { name: EventName; props: Record<string, unknown> };
const recorder = () => {
  const seen: Seen[] = [];
  const emit: Emit = (name, props) => void seen.push({ name, props });
  return { seen, emit };
};
const thrower: Emit = () => {
  throw new Error("posthog fora");
};
const COMMON = { is_internal: true, app_env: "local" };
const passesSchema = (s: Seen) => expect(buildEvent(s.name, s.props, COMMON), s.name).toMatchObject({ ok: true });

describe("publicação: list_auto_approved e list_published", () => {
  it("emite os dois eventos, ambos válidos no esquema", async () => {
    const { seen, emit } = recorder();
    const k = kit({ emit });
    const r = await decideListPublication(SUBMISSION, k.deps);
    expect(r.status).toBe("auto_published");
    expect(seen.map((s) => s.name)).toEqual(["list_auto_approved", "list_published"]);
    expect(seen[1]!.props).toMatchObject({ origin: "auto", is_first_version: true });
    seen.forEach(passesSchema);
  });

  it("falha da medição não altera o resultado nem a gravação", async () => {
    const k = kit({ emit: thrower });
    const r = await decideListPublication(SUBMISSION, k.deps);
    expect(r.status).toBe("auto_published");
    expect(k.store.status).toBe("published");
  });
});

describe("worker: ocr_completed (async)", () => {
  const deps = (emit?: Emit) => {
    const done: unknown[] = [];
    return {
      done,
      d: {
        jobs: {
          get: async () => ({ id: "j", status: "running", attempts: 1, maxAttempts: 3, submissionId: "sub-1", runAfter: new Date(0).toISOString() }),
          claim: async () => "claimed" as const,
          complete: async (...a: unknown[]) => void done.push(a),
          fail: async () => "retrying",
          requeueStale: async () => undefined,
        },
        pipeline: { extract: async () => ({ items: [{ name: "Caderno", quantity: 2, unit: "un", confidence: 0.9 }], overallConfidence: 0.9, warnings: [], lowConfidence: true }) },
        resultSchema: extractionResultSchema,
        loadInput: async () => ({ bytes: pdf(), mime: "application/pdf", fileName: "l.pdf" }),
        clock: new FakeClock(),
        ...(emit ? { emit } : {}),
      },
    };
  };

  it("emite depois de completar, com fila async e status low_confidence", async () => {
    const { seen, emit } = recorder();
    const { d, done } = deps(emit);
    expect(await processMessage("j", d)).toMatchObject({ outcome: "done", ack: true });
    expect(done).toHaveLength(1);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ name: "ocr_completed", props: { fila: "async", status: "low_confidence", items_count: 1, attempts: 1 } });
    seen.forEach(passesSchema);
  });

  it("falha da medição não muda o desfecho do job", async () => {
    const { d } = deps(thrower);
    expect(await processMessage("j", d)).toMatchObject({ outcome: "done", ack: true });
  });
});

describe("envio: ocr_completed (inline)", () => {
  const RESULT = { items: [{ name: "Caderno", quantity: 2, unit: "un", confidence: 0.9 }], overallConfidence: 0.9, warnings: [] };
  const store = (): SubmissionStore => ({ createSubmission: vi.fn(async () => ({ submissionId: "sub-1" })), reject: vi.fn(async () => undefined), recordSyncResult: vi.fn(async () => undefined) });
  const queue: JobQueue = { enqueue: vi.fn(async () => ({ jobId: "job-1" })) };
  const input = (): SubmitInput => ({
    profileId: "00000000-0000-4000-8000-000000000001",
    source: "school",
    schoolId: "50000000-0000-4000-8000-000000000001",
    grade: "4º ano",
    schoolYear: 2027,
    consent: true,
    file: { name: "lista.pdf", declaredMime: "application/pdf", size: pdf().length, bytes: pdf() },
  });
  const ok: ExtractionPipeline = { extract: async () => RESULT };
  const bad: ExtractionPipeline = { extract: async () => { throw new Error("saida ruim"); } };

  it("sucesso e falha de conteúdo emitem com fila inline", async () => {
    const a = recorder();
    await submitList(input(), { pipeline: ok, store: store(), queue, clock: new FakeClock(), emit: a.emit });
    expect(a.seen[0]).toMatchObject({ name: "ocr_completed", props: { fila: "inline", status: "accepted", items_count: 1 } });
    const b = recorder();
    const r = await submitList(input(), { pipeline: bad, store: store(), queue, clock: new FakeClock(), emit: b.emit });
    expect(r.status).toBe("failed");
    expect(b.seen[0]).toMatchObject({ props: { fila: "inline", status: "failed", items_count: 0 } });
    [...a.seen, ...b.seen].forEach(passesSchema);
  });

  it("falha da medição não altera o resultado do envio", async () => {
    const r = await submitList(input(), { pipeline: ok, store: store(), queue, clock: new FakeClock(), emit: thrower });
    expect(r.status).toBe("review_needed");
  });
});

describe("lead: lead_received e purchase_clicked", () => {
  const REQ = "22222222-2222-4222-8222-222222222222";
  const CART = "55555555-5555-4555-8555-555555555555";
  const LIST = "66666666-6666-4666-8666-666666666666";
  const STAT = "44444444-4444-4444-8444-444444444444";
  const KEY = "77777777-7777-4777-8777-777777777777";
  const store = {
    createLead: vi.fn(async () => ({ leadId: "88888888-8888-4888-8888-888888888888", code: "LC-5TJ1", created: true })),
    getStationeryPublic: vi.fn(async () => ({ id: STAT, name: "Papelaria Teste", municipalityId: "11111111-1111-4111-8111-111111111111", whatsapp: "+5565999990000", isDemo: false })),
  };
  const carts = { getOwnedCart: vi.fn(async () => ({ id: CART, ownerId: REQ, listId: LIST, isDemo: false, items: Array.from({ length: 8 }, (_, i) => ({ name: `Item ${i}`, itemKey: `item ${i}`, quantity: 1 })) })) };
  const ctx = { schoolName: "Escola Demonstração", gradeLabel: "5º ano", schoolYear: 2027, items: [{ name: "Caderno", quantity: 1 }], isDemo: false };
  const build = (analytics: NonNullable<ConstructorParameters<typeof LeadService>[0]["analytics"]>) =>
    new LeadService({
      store: store as unknown as LeadStore,
      carts: carts as unknown as LeadCartReader,
      contexts: new InMemoryLeadListContextReader(new Map([[LIST, ctx]])),
      notifier: { notifyNewLead: async () => undefined } as unknown as LeadNotifier,
      now: () => new Date("2026-09-25T12:00:00Z"),
      siteOrigin: () => "https://listacerta.example",
      analytics,
    });
  const actor = { userId: REQ, role: "parent" } as unknown as SessionActor;
  const raw = { cartId: CART, stationeryId: STAT, consent: true, idempotencyKey: KEY };

  it("emite com faixa de itens e origem da cobrança; nada do pedido nem da pessoa", async () => {
    const { seen, emit } = recorder();
    await build({ emit, billingSource: async () => "free_lead" }).createLead(actor, raw);
    expect(seen.map((s) => s.name)).toEqual(["lead_received", "purchase_clicked"]);
    expect(seen[0]!.props).toEqual({ items_count_bucket: "6-15", billing_source: "free_lead" });
    expect(JSON.stringify(seen)).not.toMatch(/LC-5TJ1|Papelaria|Escola|Item/);
    seen.forEach(passesSchema);
  });

  it("origem da cobrança indisponível ou medição fora do ar não derrubam o pedido", async () => {
    const a = recorder();
    const r1 = await build({ emit: a.emit, billingSource: async () => { throw new Error("db"); } }).createLead(actor, raw);
    expect(r1.created).toBe(true);
    expect(a.seen[0]!.props).toEqual({ items_count_bucket: "6-15" });
    const r2 = await build({ emit: thrower, billingSource: async () => null }).createLead(actor, raw);
    expect(r2.created).toBe(true);
  });
});

describe("envio ao PostHog pelo servidor", () => {
  let close: (() => Promise<void>) | null = null;
  afterEach(async () => {
    await close?.();
    close = null;
  });

  async function receiver() {
    const got: { url: string; body: Record<string, unknown>; headers: IncomingMessage["headers"] }[] = [];
    const srv = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        got.push({ url: req.url ?? "", body: JSON.parse(raw), headers: req.headers });
        res.end("{}");
      });
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    close = () => new Promise((r) => srv.close(() => r()));
    return { got, host: `http://127.0.0.1:${(srv.address() as AddressInfo).port}` };
  }

  it("um receptor real recebe o evento sem cookie, sem person profile e sem chave fora do esquema", async () => {
    const { got, host } = await receiver();
    const ok = await capture({ key: "phc_fake", host, appEnv: "staging" }, "lead_received", { items_count_bucket: "1-5", email: "a@b.com", nome: "Ana" });
    expect(ok).toBe(true);
    expect(got).toHaveLength(1);
    expect(got[0]!.url).toBe("/i/v0/e");
    expect(got[0]!.headers.cookie).toBeUndefined();
    const b = got[0]!.body as { api_key: string; event: string; properties: Record<string, unknown> };
    expect(b).toMatchObject({ api_key: "phc_fake", event: "lead_received" });
    expect(b.properties).toMatchObject({ items_count_bucket: "1-5", app_env: "staging", is_internal: true, $process_person_profile: false });
    expect(JSON.stringify(b)).not.toMatch(/a@b\.com|Ana/);
  });

  it("evento com PII ou fora do esquema nem chega a sair", async () => {
    const { got, host } = await receiver();
    expect(await capture({ key: "k", host, appEnv: "local" }, "landing_viewed", { path: "/", utm_source: "mae@x.com" })).toBe(false);
    expect(await capture({ key: "k", host, appEnv: "local" }, "nao_existe" as EventName, {})).toBe(false);
    expect(got).toHaveLength(0);
  });

  it("host indisponível: nunca lança (a ação continua)", async () => {
    await expect(capture({ key: "k", host: "http://127.0.0.1:1", appEnv: "local" }, "login_started", { method: "google" })).resolves.toBe(false);
  });

  it("createEmitter: sem configuração não faz nada; com configuração o flush espera o envio", async () => {
    const off = createEmitter(null);
    off.emit("login_started", { method: "google" });
    await off.flush();
    const { got, host } = await receiver();
    const on = createEmitter({ key: "k", host, appEnv: "local" });
    on.emit("login_started", { method: "google" });
    await on.flush();
    expect(got).toHaveLength(1);
  });

  it("captureServer: sem chave nada sai; com host fora do ar não lança", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    const off = await import("@/lib/analytics/server");
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(() => off.captureServer("login_started", { method: "google" })).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_x");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "http://127.0.0.1:1");
    vi.unstubAllGlobals();
    const on = await import("@/lib/analytics/server");
    expect(() => on.captureServer("login_started", { method: "google" })).not.toThrow();
    vi.unstubAllEnvs();
  });

  it("isEventName rejeita chaves do protótipo", () => {
    expect(isEventName("constructor")).toBe(false);
    expect(isEventName("login_started")).toBe(true);
  });
});
