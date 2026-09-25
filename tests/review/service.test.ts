import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSessionActor, type SessionActor } from "@/features/auth/actor";
import { createReviewService, ReviewError } from "@/features/review/service";
import { ADMIN_ID, fakeStore, item, memoryPublication, PARENT_ID, SUB, version } from "./support";

const auth = vi.hoisted(() => ({ user: { id: "x" } as { id: string } | null, role: "admin" as string | null }));
vi.mock("@/features/auth/queries", () => ({ getCurrentUser: async () => auth.user, getCurrentRole: async () => auth.role }));

async function actorOf(role: string, id: string): Promise<SessionActor> {
  auth.user = { id };
  auth.role = role;
  return (await getSessionActor())!;
}
const payload = (over: Record<string, unknown> = {}) => ({ grade: "4º ano", schoolYear: 2027, items: [item()], expectedVersion: 2, ...over });

describe("createReviewService: autorização", () => {
  beforeEach(() => void 0);
  it("não-admin e objeto forjado: erro antes de QUALQUER chamada ao store", async () => {
    const f = fakeStore();
    const svc = createReviewService({ store: f.store, publication: memoryPublication().deps });
    const parent = await actorOf("parent", PARENT_ID);
    const forged = { userId: ADMIN_ID, role: "admin" } as unknown as SessionActor;
    for (const actor of [parent, forged]) {
      await expect(svc.open(actor, SUB)).rejects.toMatchObject({ code: "forbidden" });
      await expect(svc.save(actor, SUB, payload())).rejects.toMatchObject({ code: "forbidden" });
      await expect(svc.approve(actor, SUB, { expectedVersion: 2, acknowledged: false })).rejects.toMatchObject({ code: "forbidden" });
      await expect(svc.reject(actor, SUB, { reason: "other", expectedVersion: 2 })).rejects.toMatchObject({ code: "forbidden" });
      await expect(svc.publish(actor, SUB)).rejects.toMatchObject({ code: "forbidden" });
      await expect(svc.approveAndPublish(actor, SUB, { expectedVersion: 2, acknowledged: false })).rejects.toMatchObject({ code: "forbidden" });
      await expect(svc.blockers(actor, SUB, false)).rejects.toMatchObject({ code: "forbidden" });
    }
    expect(f.calls).toEqual([]);
  });
});

describe("createReviewService: open, save, reject", () => {
  it("open e save usam SÓ o id do ator da sessão (actorId no payload é recusado)", async () => {
    const f = fakeStore();
    const svc = createReviewService({ store: f.store, publication: memoryPublication().deps });
    const admin = await actorOf("admin", ADMIN_ID);
    await svc.open(admin, SUB);
    expect(f.calls[0]).toMatchObject({ name: "open", args: [SUB, ADMIN_ID] });
    await expect(svc.save(admin, SUB, { ...payload(), actorId: PARENT_ID })).rejects.toMatchObject({ code: "invalid_input" });
    expect(f.names()).toEqual(["open"]);
    expect(await svc.save(admin, SUB, payload())).toEqual({ status: "saved", version: 3, versionId: "x" });
    expect(f.calls.at(-1)).toMatchObject({ name: "save", args: [SUB, ADMIN_ID, 2, { grade: "4º ano", schoolYear: 2027, items: [item()] }] });
  });

  it("payload inválido (quantidade 0, série fora da lista, id que não é uuid) -> invalid_input sem chamar o store", async () => {
    const f = fakeStore();
    const svc = createReviewService({ store: f.store, publication: memoryPublication().deps });
    const admin = await actorOf("admin", ADMIN_ID);
    await expect(svc.save(admin, SUB, payload({ items: [item({ quantity: 0 })] }))).rejects.toBeInstanceOf(ReviewError);
    await expect(svc.save(admin, SUB, payload({ grade: "10º ano" }))).rejects.toMatchObject({ code: "invalid_input" });
    await expect(svc.open(admin, "nao-uuid")).rejects.toMatchObject({ code: "invalid_input" });
    expect(f.calls).toEqual([]);
  });

  it("stale e not_reviewable voltam como estado, não como erro", async () => {
    const admin = await actorOf("admin", ADMIN_ID);
    const stale = createReviewService({ store: fakeStore({ save: { state: "stale", version: 5, versionId: "y" } }).store, publication: memoryPublication().deps });
    expect(await stale.save(admin, SUB, payload())).toEqual({ status: "stale", version: 5, versionId: "y" });
    const nr = createReviewService({ store: fakeStore({ save: { state: "not_reviewable" } }).store, publication: memoryPublication().deps });
    expect(await nr.save(admin, SUB, payload())).toEqual({ status: "not_reviewable" });
  });

  it("reject: motivo só da lista fechada", async () => {
    const f = fakeStore();
    const svc = createReviewService({ store: f.store, publication: memoryPublication().deps });
    const admin = await actorOf("admin", ADMIN_ID);
    await expect(svc.reject(admin, SUB, { reason: "texto livre", expectedVersion: 2 })).rejects.toMatchObject({ code: "invalid_input" });
    expect(await svc.reject(admin, SUB, { reason: "illegible_document", expectedVersion: 2 })).toEqual({ status: "rejected" });
    expect(f.calls.at(-1)).toMatchObject({ name: "reject", args: [SUB, ADMIN_ID, 2, "illegible_document"] });
  });
});

