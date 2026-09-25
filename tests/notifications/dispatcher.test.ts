import { describe, expect, it, vi } from "vitest";
import { runDispatch } from "@/features/notifications/dispatcher";
import { MemoryNotifier, type DeliveryOutcome, type DeliveryPayload, type NotificationRepo } from "@/features/notifications/ports";

const d = (id: string, channel: "web_push" | "email" = "web_push"): DeliveryPayload => ({ id, channel, eventType: "lead_received", linkPath: "/papelaria/leads/LC-5TJ1", attempts: 1, isDemo: false, subscriptions: [], email: null });
function repo(items: DeliveryPayload[]) {
  const marks: unknown[][] = [];
  const r: NotificationRepo = {
    claim: vi.fn(async () => items),
    mark: vi.fn(async (...a: unknown[]) => void marks.push(a)),
  } as never;
  return { r, marks };
}

describe("runDispatch", () => {
  it("cada resultado do notificador vira a marcação certa (sent, transient, permanent, skipped) e revoga assinaturas", async () => {
    const { r, marks } = repo([d("1"), d("2"), d("3"), d("4")]);
    const outs: DeliveryOutcome[] = [{ kind: "sent" }, { kind: "failed", transient: true, code: "push_5xx" }, { kind: "failed", transient: false, code: "push_4xx" }, { kind: "skipped", code: "vapid_unconfigured", revokeSubscriptionIds: ["s9"] }];
    const push = new MemoryNotifier("web_push", async (x) => outs[Number(x.id) - 1]!);
    const s = await runDispatch({ repo: r, notifiers: [push], limit: 10 });
    expect(marks).toEqual([["1", "sent", null, []], ["2", "transient", "push_5xx", []], ["3", "permanent", "push_4xx", []], ["4", "skipped", "vapid_unconfigured", ["s9"]]]);
    expect(s).toEqual({ claimed: 4, sent: 1, failed: 2, skipped: 1 });
    expect(r.claim).toHaveBeenCalledWith(10);
  });
  it("canal sem notificador: permanent/channel_unavailable; notificador que lança: transient/notifier_error (nunca derruba o lote)", async () => {
    const { r, marks } = repo([d("1", "email"), d("2")]);
    const boom = new MemoryNotifier("web_push", async () => { throw new Error("x"); });
    await runDispatch({ repo: r, notifiers: [boom], limit: 5 });
    expect(marks).toEqual([["1", "permanent", "channel_unavailable", []], ["2", "transient", "notifier_error", []]]);
  });
  it("falha ao marcar uma entrega não impede as demais", async () => {
    const { r, marks } = repo([d("1"), d("2")]);
    (r.mark as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("db")).mockImplementation(async (...a: unknown[]) => void marks.push(a));
    const s = await runDispatch({ repo: r, notifiers: [new MemoryNotifier("web_push", async () => ({ kind: "sent" }))], limit: 5 });
    expect(marks).toHaveLength(1);
    expect(s.claimed).toBe(2);
  });
  it("limite é respeitado e validado (1..50)", async () => {
    const { r } = repo([]);
    await runDispatch({ repo: r, notifiers: [], limit: 999 });
    expect(r.claim).toHaveBeenCalledWith(50);
  });
});
