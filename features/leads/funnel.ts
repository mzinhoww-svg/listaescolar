import { sumCents } from "@/features/cart/money";

import type { LeadStatus } from "./state";

export type FunnelTabId = "all" | "new" | "opened" | "attended" | "sold" | "closed";
export const FUNNEL_TABS: readonly { id: FunnelTabId; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "new", label: "Novos" },
  { id: "opened", label: "Lista aberta" },
  { id: "attended", label: "Atendidos" },
  { id: "sold", label: "Vendidos" },
  { id: "closed", label: "Encerrados" },
];

export function funnelTab(status: LeadStatus): Exclude<FunnelTabId, "all"> {
  switch (status) {
    case "received":
      return "new";
    case "viewed":
      return "opened";
    case "in_progress":
    case "quote_sent":
    case "awaiting_customer":
      return "attended";
    case "converted":
      return "sold";
    case "declined":
    case "expired":
    case "cancelled":
      return "closed";
  }
}

export function matchesTab(status: LeadStatus, tab: FunnelTabId): boolean {
  return tab === "all" || funnelTab(status) === tab;
}

export function parseTab(value: unknown): FunnelTabId {
  return FUNNEL_TABS.some((t) => t.id === value) ? (value as FunnelTabId) : "all";
}

export type KpiRow = {
  status: LeadStatus;
  declaredSaleCents: number | null;
  /** Data do evento `sale_declared` (nulo se o lead não foi vendido). */
  saleDeclaredAt: Date | null;
};
export type Kpis = { newCount: number; awaitingCount: number; soldThisWeek: number; declaredMonthCents: number };

const WEEK_MS = 7 * 24 * 3_600_000;
const TIME_ZONE = "America/Cuiaba";
const monthFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit" });

/** "2026-09" no fuso de Cuiabá. */
function monthKey(date: Date): string {
  const parts = monthFormatter.formatToParts(date);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}`;
}

/** KPIs só do banco: nada estimado. Mês em America/Cuiaba; vendas com data futura não contam. */
export function computeKpis(rows: readonly KpiRow[], now: Date): Kpis {
  const nowMs = now.getTime();
  const thisMonth = monthKey(now);
  let newCount = 0;
  let awaitingCount = 0;
  let soldThisWeek = 0;
  const monthAmounts: number[] = [];
  for (const r of rows) {
    if (r.status === "received") newCount += 1;
    if (r.status === "received" || r.status === "viewed") awaitingCount += 1;
    if (r.status !== "converted" || !r.saleDeclaredAt) continue;
    const t = r.saleDeclaredAt.getTime();
    if (!Number.isFinite(t) || t > nowMs) continue;
    if (nowMs - t <= WEEK_MS) soldThisWeek += 1;
    if (r.declaredSaleCents !== null && monthKey(r.saleDeclaredAt) === thisMonth) monthAmounts.push(r.declaredSaleCents);
  }
  return { newCount, awaitingCount, soldThisWeek, declaredMonthCents: sumCents(monthAmounts) ?? 0 };
}
