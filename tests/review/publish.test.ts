import { describe, expect, it, vi } from "vitest";
import { getSessionActor, type SessionActor } from "@/features/auth/actor";
import { createReviewService } from "@/features/review/service";
import { PortError } from "@/supabase/functions/_shared/publication/ports";
import { MemoryListPublisher } from "@/supabase/functions/_shared/publication/memory";
import { ADMIN_ID, fakeStore, item, memoryPublication, SCHOOL, SUB, V2, version } from "./support";

const auth = vi.hoisted(() => ({ user: { id: "x" } as { id: string } | null, role: "admin" as string | null }));
vi.mock("@/features/auth/queries", () => ({ getCurrentUser: async () => auth.user, getCurrentRole: async () => auth.role }));
async function admin(): Promise<SessionActor> {
  auth.user = { id: ADMIN_ID };
  auth.role = "admin";
  return (await getSessionActor())!;
}
const approvedCtx = (over: Record<string, unknown> = {}) => ({ submission: { status: "approved", source: "school" as const, schoolId: SCHOOL, submittedBy: "y", isDemo: false }, ...over });

describe("publish: caminho feliz pela ListPublisher", () => {
  it("chama a porta UMA vez com a versão aprovada: chave = id da versão, ator admin, source e itens corretos", async () => {
    const f = fakeStore({ ctx: approvedCtx() });
    const { deps, publisher } = memoryPublication();
    const svc = createReviewService({ store: f.store, publication: deps });
    const out = await svc.publish(await admin(), SUB);
    expect(out).toMatchObject({ status: "published", previousVersionId: null });
    expect(publisher!.calls).toHaveLength(1);
    expect(publisher!.calls[0]).toMatchObject({
      idempotencyKey: V2,
      submissionId: SUB,
      schoolId: SCHOOL,
      gradeSlug: "ef-4",
      schoolYear: 2027,
      source: "school_upload",
      actor: { kind: "admin", profileId: ADMIN_ID },
    });
    expect(publisher!.calls[0]!.items[0]).toEqual({ position: 1, originalName: "Caderno", normalizedName: "caderno", category: "papelaria", quantity: 2, unit: "un", confidence: 0.9, origin: "extracted" });
    expect(f.names()).toEqual(["loadContext", "beginPublish", "loadVersion", "completePublish"]);
    const done = f.calls.at(-1)!;
    expect(done.args.slice(0, 2)).toEqual([SUB, ADMIN_ID]);
  });

  it("confiança nunca é inventada: item editado/adicionado/sem número vai com null e origin reviewed; extraído mantém a sua", async () => {
    const f = fakeStore({ ctx: approvedCtx({ version: version({ items: [item({ origin: "edited", confidence: 0.2 }), item({ name: "Cola", origin: "added", confidence: null }), item({ name: "Tesoura", confidence: 0.7 })] }) }) });
    const { deps, publisher } = memoryPublication();
    await createReviewService({ store: f.store, publication: deps }).publish(await admin(), SUB);
    expect(publisher!.calls[0]!.items.map((i) => i.confidence)).toEqual([null, null, 0.7]);
    expect(publisher!.calls[0]!.items.map((i) => i.origin)).toEqual(["reviewed", "reviewed", "extracted"]);
  });

  it("envio de família publica com source parent_upload", async () => {
    const f = fakeStore({ ctx: approvedCtx({ submission: { status: "approved", source: "parent", schoolId: SCHOOL, submittedBy: "y", isDemo: false } }) });
    const { deps, publisher } = memoryPublication();
    await createReviewService({ store: f.store, publication: deps }).publish(await admin(), SUB);
    expect(publisher!.calls[0]!.source).toBe("parent_upload");
  });
});

