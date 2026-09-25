"use client";

import { useActionState, useState } from "react";

import { IDLE, isProblem, type ReviewActionState } from "@/app/admin/revisao/state";
import { REJECT_REASONS, type BlockerCode } from "@/features/review/codes";
import { blockerPhrase, rejectReasonLabel } from "@/features/review/phrases";

import { useDraft } from "./DraftContext";

type Act = (prev: ReviewActionState, formData: FormData) => Promise<ReviewActionState>;
type Props = {
  submissionId: string;
  version: number;
  /** Estado do envio; só `human_review` decide. */
  status: string;
  /** Bloqueios calculados no servidor para a versão salva (inclui a confirmação do alerta crítico, quando exigida). */
  blockers: readonly BlockerCode[];
  /** Aprovado pela equipe e ainda não publicado (e sem publicação automática órfã). */
  canPublish: boolean;
  orphaned: boolean;
  actions: { approveAndPublish: Act; reject: Act; publish: Act };
};

const READ_ONLY: Record<string, string> = {
  published: "Esta lista já foi publicada. A tela está em modo somente leitura.",
  rejected: "Esta lista foi recusada. A tela está em modo somente leitura.",
  approved: "Esta lista foi aprovada pela equipe. A tela está em modo somente leitura.",
};

function Result({ s }: { s: ReviewActionState }) {
  if (s.kind === "idle") return null;
  return (
    <p role={isProblem(s.kind) ? "alert" : "status"} className={`${isProblem(s.kind) ? "bg-erro-fundo text-erro-texto" : "bg-campo"} rounded-campo px-4 py-3 text-[14px] font-bold`}>
      {s.message}
    </p>
  );
}

/** Painel de decisão (Admin05). Bloqueios em frases, confirmação do documento original e motivo de recusa de lista fechada. */
export function DecisionPanel({ submissionId, version, status, blockers, canPublish, orphaned, actions }: Props) {
  const { dirty } = useDraft();
  const [ack, setAck] = useState(false);
  const [reason, setReason] = useState("");
  const [approveState, approveAction, approving] = useActionState(actions.approveAndPublish, IDLE);
  const [rejectState, rejectAction, rejecting] = useActionState(actions.reject, IDLE);
  const [publishState, publishAction, publishing] = useActionState(actions.publish, IDLE);
  const needsAck = blockers.includes("critical_alerts_unconfirmed");
  const open = blockers.filter((c) => !(c === "critical_alerts_unconfirmed" && ack));
  const retry = [approveState.kind, publishState.kind].some((k) => k === "pending" || k === "unavailable");
  const hidden = (
    <>
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="expectedVersion" value={version} />
    </>
  );

  return (
    <aside aria-labelledby="decisao-titulo" className="flex flex-col gap-4 rounded-[24px] bg-white p-5">
      <h2 id="decisao-titulo" className="text-[17px] font-extrabold">Decisão</h2>
      {orphaned ? <p role="note" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">Existe uma publicação automática não reconciliada; a conciliação é feita na integração (S11).</p> : null}
      {status !== "human_review" ? (
        <>
          <p className="text-[14px] font-semibold">{READ_ONLY[status] ?? "Este envio não está em revisão."}</p>
          {canPublish && !orphaned ? (
            <form action={publishAction}>
              {hidden}
              <button type="submit" disabled={publishing} className="bg-verde-certo text-tinta rounded-botao min-h-11 px-6 text-[14px] font-extrabold disabled:opacity-50">{retry ? "Tentar publicar de novo" : "Publicar"}</button>
            </form>
          ) : null}
          <Result s={publishState} />
        </>
      ) : (
        <>
          {open.length > 0 ? (
            <div>
              <h3 className="text-[14px] font-extrabold">Antes de aprovar</h3>
              <ul className="mt-1 list-disc pl-5 text-[14px] font-semibold">{open.map((c) => <li key={c}>{blockerPhrase(c)}</li>)}</ul>
            </div>
          ) : null}
          {dirty ? <p className="text-erro-texto text-[14px] font-bold">Salve a edição antes de aprovar.</p> : null}
          <form action={approveAction} className="flex flex-col gap-3">
            {hidden}
            {needsAck ? (
              <label className="flex items-start gap-3 text-[14px] font-bold">
                <input type="checkbox" name="acknowledged" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 size-5" />
                Conferi o documento original
              </label>
            ) : null}
            <button type="submit" disabled={approving || dirty || open.length > 0} className="bg-verde-certo text-tinta rounded-botao min-h-11 px-6 text-[14px] font-extrabold disabled:opacity-50">
              {approving ? "Publicando..." : retry ? "Tentar publicar de novo" : "Aprovar e publicar"}
            </button>
          </form>
          <Result s={approveState} />
          <form action={rejectAction} className="border-campo flex flex-col gap-3 border-t pt-4">
            {hidden}
            <label className="flex flex-col gap-1 text-[13px] font-extrabold">
              Motivo da recusa
              <select name="reason" required value={reason} onChange={(e) => setReason(e.target.value)} className="bg-campo rounded-campo min-h-11 px-3 py-2 text-[14px] font-semibold">
                <option value="">Escolha um motivo</option>
                {REJECT_REASONS.map((r) => <option key={r} value={r}>{rejectReasonLabel(r)}</option>)}
              </select>
            </label>
            <button type="submit" disabled={rejecting || reason === ""} className="bg-erro-fundo text-erro-texto rounded-botao min-h-11 px-6 text-[14px] font-extrabold disabled:opacity-50">Recusar</button>
          </form>
          <Result s={rejectState} />
        </>
      )}
    </aside>
  );
}
