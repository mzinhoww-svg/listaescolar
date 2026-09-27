import type { WebhookDispatchRepo, WebhookSender } from "./ports";

// Um ciclo de despacho de webhooks (S25): reivindica entregas vencidas (lease no banco), entrega pelo `Sender` e
// marca o resultado. Retry exponencial com teto e dead letter em 24h/10 tentativas são do banco
// (`b2b_webhook_mark_delivery`). Mesmo desenho de `features/notifications/dispatcher.ts`.

export type DispatchSummary = { claimed: number; sent: number; failed: number };

export const DEFAULT_BUDGET_MS = 25_000;
const clamp = (n: number): number => Math.min(50, Math.max(1, Math.trunc(n) || 1));

export async function runWebhookDispatch(o: { repo: WebhookDispatchRepo; sender: WebhookSender; limit: number; budgetMs?: number; now?: () => number }): Promise<DispatchSummary> {
  const now = o.now ?? Date.now;
  const started = now();
  const budget = o.budgetMs ?? DEFAULT_BUDGET_MS;
  const items = await o.repo.claim(clamp(o.limit));
  const summary: DispatchSummary = { claimed: items.length, sent: 0, failed: 0 };
  for (const d of items) {
    if (now() - started >= budget) break; // o que sobrou volta pela lease vencida (60 s)
    const t0 = now();
    let outcome: Awaited<ReturnType<WebhookSender["send"]>>;
    try {
      outcome = await o.sender.send(d);
    } catch {
      outcome = { mark: "transient", httpStatus: null, errorCode: "sender_error" };
    }
    const durationMs = Math.max(0, Math.trunc(now() - t0));
    try {
      await o.repo.mark(d.id, d.leaseId, outcome.mark, outcome.httpStatus, outcome.errorCode, durationMs);
      if (outcome.mark === "sent") summary.sent += 1;
      else summary.failed += 1;
    } catch {
      // a lease vence e a entrega volta à fila: nada mais a fazer aqui
    }
  }
  return summary;
}