describe("publish: estados sem chamar a porta", () => {
  it.each([
    ["porta nula", { publisher: null }, "publish_unavailable"],
    ["leitor de contexto nulo", { withContext: false }, "publish_unavailable"],
  ] as const)("%s -> publish_unavailable, sem lease e sem gravar nada", async (_n, o, status) => {
    const f = fakeStore({ ctx: approvedCtx() });
    const out = await createReviewService({ store: f.store, publication: memoryPublication(o).deps }).publish(await admin(), SUB);
    expect(out).toEqual({ status });
    expect(f.names()).toEqual(["loadContext"]);
  });

  it("envio que não está aprovado -> not_reviewable", async () => {
    const f = fakeStore();
    const { deps, publisher } = memoryPublication();
    expect(await createReviewService({ store: f.store, publication: deps }).publish(await admin(), SUB)).toEqual({ status: "not_reviewable" });
    expect(publisher!.calls).toHaveLength(0);
    expect(f.names()).toEqual(["loadContext"]);
  });

  it.each([
    ["busy", { state: "busy", approvedVersionId: V2 }, { status: "publish_pending" }],
    ["orphaned", { state: "orphaned", approvedVersionId: V2 }, { status: "orphaned" }],
    ["not_approved", { state: "not_approved", approvedVersionId: null }, { status: "not_reviewable" }],
    ["already_completed", { state: "already_completed", approvedVersionId: null }, { status: "published", listId: null, previousVersionId: null, newVersionId: null }],
  ] as const)("lease %s: não chama a porta", async (_n, begin, expected) => {
    const f = fakeStore({ ctx: approvedCtx(), begin });
    const { deps, publisher } = memoryPublication();
    expect(await createReviewService({ store: f.store, publication: deps }).publish(await admin(), SUB)).toEqual(expected);
    expect(publisher!.calls).toHaveLength(0);
  });

  it("bloqueio de contexto no momento de publicar (escola suspensa) -> falha registrada com o código e a porta não é chamada", async () => {
    const f = fakeStore({ ctx: approvedCtx({ submission: { status: "approved", source: "school", schoolId: "60000000-0000-4000-8000-0000000000ff", submittedBy: "y", isDemo: false } }) });
    const { deps, publisher } = memoryPublication();
    const out = await createReviewService({ store: f.store, publication: deps }).publish(await admin(), SUB);
    expect(out).toEqual({ status: "publish_failed", code: "school_not_found" });
    expect(f.calls.find((c) => c.name === "failPublish")!.args).toEqual([SUB, ADMIN_ID, "school_not_found"]);
    expect(publisher!.calls).toHaveLength(0);
    // a lease vem ANTES do bloqueio e é solta antes de falhar (falhar com lease ativa devolve busy)
    expect(f.names()).toEqual(["loadContext", "beginPublish", "releasePublish", "failPublish"]);
  });

  it("bloqueio de contexto sem conseguir a lease (outro admin em voo): nada é falhado", async () => {
    const f = fakeStore({ ctx: approvedCtx({ submission: { status: "approved", source: "school", schoolId: "60000000-0000-4000-8000-0000000000ff", submittedBy: "y", isDemo: false } }), begin: { state: "busy", approvedVersionId: V2 } });
    const out = await createReviewService({ store: f.store, publication: memoryPublication().deps }).publish(await admin(), SUB);
    expect(out).toEqual({ status: "publish_pending" });
    expect(f.names()).toEqual(["loadContext", "beginPublish"]);
  });

  it("failPublish devolve busy (lease retomada por outro admin): publish_pending, sem afirmar falha", async () => {
    const f = fakeStore({ ctx: approvedCtx({ submission: { status: "approved", source: "school", schoolId: "60000000-0000-4000-8000-0000000000ff", submittedBy: "y", isDemo: false } }), fail: "busy" });
    expect(await createReviewService({ store: f.store, publication: memoryPublication().deps }).publish(await admin(), SUB)).toEqual({ status: "publish_pending" });
  });
});

