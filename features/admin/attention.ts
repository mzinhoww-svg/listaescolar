import type { DashboardCategory, DashboardCounts } from "./dashboard";

export type AttentionItem = { key: "claims" | "lists" | "stationeries" | "disputes"; label: string; count: number | null; href: string };

/** Soma dos estados que esperam decisão da equipe; categoria indisponível fica `null` (nunca zero inventado). */
function sum(c: DashboardCategory, states: readonly string[]): number | null {
  if (c.unavailable) return null;
  return c.counts.filter((x) => states.includes(x.state)).reduce((a, x) => a + x.count, 0);
}

/** "Fila de atenção" do /admin (UX-110): o que precisa de decisão, com o link de cada fila. */
export function attentionItems(counts: DashboardCounts, openDisputes: number | null): AttentionItem[] {
  return [
    { key: "claims", label: "Reivindicações para decidir", count: sum(counts.claims, ["submitted", "awaiting_verification"]), href: "/admin/reivindicacoes" },
    { key: "lists", label: "Listas em revisão", count: sum(counts.lists, ["human_review"]), href: "/admin/revisao" },
    { key: "stationeries", label: "Papelarias aguardando aprovação", count: sum(counts.stationeries, ["under_review"]), href: "/admin/papelarias?aba=pendentes" },
    { key: "disputes", label: "Contestações abertas", count: openDisputes, href: "/admin/contestacoes" },
  ];
}
