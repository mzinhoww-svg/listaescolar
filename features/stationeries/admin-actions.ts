import { REASON_REQUIRED_STATUSES, canTransition, type StationeryStatus } from "./state";

export type AdminActionSpec = { to: StationeryStatus; label: string; reasonRequired: boolean; tone: "primary" | "danger" };

const LABEL: Partial<Record<StationeryStatus, string>> = {
  approved: "Aprovar",
  rejected: "Recusar",
  paused: "Pausar",
  suspended: "Suspender",
  active: "Reativar",
};

/** Ações da equipe por status (derivadas da matriz `admin`, a mesma que o banco aplica). */
export function adminActions(from: StationeryStatus): AdminActionSpec[] {
  const targets: StationeryStatus[] = ["approved", "rejected", "paused", "active", "suspended"];
  return targets
    .filter((to) => canTransition("admin", from, to))
    .map((to) => ({
      to,
      label: from === "suspended" && to === "paused" ? "Levantar suspensão (fica pausada)" : (LABEL[to] ?? to),
      reasonRequired: REASON_REQUIRED_STATUSES.includes(to),
      tone: to === "rejected" || to === "suspended" ? "danger" : "primary",
    }));
}