describe("publish: falhas da porta", () => {
  it("PortError transitório: solta a lease e devolve publish_pending (envio segue aprovado)", async () => {
    const f = fakeStore({ ctx: approvedCtx() });
    const { deps, publisher } = memoryPublication();
    publisher!.failNext(new PortError("port_down", true));
    expect(await createReviewService({ store: f.store, publication: deps }).publish(await admin(), SUB)).toEqual({ status: "publish_pending" });
    expect(f.names()).toContain("releasePublish");
    expect(f.names()).not.toContain("failPublish");
    expect(f.names()).not.toContain("completePublish");
  });

  it("erro desconhecido (sem tipo) também é transitório", async () => {
    const f = fakeStore({ ctx: approvedCtx() });
    const { deps } = memoryPublication({ publisher: { publish: async () => Promise.reject(new Error("boom")) } as unknown as MemoryListPublisher });
    expect(await createReviewService({ store: f.store, publication: deps }).publish(await admin(), SUB)).toEqual({ status: "publish_pending" });
  });

  it("PortError permanente: review_publish_fail com o código e publish_failed", async () => {
    const f = fakeStore({ ctx: approvedCtx() });
    const { deps, publisher } = memoryPublication();
    publisher!.failNext(new PortError("list_archived", false));
    expect(await createReviewService({ store: f.store, publication: deps }).publish(await admin(), SUB)).toEqual({ status: "publish_failed", code: "list_archived" });
    expect(f.calls.find((c) => c.name === "failPublish")!.args).toEqual([SUB, ADMIN_ID, "list_archived"]);
  });

  it("código de erro fora do alfabeto vira publish_rejected", async () => {
    const f = fakeStore({ ctx: approvedCtx() });
    const { deps, publisher } = memoryPublication();
    publisher!.failNext(new PortError("Erro com Texto <b>", false));
    expect(await createReviewService({ store: f.store, publication: deps }).publish(await admin(), SUB)).toEqual({ status: "publish_failed", code: "publish_rejected" });
  });

  it("resultado inválido da porta -> invalid_publish_result (permanente)", async () => {
    const f = fakeStore({ ctx: approvedCtx() });
    const { deps } = memoryPublication({ publisher: { publish: async () => ({ listId: "x", previousVersionId: null, newVersionId: "y" }) } as unknown as MemoryListPublisher });
    expect(await createReviewService({ store: f.store, publication: deps }).publish(await admin(), SUB)).toEqual({ status: "publish_failed", code: "invalid_publish_result" });
    expect(f.calls.find((c) => c.name === "failPublish")!.args[2]).toBe("invalid_publish_result");
  });

  it("teto da chamada: estouro é transitório (publish_pending) e o AbortSignal é acionado", async () => {
    const f = fakeStore({ ctx: approvedCtx() });
    let seen: AbortSignal | undefined;
    const never = { publish: (req: { signal?: AbortSignal }) => ((seen = req.signal), new Promise(() => undefined)) } as unknown as MemoryListPublisher;
    const { deps } = memoryPublication({ publisher: never, clock: { now: () => 0, delay: async () => undefined } });
    expect(await createReviewService({ store: f.store, publication: deps }).publish(await admin(), SUB)).toEqual({ status: "publish_pending" });
    expect(seen?.aborted).toBe(true);
    expect(f.names()).toContain("releasePublish");
  });

  it("resultado que chega DEPOIS do teto não se perde: é registrado (completePublish) e alertado", async () => {
    const f = fakeStore({ ctx: approvedCtx() });
    let resolveLate: (v: unknown) => void = () => undefined;
    const late = { publish: () => new Promise((r) => (resolveLate = r)) } as unknown as MemoryListPublisher;
    const { deps } = memoryPublication({ publisher: late, clock: { now: () => 0, delay: async () => undefined } });
    const alerts: string[] = [];
    const out = await createReviewService({ store: f.store, publication: deps, onAlert: (a) => alerts.push(a.code) }).publish(await admin(), SUB);
    expect(out).toEqual({ status: "publish_pending" });
    resolveLate({ listId: "70000000-0000-4000-8000-000000000001", previousVersionId: null, newVersionId: "70000000-0000-4000-8000-000000000002" });
    await new Promise((r) => setTimeout(r, 0));
    expect(f.names()).toContain("completePublish");
    expect(alerts).toContain("publish_result_late");
  });

  it("completePublish devolve orphaned/not_approved -> orphaned/not_reviewable e alerta", async () => {
    const f = fakeStore({ ctx: approvedCtx(), complete: "orphaned" });
    const { deps } = memoryPublication();
    const alerts: string[] = [];
    expect(await createReviewService({ store: f.store, publication: deps, onAlert: (a) => alerts.push(a.code) }).publish(await admin(), SUB)).toEqual({ status: "orphaned" });
    expect(alerts).toEqual(["published_after_failure"]);
  });
});

describe("approveAndPublish", () => {
  it("aprova e depois publica; cada resultado é reportado", async () => {
    const f = fakeStore();
    let approved = false;
    const store = {
      ...f.store,
      approve: async (...a: unknown[]) => ((approved = true), f.store.approve(...(a as Parameters<typeof f.store.approve>))),
      loadContext: async (id: string) => {
        const c = await f.store.loadContext(id);
        return c && approved ? { ...c, submission: { ...c.submission, status: "approved" } } : c;
      },
    };
    const { deps, publisher } = memoryPublication();
    const out = await createReviewService({ store, publication: deps }).approveAndPublish(await admin(), SUB, { expectedVersion: 2, acknowledged: false });
    expect(out).toMatchObject({ approval: { status: "approved" }, publication: { status: "published" } });
    expect(publisher!.calls).toHaveLength(1);
  });

  it("bloqueio do portão (contexto da porta) não aprova nem publica", async () => {
    const f = fakeStore({ ctx: { submission: { status: "human_review", source: "school", schoolId: "60000000-0000-4000-8000-0000000000ff", submittedBy: "y", isDemo: false } } });
    const { deps, publisher } = memoryPublication();
    const out = await createReviewService({ store: f.store, publication: deps }).approveAndPublish(await admin(), SUB, { expectedVersion: 2, acknowledged: false });
    expect(out).toEqual({ approval: { status: "blocked", codes: ["school_not_found"] }, publication: null });
    expect(f.names()).not.toContain("approve");
    expect(publisher!.calls).toHaveLength(0);
  });

  it("sem portas: aprova e informa publish_unavailable (envio fica aprovado; a S11 publica o acumulado)", async () => {
    const f = fakeStore();
    const store = { ...f.store, loadContext: async (id: string) => { const c = await f.store.loadContext(id); return c && f.calls.some((x) => x.name === "approve") ? { ...c, submission: { ...c.submission, status: "approved" } } : c; } };
    const { deps } = memoryPublication({ publisher: null, withContext: false });
    const out = await createReviewService({ store, publication: deps }).approveAndPublish(await admin(), SUB, { expectedVersion: 2, acknowledged: false });
    expect(out).toEqual({ approval: { status: "approved" }, publication: { status: "publish_unavailable" } });
  });
});
