import { describe, expect, it, vi } from "vitest";
import { runWebhookDispatch } from "@/features/webhooks/dispatch/dispatcher";
import type { ClaimedDelivery, WebhookDispatchRepo, WebhookSender } from "@/features/webhooks/dispatch/ports";

const d = (id: string): ClaimedDelivery => ({
  id, leaseId: `L${id}`, attempts: 1, eventType: "list.published", eventId: `e${id}`,
  payload: { school: { inep: "51999901" } }, createdAt: new Date().toISOString(),
  url: "https://parceiro.example.com/hook", secret: { ciphertext: "aa", iv: "bb", tag: "cc", keyVersion: 1 },
});

function repo(items: ClaimedDelivery[]) {
  const marks: unknown[][] = [];
  const r: WebhookDispatchRepo = { claim: vi.fn(async () => items), mark: vi.fn(async (...a: unknown[]) => void marks.push(a)) };
  return { r, marks };
}

describe("runWebhookDispatch", () => {
  it("marca sent/transient/permanent conforme o sender e conta o resumo", async () => {
    const { r, marks } = repo([d("1"), d("2"), d("3")]);
    const outcomes = [
      { mark: "sent" as const, httpStatus: 200, errorCode: null },
      { mark: "transient" as const, httpStatus: 503, errorCode: "upstream_5xx" },
      { mark: "permanent" as const, httpStatus: 400, errorCode: "upstream_4xx" },
    ];
    let i = 0;
    const sender: WebhookSender = { send: vi.fn(async () => outcomes[i++]!) };
    const s = await runWebhookDispatch({ repo: r, sender, limit: 10 });
    expect(marks.map((m) => [m[0], m[2], m[4]])).toEqual([["1", "sent", null], ["2", "transient", "upstream_5xx"], ["3", "permanent", "upstream_4xx"]]);
    expect(s).toEqual({ claimed: 3, sent: 1, failed: 2 });
    expect(r.claim).toHaveBeenCalledWith(10);
  });

  it("sender que lança nunca derruba o lote: vira transient/sender_error", async () => {
    const { r, marks } = repo([d("1"), d("2")]);
    const sender: WebhookSender = { send: vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ mark: "sent", httpStatus: 200, errorCode: null }) };
    await runWebhookDispatch({ repo: r, sender, limit: 5 });
    expect(marks[0]).toEqual(["1", "L1", "transient", null, "sender_error", expect.any(Number)]);
    expect(marks[1]![2]).toBe("sent");
  });

  it("falha ao marcar uma entrega não impede as demais", async () => {
    const { r, marks } = repo([d("1"), d("2")]);
    (r.mark as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("db")).mockImplementation(async (...a: unknown[]) => void marks.push(a));
    const sender: WebhookSender = { send: vi.fn(async () => ({ mark: "sent" as const, httpStatus: 200, errorCode: null })) };
    const s = await runWebhookDispatch({ repo: r, sender, limit: 5 });
    expect(marks).toHaveLength(1);
    expect(s.claimed).toBe(2);
  });

  it("limite é validado (1..50)", async () => {
    const { r } = repo([]);
    await runWebhookDispatch({ repo: r, sender: { send: vi.fn() }, limit: 999 });
    expect(r.claim).toHaveBeenCalledWith(50);
  });

  it("orçamento total do ciclo: estourou, para de entregar", async () => {
    const { r, marks } = repo([d("1"), d("2"), d("3")]);
    let t = 0;
    const sender: WebhookSender = { send: vi.fn(async () => { t += 10_000; return { mark: "sent" as const, httpStatus: 200, errorCode: null }; }) };
    const s = await runWebhookDispatch({ repo: r, sender, limit: 10, budgetMs: 15_000, now: () => t });
    expect(marks.map((m) => m[0])).toEqual(["1", "2"]);
    expect(s.claimed).toBe(3);
  });
});
