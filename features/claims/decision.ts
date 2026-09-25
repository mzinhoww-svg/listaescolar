import { canTransition } from "./state";
import type { AdminClaimView } from "./types";

export type DecisionOption = { to: "approved" | "insufficient_evidence" | "rejected"; allowed: boolean; reason?: string };

/** Aprovar exige canal confirmado (token) ou ao menos um arquivo (documentos) além da transição permitida. */
export function decisionOptions(c: AdminClaimView): DecisionOption[] {
  const missing = c.method === "documents" ? (c.evidence.length === 0 ? "Falta evidência: nenhum arquivo enviado." : null) : c.channelConfirmedAt ? null : "Falta confirmar o canal da escola.";
  const wrong = (to: "approved" | "insufficient_evidence" | "rejected") => (canTransition("admin", c.status, to) ? undefined : "Indisponível neste estado da reivindicação.");
  return [
    { to: "approved", allowed: !wrong("approved") && !missing, reason: wrong("approved") ?? missing ?? undefined },
    { to: "insufficient_evidence", allowed: !wrong("insufficient_evidence"), reason: wrong("insufficient_evidence") },
    { to: "rejected", allowed: !wrong("rejected"), reason: wrong("rejected") },
  ];
}
