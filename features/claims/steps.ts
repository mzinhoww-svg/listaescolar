import type { ClaimStatusView } from "./types";

/** Passo (1-based) do passo a passo do responsável: Pedido, Verificação, Análise. */
export function claimStep(view: Pick<ClaimStatusView, "status" | "method" | "channelConfirmedAt"> | null): 1 | 2 | 3 {
  if (view === null) return 1;
  const { status, method, channelConfirmedAt } = view;
  if (status === "approved" || status === "rejected") return 3;
  if (status === "submitted" || status === "token_expired" || status === "insufficient_evidence") return 2;
  if (method !== "documents" && !channelConfirmedAt) return 2;
  return 3;
}
