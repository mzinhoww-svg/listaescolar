import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ actor: null as unknown }));
const svc = vi.hoisted(() => ({ save: vi.fn(), approveAndPublish: vi.fn(), publish: vi.fn(), reject: vi.fn() }));
const revalidatePath = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() => vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`); }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/features/auth/actor", () => ({ getSessionActor: async () => session.actor }));
vi.mock("@/features/review/deps", () => ({ buildReviewService: () => svc }));

import { approveAndPublishAction, publishAction, rejectAction, saveReviewAction } from "@/app/admin/revisao/actions";
import { IDLE } from "@/app/admin/revisao/state";
import { ReviewError } from "@/features/review/errors";

const ID = "3f2b8c1e-5d4a-4b6f-9c3d-1a2b3c4d5e6f";
const ADMIN = { userId: "aaaaaaaa-5d4a-4b6f-9c3d-1a2b3c4d5e6f", role: "admin" };
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const item = { name: "Caderno", quantity: 2, unit: null, category: "papelaria", confidence: 0.9, alerts: [], origin: "extracted" };
const payload = (over: Record<string, unknown> = {}) => JSON.stringify({ grade: "4º ano", schoolYear: 2027, items: [item], expectedVersion: 1, ...over });

beforeEach(() => {
  session.actor = ADMIN;
  for (const f of Object.values(svc)) f.mockReset();
  revalidatePath.mockClear();
  redirect.mockClear();
});

const all = [
  ["saveReviewAction", saveReviewAction, { submissionId: ID, payload: payload() }],
  ["approveAndPublishAction", approveAndPublishAction, { submissionId: ID, expectedVersion: "1" }],
  ["publishAction", publishAction, { submissionId: ID }],
  ["rejectAction", rejectAction, { submissionId: ID, expectedVersion: "1", reason: "illegible_document" }],
] as const;

describe("papel e sessão", () => {
  it.each(all)("%s: sem sessão vai ao login; papel diferente de admin recebe erro fixo sem chamar o serviço", async (_n, action, data) => {
    session.actor = null;
    await expect(action(IDLE, form(data))).rejects.toThrow("REDIRECT:/entrar");
    for (const role of ["parent", "school_member"]) {
      session.actor = { userId: ADMIN.userId, role };
      expect(await action(IDLE, form(data))).toEqual({ kind: "error", message: "Esta ação é só para administradores." });
    }
    for (const f of Object.values(svc)) expect(f).not.toHaveBeenCalled();
  });
  it("id do envio inválido: erro fixo sem chamar o serviço", async () => {
    expect((await publishAction(IDLE, form({ submissionId: "x" }))).kind).toBe("error");
    expect(svc.publish).not.toHaveBeenCalled();
  });
});

describe("saveReviewAction", () => {
  it("usa o ator da sessão e ignora actorId do formulário", async () => {
    svc.save.mockResolvedValue({ status: "saved", version: 2, versionId: ID });
    const r = await saveReviewAction(IDLE, form({ submissionId: ID, payload: payload(), actorId: "99999999-5d4a-4b6f-9c3d-1a2b3c4d5e6f" }));
    expect(r).toEqual({ kind: "saved", message: "Edição salva (versão 2)." });
    expect(svc.save).toHaveBeenCalledTimes(1);
    expect(svc.save.mock.calls[0]![0]).toBe(ADMIN);
    expect(JSON.stringify(svc.save.mock.calls[0]![2])).not.toContain("actorId");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/revisao");
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/revisao/${ID}`);
  });
  it("Zod recusa JSON inválido, quantidade 0, série fora da lista e campo extra", async () => {
    for (const p of ["{", payload({ items: [{ ...item, quantity: 0 }] }), payload({ grade: "10º ano" }), payload({ actorId: ID }), payload({ items: [{ ...item, name: "" }] })]) {
      expect((await saveReviewAction(IDLE, form({ submissionId: ID, payload: p }))).kind).toBe("error");
    }
    expect(svc.save).not.toHaveBeenCalled();
  });
  it("stale vira mensagem clara e not_reviewable também", async () => {
    svc.save.mockResolvedValueOnce({ status: "stale", version: 3, versionId: ID }).mockResolvedValueOnce({ status: "not_reviewable" });
    const a = await saveReviewAction(IDLE, form({ submissionId: ID, payload: payload() }));
    expect(a.kind).toBe("stale");
    expect(a.message).toMatch(/alterada por outra pessoa/);
    expect((await saveReviewAction(IDLE, form({ submissionId: ID, payload: payload() }))).message).toBe("Este envio não está mais em revisão.");
  });
  it("erro do serviço vira texto fixo (nunca o do Postgres)", async () => {
    svc.save.mockRejectedValue(new Error('relation "review_versions" segredo'));
    const r = await saveReviewAction(IDLE, form({ submissionId: ID, payload: payload() }));
    expect(r.message).toBe("Não foi possível concluir. Tente de novo.");
    svc.save.mockRejectedValue(new ReviewError("forbidden"));
    expect((await saveReviewAction(IDLE, form({ submissionId: ID, payload: payload() }))).message).toBe("Esta ação é só para administradores.");
  });
});

