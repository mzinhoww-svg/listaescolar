import { SubmitButton } from "@/components/cart/SubmitButton";
import { Field, fieldInputClass } from "@/components/ui/Field";
import { openDisputeAction } from "@/features/conversion/actions";
import { DISPUTE_REASONS, type LeadDisputeGate } from "@/features/conversion/ports";

const REASON_LABEL: Record<(typeof DISPUTE_REASONS)[number], string> = {
  wrong_number: "Número errado",
  incomplete_list: "Lista incompleta",
  duplicate: "Pedido duplicado",
  out_of_area: "Fora da área de entrega",
};

function formatWhen(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Cuiaba" }).format(d);
}

const BLOCKED_MESSAGE: Record<NonNullable<LeadDisputeGate["blockedReason"]>, string> = {
  sold: "Este pedido já foi vendido (confirmado pela papelaria ou pelo responsável) e não pode mais ser contestado.",
  suspended: "Papelaria suspensa: contestação indisponível.",
  expired: "Prazo de contestação encerrado",
};

/** Pap03 "Contestar": prazo de 72h da criação do pedido. Mostra o estado atual quando já existe uma contestação. */
export function DisputeForm({ code, gate }: { code: string; gate: LeadDisputeGate }) {
  const dispute = gate.existingDispute;
  if (dispute) {
    const statusText =
      dispute.status === "open"
        ? `Contestação enviada (${REASON_LABEL[dispute.reason]}), aguardando análise.`
        : dispute.status === "accepted"
          ? dispute.reversedEntryId
            ? `Contestação aceita: o crédito do pedido foi devolvido no extrato.${dispute.resolutionReason ? ` Motivo: ${dispute.resolutionReason}` : ""}`
            : `Contestação aceita: sem crédito a devolver (este pedido não gerou cobrança).${dispute.resolutionReason ? ` Motivo: ${dispute.resolutionReason}` : ""}`
          : `Contestação rejeitada.${dispute.resolutionReason ? ` Motivo: ${dispute.resolutionReason}` : ""}`;
    return (
      <section className="rounded-card flex flex-col gap-2 bg-white p-5" aria-label="Contestação">
        <p className="text-[15px] font-extrabold">Contestação</p>
        <p className="text-texto-2 text-[13px] font-semibold">{statusText}</p>
      </section>
    );
  }
  if (!gate.canDispute) {
    const msg = gate.blockedReason === "expired" ? `${BLOCKED_MESSAGE.expired} em ${formatWhen(gate.deadlineAt)}.` : gate.blockedReason ? BLOCKED_MESSAGE[gate.blockedReason] : "Contestação indisponível.";
    return (
      <section className="rounded-card flex flex-col gap-2 bg-white p-5" aria-label="Contestação">
        <p className="text-[15px] font-extrabold">Contestação</p>
        <p className="text-texto-3 text-[13px] font-semibold">{msg}</p>
      </section>
    );
  }
  return (
    <form action={openDisputeAction} className="rounded-card flex flex-col gap-3 bg-white p-5" aria-label="Contestar pedido">
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="leadId" value={gate.leadId} />
      <p className="text-[15px] font-extrabold">Contestar</p>
      <p className="text-texto-3 text-[13px] font-semibold">Você pode contestar até {formatWhen(gate.deadlineAt)}.</p>
      <Field id={`contestar-motivo-${code}`} label="Motivo da contestação">
        <select id={`contestar-motivo-${code}`} name="reason" required defaultValue="" className={fieldInputClass}>
          <option value="" disabled>Escolha o motivo</option>
          {DISPUTE_REASONS.map((r) => (
            <option key={r} value={r}>{REASON_LABEL[r]}</option>
          ))}
        </select>
      </Field>
      <Field id={`contestar-detalhe-${code}`} label="Detalhe (opcional)">
        <textarea id={`contestar-detalhe-${code}`} name="detail" maxLength={500} className="bg-campo text-tinta border-texto-3 rounded-campo min-h-20 w-full border-[1.5px] px-4 py-3 text-[15px] font-medium" />
      </Field>
      <SubmitButton variant="outline" pendingLabel="Enviando contestação" className="self-start">
        Contestar pedido
      </SubmitButton>
    </form>
  );
}