describe("createReviewService: approve", () => {
  it("bloqueia com os códigos do portão e NÃO chama approve", async () => {
    const f = fakeStore({ ctx: { version: version({ items: [item({ quantity: null })], grade: null }) } });
    const svc = createReviewService({ store: f.store, publication: memoryPublication().deps });
    const admin = await actorOf("admin", ADMIN_ID);
    expect(await svc.approve(admin, SUB, { expectedVersion: 2, acknowledged: false })).toEqual({ status: "blocked", codes: ["item_quantity_missing", "grade_missing"] });
    expect(f.names()).not.toContain("approve");
  });

  it("versão esperada diferente da vigente -> stale sem chamar approve", async () => {
    const f = fakeStore();
    const svc = createReviewService({ store: f.store, publication: memoryPublication().deps });
    const admin = await actorOf("admin", ADMIN_ID);
    expect(await svc.approve(admin, SUB, { expectedVersion: 1, acknowledged: false })).toMatchObject({ status: "stale" });
    expect(f.names()).not.toContain("approve");
  });

  it("alerta crítico do resultado (configuração de ai_settings) exige a confirmação; confirmada grava o motivo", async () => {
    const ctx = { resultAlerts: { alerts: ["handwritten"], criticalAlerts: [], items: [] } };
    const f = fakeStore({ ctx });
    const svc = createReviewService({ store: f.store, publication: memoryPublication().deps });
    const admin = await actorOf("admin", ADMIN_ID);
    expect(await svc.approve(admin, SUB, { expectedVersion: 2, acknowledged: false })).toEqual({ status: "blocked", codes: ["critical_alerts_unconfirmed"] });
    expect(await svc.approve(admin, SUB, { expectedVersion: 2, acknowledged: true })).toEqual({ status: "approved" });
    expect(f.calls.at(-1)).toMatchObject({ name: "approve", args: [SUB, ADMIN_ID, 2, ["critical_alerts_acknowledged"]] });
  });

  it("sem alerta crítico a confirmação não é registrada; settings indisponíveis usam só o que a extração marcou", async () => {
    const f = fakeStore();
    const admin = await actorOf("admin", ADMIN_ID);
    await createReviewService({ store: f.store, publication: memoryPublication().deps }).approve(admin, SUB, { expectedVersion: 2, acknowledged: true });
    expect(f.calls.at(-1)).toMatchObject({ name: "approve", args: [SUB, ADMIN_ID, 2, []] });
    const g = fakeStore({ ctx: { resultAlerts: { alerts: ["handwritten"], criticalAlerts: ["handwritten"], items: [] } } });
    const svc = createReviewService({ store: g.store, publication: memoryPublication({ settings: null }).deps });
    expect(await svc.approve(admin, SUB, { expectedVersion: 2, acknowledged: false })).toMatchObject({ status: "blocked" });
  });

  it("envio que não está em revisão -> not_reviewable; inexistente -> not_found", async () => {
    const admin = await actorOf("admin", ADMIN_ID);
    const a = fakeStore({ ctx: { submission: { status: "approved", source: "school", schoolId: "x", submittedBy: "y", isDemo: false } } });
    expect(await createReviewService({ store: a.store, publication: memoryPublication().deps }).approve(admin, SUB, { expectedVersion: 2, acknowledged: false })).toEqual({ status: "not_reviewable" });
    const b = fakeStore({ ctx: null });
    await expect(createReviewService({ store: b.store, publication: memoryPublication().deps }).approve(admin, SUB, { expectedVersion: 2, acknowledged: false })).rejects.toMatchObject({ code: "not_found" });
  });

  it("blockers(): com portas usa o portão de publicação (contexto); sem portas só os intrínsecos", async () => {
    const admin = await actorOf("admin", ADMIN_ID);
    const f = fakeStore({ ctx: { submission: { status: "human_review", source: "school", schoolId: "60000000-0000-4000-8000-0000000000ff", submittedBy: "y", isDemo: false } } });
    const withPorts = createReviewService({ store: f.store, publication: memoryPublication().deps });
    expect(await withPorts.blockers(admin, SUB, false)).toEqual(["school_not_found"]);
    const noPorts = createReviewService({ store: f.store, publication: memoryPublication({ publisher: null, withContext: false }).deps });
    expect(await noPorts.blockers(admin, SUB, false)).toEqual([]);
  });
});
