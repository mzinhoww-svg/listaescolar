import type { DeliveryOutcome, MarkOutcome, NotificationRepo, Notifier } from "./ports";

export type DispatchSummary = { claimed: number; sent: number; failed: number; skipped: number };

const clamp = (n: number): number => Math.min(50, Math.max(1, Math.trunc(n) || 1));

function toMark(o: DeliveryOutcome): { mark: MarkOutcome; code: string | null } {
  if (o.kind === "sent") return { mark: "sent", code: null };
  if (o.kind === "skipped") return { mark: "skipped", code: o.code };
  return { mark: o.transient ? "transient" : "permanent", code: o.code };
}

/**
 * Um ciclo de despacho: reivindica entregas vencidas (lease no banco), entrega pelo notificador do canal e marca o resultado.
 * Retry exponencial e `dead` na 5ª tentativa são do banco (`notification_mark_delivery`). Falha de um item nunca derruba o lote.
 */
export async function runDispatch(o: { repo: NotificationRepo; notifiers: readonly Notifier[]; limit: number }): Promise<DispatchSummary> {
  const items = await o.repo.claim(clamp(o.limit));
  const summary: DispatchSummary = { claimed: items.length, sent: 0, failed: 0, skipped: 0 };
  for (const d of items) {
    let outcome: DeliveryOutcome;
    const notifier = o.notifiers.find((n) => n.channel === d.channel);
    if (!notifier) outcome = { kind: "failed", transient: false, code: "channel_unavailable" };
    else {
      try {
        outcome = await notifier.deliver(d);
      } catch {
        outcome = { kind: "failed", transient: true, code: "notifier_error" };
      }
    }
    const { mark, code } = toMark(outcome);
    try {
      await o.repo.mark(d.id, mark, code, outcome.revokeSubscriptionIds ?? []);
      if (outcome.kind === "sent") summary.sent += 1;
      else if (outcome.kind === "skipped") summary.skipped += 1;
      else summary.failed += 1;
    } catch {
      // a lease vence e a entrega volta à fila: nada mais a fazer aqui
    }
  }
  return summary;
}
