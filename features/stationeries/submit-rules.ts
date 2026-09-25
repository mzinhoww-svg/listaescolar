import type { StationeryStatus } from "./state";

/** Caminho do dono até `under_review`; cada passo passa pela função SQL (matriz e pré-condições no banco). */
export const PATH_TO_REVIEW: Partial<Record<StationeryStatus, readonly StationeryStatus[]>> = {
  signup: ["accreditation", "under_review"],
  accreditation: ["under_review"],
  rejected: ["accreditation", "under_review"],
};

export function canSubmitForReview(status: StationeryStatus): boolean {
  return PATH_TO_REVIEW[status] !== undefined;
}
