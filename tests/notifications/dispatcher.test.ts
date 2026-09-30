import { describe, expect, it, vi } from "vitest";
import { EVENT_CATALOG, type NotificationEvent } from "@/features/notifications/catalog";
import { pushPayload, renderNotification } from "@/features/notifications/copy";
import { runDispatch } from "@/features/notifications/dispatcher";
import { MemoryNotifier, type DeliveryOutcome, type DeliveryPayload, type NotificationRepo } from "@/features/notifications/ports";

const d = (id: string, channel: "web_push" | "email" = "web_push"): DeliveryPayload => ({ id, leaseId: `L${id}`, channel, eventType: "lead_received", linkPath: "/papelaria/leads/LC-5TJ1", attempts: 1, isDemo: false, subscriptions: [], email: null });
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
    expect(marks).toEqual([["1", "L1", "sent", null, []], ["2", "L2", "transient", "push_5xx", []], ["3", "L3", "permanent", "push_4xx", []], ["4", "L4", "skipped", "vapid_unconfigured", ["s9"]]]);
    expect(s).toEqual({ claimed: 4, sent: 1, failed: 2, skipped: 1 });
    expect(r.claim).toHaveBeenCalledWith(10);
  });
  it("canal sem notificador: permanent/channel_unavailable; notificador que lança: transient/notifier_error (nunca derruba o lote)", async () => {
    const { r, marks } = repo([d("1", "email"), d("2")]);
    const boom = new MemoryNotifier("web_push", async () => { throw new Error("x"); });
    await runDispatch({ repo: r, notifiers: [boom], limit: 5 });
    expect(marks).toEqual([["1", "L1", "permanent", "channel_unavailable", []], ["2", "L2", "transient", "notifier_error", []]]);
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

  it("orçamento total do ciclo: estourou, para de entregar (o resto volta pela lease) e o lote é limitado", async () => {
    const { r, marks } = repo([d("1"), d("2"), d("3")]);
    let t = 0;
    const slow = new MemoryNotifier("web_push", async () => { t += 10_000; return { kind: "sent" }; });
    const s = await runDispatch({ repo: r, notifiers: [slow], limit: 10, budgetMs: 15_000, now: () => t });
    expect(marks.map((m) => m[0])).toEqual(["1", "2"]); // após 20 s de trabalho o orçamento de 15 s acabou
    expect(s.sent).toBe(2);
    expect(s.claimed).toBe(3);
  });
});

// S29 UX-109: cada decisão da equipe passa pelo despacho com título genérico e sem o motivo da decisão.
describe("decisões da equipe (UX-109)", () => {
  const cases: [NotificationEvent, string, string][] = [
    ["stationery_decided", "approved", "/papelaria"],
    ["stationery_decided", "rejected", "/papelaria"],
    ["dispute_decided", "accepted", "/papelaria/leads/LC-5TJ1"],
    ["dispute_decided", "rejected", "/papelaria/leads/LC-5TJ1"],
  ];
  it.each(cases)("%s (%s): a entrega segue o caminho normal e o push leva só título genérico e o link", async (event, status, link) => {
    const item = { ...d("1"), eventType: event, linkPath: link };
    const seen: DeliveryPayload[] = [];
    const push = new MemoryNotifier("web_push", async (x) => { seen.push(x); return { kind: "sent" }; });
    const { r, marks } = repo([item]);
    const s = await runDispatch({ repo: r, notifiers: [push], limit: 5 });
    expect(s).toEqual({ claimed: 1, sent: 1, failed: 0, skipped: 0 });
    expect(marks).toEqual([["1", "L1", "sent", null, []]]);
    expect(seen[0]?.eventType).toBe(event);
    const payload = pushPayload(event, link);
    expect(payload).toEqual({ title: EVENT_CATALOG[event].pushTitle, url: link });
    expect(JSON.stringify(payload)).not.toMatch(new RegExp(`${status}|aceit|aprovad|recus|motivo`, "i"));
    const central = renderNotification(event, { status_code: status });
    expect(central.title).toBe(EVENT_CATALOG[event].pushTitle);
  });

  it("partner_decided é só da central: título genérico, corpo por status e nunca canal externo no catálogo", () => {
    expect(EVENT_CATALOG.partner_decided.external).toBe(false);
    for (const status of ["sandbox", "active", "rejected"]) {
      const r = renderNotification("partner_decided", { status_code: status });
      expect(r.title).toBe("Atualização no cadastro de parceiro");
      expect(r.body.length).toBeGreaterThan(10);
    }
  });

  it("params com motivo em texto livre são recusados nas decisões", () => {
    expect(() => renderNotification("dispute_decided", { status_code: "accepted", reason: "nota interna" })).toThrow();
  });
});
