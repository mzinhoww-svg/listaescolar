import { STATUS_LABEL } from "@/features/claims/messages";
import type { ClaimStatus } from "@/features/claims/state";

const TONE: Record<ClaimStatus, string> = {
  submitted: "bg-campo text-texto-2",
  awaiting_verification: "bg-aviso-fundo text-aviso-texto",
  token_expired: "bg-aviso-fundo text-aviso-texto",
  insufficient_evidence: "bg-aviso-fundo text-aviso-texto",
  rejected: "bg-erro-fundo text-erro-texto",
  approved: "bg-verde-certo/20 text-verde-fundo",
};

export function ClaimStatusBadge({ status }: { status: ClaimStatus }) {
  return (
    <span className={`rounded-botao inline-flex w-fit items-center px-2.5 py-1 text-xs font-extrabold whitespace-nowrap ${TONE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
