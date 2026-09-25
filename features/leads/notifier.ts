import type { LeadNotifier, NewLeadNotification } from "./ports";

/** Nesta fatia ninguém é notificado (Web Push e central são da S11). */
export class NoopLeadNotifier implements LeadNotifier {
  async notifyNewLead(event: NewLeadNotification): Promise<void> {
    void event;
  }
}
