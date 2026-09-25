/** Ciclo de vida da papelaria. Espelha a matriz de `public.stationery_transition` (migration 0302). */
export const STATIONERY_STATUSES = [
  "signup",
  "accreditation",
  "under_review",
  "approved",
  "active",
  "paused",
  "suspended",
  "rejected",
] as const;
export type StationeryStatus = (typeof STATIONERY_STATUSES)[number];

export const TRANSITION_ACTORS = ["owner", "admin", "system"] as const;
export type TransitionActor = (typeof TRANSITION_ACTORS)[number];

type Edge = readonly [StationeryStatus, StationeryStatus];

const OWNER_EDGES: readonly Edge[] = [
  ["signup", "accreditation"],
  ["accreditation", "under_review"],
  ["approved", "active"],
  ["active", "paused"],
  ["paused", "active"],
  ["rejected", "accreditation"],
];

const STAFF_EDGES: readonly Edge[] = [
  ["under_review", "approved"],
  ["under_review", "rejected"],
  ["active", "paused"],
  ["approved", "paused"],
  ["paused", "active"],
  ["suspended", "paused"],
  // qualquer estado não terminal para a equipe vai a `suspended`
  ...(["signup", "accreditation", "under_review", "approved", "active", "paused"] as const).map(
    (from): Edge => [from, "suspended"],
  ),
];

/** Transições permitidas por ator. `admin` e `system` têm a mesma matriz. */
export const transitionTable: Readonly<Record<TransitionActor, readonly Edge[]>> = {
  owner: OWNER_EDGES,
  admin: STAFF_EDGES,
  system: STAFF_EDGES,
};

/** Estados em que o dono altera o cadastro (RLS e repositório). */
export const OWNER_EDITABLE_STATUSES: readonly StationeryStatus[] = [
  "signup",
  "accreditation",
  "approved",
  "active",
  "paused",
];
/** Estados em que o dono escreve o catálogo (antes de publicar e depois). */
export const CATALOG_WRITABLE_STATUSES: readonly StationeryStatus[] = ["approved", "active", "paused"];
/** Estados em que o dono altera as áreas atendidas. */
export const AREAS_WRITABLE_STATUSES: readonly StationeryStatus[] = OWNER_EDITABLE_STATUSES;

/** Estados que exigem motivo. */
export const REASON_REQUIRED_STATUSES: readonly StationeryStatus[] = ["rejected", "suspended"];

export function canTransition(
  actor: TransitionActor,
  from: StationeryStatus,
  to: StationeryStatus,
): boolean {
  return transitionTable[actor].some(([f, t]) => f === from && t === to);
}

/** Papelaria visível ao público e à cotação local. */
export function isPublicStatus(status: StationeryStatus): boolean {
  return status === "active";
}
