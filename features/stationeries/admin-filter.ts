import { formatCnpj } from "./cnpj";
import type { StationeryStatus } from "./state";

export const ADMIN_TABS = [
  { key: "pendentes", label: "Pendentes", statuses: ["under_review"] },
  { key: "ativas", label: "Ativas", statuses: ["active"] },
  { key: "pausadas", label: "Pausadas", statuses: ["paused"] },
  { key: "suspensas", label: "Suspensas", statuses: ["suspended"] },
  { key: "todas", label: "Todas", statuses: null },
] as const satisfies readonly { key: string; label: string; statuses: readonly StationeryStatus[] | null }[];
export type AdminTabKey = (typeof ADMIN_TABS)[number]["key"];

export function parseTab(value: string | undefined): AdminTabKey {
  return ADMIN_TABS.find((t) => t.key === value)?.key ?? "pendentes";
}

type Row = { tradeName: string; cnpj: string; neighborhood: string | null; status: StationeryStatus };

const fold = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();

/** Filtro por aba e busca (nome, CNPJ com ou sem máscara, bairro). */
export function filterRows<T extends Row>(rows: readonly T[], tab: AdminTabKey, query: string): T[] {
  const statuses: readonly StationeryStatus[] | null = ADMIN_TABS.find((t) => t.key === tab)?.statuses ?? null;
  const q = fold(query.trim());
  const qDigits = q.replace(/\D/g, "");
  return rows.filter((r) => {
    if (statuses && !statuses.includes(r.status)) return false;
    if (q === "") return true;
    return (
      fold(r.tradeName).includes(q) ||
      fold(r.neighborhood ?? "").includes(q) ||
      fold(formatCnpj(r.cnpj)).includes(q) ||
      (qDigits.length >= 3 && r.cnpj.includes(qDigits))
    );
  });
}
