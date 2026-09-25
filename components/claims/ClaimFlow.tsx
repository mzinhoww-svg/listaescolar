import Link from "next/link";

import { STATUS_HINT, STATUS_LABEL } from "@/features/claims/messages";
import type { ClaimStatusView } from "@/features/claims/types";
import type { ClaimActionState } from "@/features/claims/form-state";

import { ClaimStatusBadge } from "./ClaimStatusBadge";
import { ClaimTimeline } from "./ClaimTimeline";
import { EvidenceUploader } from "./EvidenceUploader";
import { TokenPanel } from "./TokenPanel";

type Act = (prev: ClaimActionState, formData: FormData) => Promise<ClaimActionState>;
export type ClaimFlowActions = { upload: Act; remove: Act; submit: Act; request: Act; confirm: Act };

/** Passo a passo depois de criada: estado + linha do tempo + o painel de ação do estado atual (Escola02, adaptada). */
export function ClaimFlow({ inep, claim, actions }: { inep: string; claim: ClaimStatusView; actions: ClaimFlowActions }) {
  const token = claim.method !== "documents";
  const needsDocs = !token && (claim.status === "submitted" || claim.status === "insufficient_evidence");
  const needsToken = token && (claim.status === "submitted" || claim.status === "token_expired" || claim.status === "awaiting_verification");
  return (
    <div className="flex flex-col gap-5">
      <ClaimStatusBadge status={claim.status} />
      <h2 className="text-[24px] leading-[1.1] font-extrabold tracking-[-0.03em]">{STATUS_LABEL[claim.status]}</h2>
      <p className="text-texto-2 text-[15px] leading-[1.4] font-medium">{STATUS_HINT[claim.status]}</p>
      {claim.decisionReason && (claim.status === "rejected" || claim.status === "insufficient_evidence" || claim.status === "approved") ? (
        <p className="bg-campo rounded-campo px-4 py-3 text-[14px] font-semibold">Motivo: {claim.decisionReason}</p>
      ) : null}
      {token && claim.status !== "rejected" ? (
        <p data-channel-status={claim.channelConfirmedAt ? "confirmed" : "pending"} className="text-texto-2 text-[13px] font-extrabold">
          {claim.channelConfirmedAt ? "Canal: confirmado" : "Canal: aguardando confirmação"}
        </p>
      ) : null}
      <ClaimTimeline events={claim.events} status={claim.status} />
      {needsDocs ? (
        <EvidenceUploader
          inep={inep}
          claimId={claim.id}
          evidence={claim.evidence}
          evidenceNote={claim.evidenceNote}
          editableNote={claim.status === "insufficient_evidence"}
          upload={actions.upload}
          remove={actions.remove}
          submit={actions.submit}
        />
      ) : null}
      {needsToken && token ? (
        <TokenPanel
          inep={inep}
          claimId={claim.id}
          method={claim.method as "institutional_email" | "institutional_whatsapp"}
          issued={claim.status !== "submitted"}
          confirmed={Boolean(claim.channelConfirmedAt)}
          request={actions.request}
          confirm={actions.confirm}
        />
      ) : null}
      {claim.status === "approved" ? (
        <Link href="/escola" className="bg-tinta text-papel rounded-botao flex h-14 items-center justify-center text-base font-extrabold">Ir para Minhas escolas</Link>
      ) : null}
      {claim.status === "rejected" ? (
        <Link href={`/escolas/${inep}/reivindicar?nova=1`} className="border-tinta text-tinta rounded-botao flex h-[52px] items-center justify-center border-[1.5px] text-base font-extrabold">Reivindicar de novo</Link>
      ) : null}
    </div>
  );
}
