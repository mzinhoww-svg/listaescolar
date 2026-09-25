import type { NotificationEvent } from "./catalog";

/** Notificação como a central a mostra (dono lê pela RLS). `params` chega bruto: a tela o valida (lista fechada) antes de usar. */
export type NotificationRow = {
  id: string;
  eventType: NotificationEvent;
  params: unknown;
  linkPath: string;
  isDemo: boolean;
  readAt: string | null;
  createdAt: string;
};

export type WatchRow = { id: string; inep: string; schoolName: string; gradeSlug: string; gradeLabel: string; year: number };
export type PreferenceRow = { event_type: string; channel: string; enabled: boolean };
