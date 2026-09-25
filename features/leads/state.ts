/** Estados do lead e matriz por ator. Espelha `public.lead_transition` (migration 0303); um teste compara com o banco. */
export const LEAD_STATUSES = [
  "received",
  "viewed",
  "in_progress",
  "quote_sent",
  "awaiting_customer",
  "converted",
  "declined",
  "expired",
  "cancelled",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const OPEN_LEAD_STATUSES = ["received", "viewed", "in_progress", "quote_sent", "awaiting_customer"] as const;
export const TERMINAL_LEAD_STATUSES = ["converted", "declined", "expired", "cancelled"] as const;

export const LEAD_ACTORS = ["stationery", "parent", "admin", "system"] as const;
export type LeadActor = (typeof LEAD_ACTORS)[number];

type Edge = readonly [LeadStatus, LeadStatus];

const STATIONERY_TARGETS = ["in_progress", "quote_sent", "awaiting_customer", "converted", "declined"] as const;

const STATIONERY_EDGES: readonly Edge[] = [
  ["received", "viewed"],
  ...OPEN_LEAD_STATUSES.flatMap((from) =>
    STATIONERY_TARGETS.filter((to) => to !== from).map((to): Edge => [from, to]),
  ),
];
const CANCEL_EDGES: readonly Edge[] = OPEN_LEAD_STATUSES.map((from): Edge => [from, "cancelled"]);
/** `system` só expira lead aberto E vencido (`expires_at <= now()`); o tempo é decidido no banco. */
const SYSTEM_EDGES: readonly Edge[] = OPEN_LEAD_STATUSES.map((from): Edge => [from, "expired"]);

export const leadTransitionTable: Readonly<Record<LeadActor, readonly Edge[]>> = {
  stationery: STATIONERY_EDGES,
  parent: CANCEL_EDGES,
  admin: CANCEL_EDGES,
  system: SYSTEM_EDGES,
};

export function canTransition(actor: LeadActor, from: LeadStatus, to: LeadStatus): boolean {
  return leadTransitionTable[actor].some(([f, t]) => f === from && t === to);
}

export function isTerminal(status: LeadStatus): boolean {
  return (TERMINAL_LEAD_STATUSES as readonly string[]).includes(status);
}

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  received: "Novo",
  viewed: "Lista aberta",
  in_progress: "Em atendimento",
  quote_sent: "Cotação enviada",
  awaiting_customer: "Aguardando o responsável",
  converted: "Vendido (declarado)",
  declined: "Não fechou",
  expired: "Expirado",
  cancelled: "Cancelado",
};

export const CLOSE_REASONS = ["price", "stock", "no_reply", "bought_elsewhere", "other"] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number];
export const CLOSE_REASON_LABEL: Record<CloseReason, string> = {
  price: "Preço",
  stock: "Sem estoque",
  no_reply: "Sem resposta",
  bought_elsewhere: "Comprou em outro lugar",
  other: "Outro motivo",
};