describe("approveAndPublishAction", () => {
  const run = (extra: Record<string, string> = {}) => approveAndPublishAction(IDLE, form({ submissionId: ID, expectedVersion: "2", ...extra }));
  const approved = { status: "approved" } as const;
  it("passa versão e confirmação ao serviço (ator da sessão) e reporta cada resultado", async () => {
    svc.approveAndPublish.mockResolvedValue({ approval: approved, publication: { status: "published", listId: null, previousVersionId: null, newVersionId: null } });
    expect(await run({ acknowledged: "on", actorId: "x" })).toEqual({ kind: "published", message: "Lista publicada." });
    expect(svc.approveAndPublish).toHaveBeenCalledWith(ADMIN, ID, { expectedVersion: 2, acknowledged: true });
    svc.approveAndPublish.mockResolvedValue({ approval: approved, publication: { status: "publish_pending" } });
    expect((await run()).kind).toBe("pending");
    expect((await run()).message).toMatch(/Tentar publicar de novo/);
    svc.approveAndPublish.mockResolvedValue({ approval: approved, publication: { status: "publish_unavailable" } });
    expect(await run()).toMatchObject({ kind: "unavailable", message: expect.stringMatching(/indisponível neste ambiente/) });
    svc.approveAndPublish.mockResolvedValue({ approval: approved, publication: { status: "publish_failed", code: "publish_rejected" } });
    expect(await run()).toMatchObject({ kind: "failed", message: expect.stringMatching(/voltou à fila.*recusada/) });
    svc.approveAndPublish.mockResolvedValue({ approval: approved, publication: { status: "orphaned" } });
    expect((await run()).message).toMatch(/não reconciliada/);
  });
  it("bloqueio, stale e não revisável não publicam e são traduzidos", async () => {
    svc.approveAndPublish.mockResolvedValue({ approval: { status: "blocked", codes: ["critical_alerts_unconfirmed"] }, publication: null });
    expect(await run()).toMatchObject({ kind: "blocked", message: expect.stringContaining("Confirme que conferiu o documento original.") });
    svc.approveAndPublish.mockResolvedValue({ approval: { status: "stale" }, publication: null });
    expect((await run()).kind).toBe("stale");
    svc.approveAndPublish.mockResolvedValue({ approval: { status: "not_reviewable" }, publication: null });
    expect((await run()).message).toBe("Este envio não está mais em revisão.");
  });
  it("sem confirmação marcada, acknowledged é false", async () => {
    svc.approveAndPublish.mockResolvedValue({ approval: approved, publication: null });
    expect((await run()).kind).toBe("approved");
    expect(svc.approveAndPublish.mock.calls[0]![2]).toEqual({ expectedVersion: 2, acknowledged: false });
  });
});

describe("stale e not_reviewable não revalidam a rota (o rascunho do admin não se perde)", () => {
  it("save, approve, reject e publish", async () => {
    svc.save.mockResolvedValue({ status: "stale", version: 3, versionId: ID });
    expect((await saveReviewAction(IDLE, form({ submissionId: ID, payload: payload() }))).kind).toBe("stale");
    svc.approveAndPublish.mockResolvedValue({ approval: { status: "stale" }, publication: null });
    expect((await approveAndPublishAction(IDLE, form({ submissionId: ID, expectedVersion: "1" }))).kind).toBe("stale");
    svc.reject.mockResolvedValue({ status: "stale" });
    expect((await rejectAction(IDLE, form({ submissionId: ID, expectedVersion: "1", reason: "other" }))).kind).toBe("stale");
    svc.publish.mockResolvedValue({ status: "not_reviewable" });
    await publishAction(IDLE, form({ submissionId: ID }));
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("orphaned: aprovada com publicação bloqueada, frase clara", async () => {
    svc.approveAndPublish.mockResolvedValue({ approval: { status: "approved" }, publication: { status: "orphaned" } });
    expect((await approveAndPublishAction(IDLE, form({ submissionId: ID, expectedVersion: "1" }))).message).toMatch(/^Lista aprovada; publicação bloqueada:/);
  });
});

describe("publishAction e rejectAction", () => {
  it("publishAction chama só publicar", async () => {
    svc.publish.mockResolvedValue({ status: "publish_pending" });
    expect((await publishAction(IDLE, form({ submissionId: ID }))).kind).toBe("pending");
    expect(svc.publish).toHaveBeenCalledWith(ADMIN, ID);
    expect(svc.approveAndPublish).not.toHaveBeenCalled();
  });
  it("rejectAction exige motivo da lista fechada (sem texto livre)", async () => {
    for (const reason of ["", "porque sim", "OTHER"]) {
      expect((await rejectAction(IDLE, form({ submissionId: ID, expectedVersion: "1", reason }))).kind).toBe("error");
    }
    expect(svc.reject).not.toHaveBeenCalled();
    svc.reject.mockResolvedValue({ status: "rejected" });
    expect(await rejectAction(IDLE, form({ submissionId: ID, expectedVersion: "1", reason: "illegible_document", text: "livre" }))).toEqual({ kind: "rejected", message: "Lista recusada." });
    expect(svc.reject).toHaveBeenCalledWith(ADMIN, ID, { reason: "illegible_document", expectedVersion: 1 });
  });
  it("rejectAction: stale traduzido", async () => {
    svc.reject.mockResolvedValue({ status: "stale" });
    expect((await rejectAction(IDLE, form({ submissionId: ID, expectedVersion: "1", reason: "other" }))).kind).toBe("stale");
  });
});
