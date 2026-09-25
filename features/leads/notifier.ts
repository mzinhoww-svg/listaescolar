import { kickDispatch } from "@/features/notifications/kick";

import type { LeadNotifier, NewLeadNotification } from "./ports";

/** A notificação nasce por gatilho no banco (mesma transação do lead); aqui só se pede o despacho, sem esperar e sem lançar. */
export class KickLeadNotifier implements LeadNotifier {
  async notifyNewLead(event: NewLeadNotification): Promise<void> {
    void event;
    await kickDispatch();
  }
}

/** Para testes e ambientes sem despacho: ninguém é avisado. */
export class NoopLeadNotifier implements LeadNotifier {
  async notifyNewLead(event: NewLeadNotification): Promise<void> {
    void event;
  }
}
