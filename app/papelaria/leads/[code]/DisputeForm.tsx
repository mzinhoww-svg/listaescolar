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

/** Pap03 "Contestar": prazo de 72h da criação do pedido. Mostra o estado atual quando já existe uma contestação. */
export function DisputeForm({ code, gate }: { code: string; gate: LeadDisputeGate }) {
  const dispute = gate.existingDispute;
  if (dispute) {
    const statusText =
      dispute.status === "open"
        ? `Contestação enviada (${REASON_LABEL[dispute.reason]}), aguardando análise.`
        : dispute.status === "accepted"
          ? `Contestação aceita: o crédito do pedido foi devolvido no extrato.`
          : `Contestação rejeitada.${dispute.resolutionReason ? ` Motivo: ${dispute.resolutionReason}` : ""}`;
    return (
      <section className="rounded-card flex flex-col gap-2 bg-white p-5" aria-label="Contestação">
        <p className="text-[15px] font-extrabold">Contestação</p>
        <p className="text-texto-2 text-[13px] font-semibold">{statusText}</p>
      </section>
    );
  }
  if (!gate.canDispute) {
    return (
      <section className="rounded-card flex flex-col gap-2 bg-white p-5" aria-label="Contestação">
        <p className="text-[15px] font-extrabold">Contestação</p>
        <p className="text-texto-3 text-[13px] font-semibold">Prazo de contestação encerrado em {formatWhen(gate.deadlineAt)}.</p>
      </section>
    );
  }
  return (
    <form action={openDisputeAction} className="rounded-card flex flex-col gap-3 bg-white p-5" aria-label="Contestar pedido">
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="leadId" value={gate.leadId} />
      <p className="text-[15px] font-extrabold">Contestar</p>
      <p className="text-texto-3 text-[13px] font-semibold">Você pode contestar até {formatWhen(gate.deadlineAt)}.</p>
      <select name="reason" required defaultValue="" aria-label="Motivo da contestação" className="bg-campo rounded-campo h-12 px-4 text-[14px] font-semibold">
        <option value="" disabled>Motivo</option>
        {DISPUTE_REASONS.map((r) => (
          <option key={r} value={r}>{REASON_LABEL[r]}</option>
        ))}
      </select>
      <textarea name="detail" maxLength={500} placeholder="Detalhe (opcional)" aria-label="Detalhe (opcional)" className="bg-campo rounded-campo min-h-16 px-4 py-3 text-[14px] font-semibold" />
      <button type="submit" className="border-tinta text-tinta rounded-botao h-11 self-start border-[1.5px] px-5 text-[14px] font-extrabold">
        Contestar
      </button>
    </form>
  );
}
