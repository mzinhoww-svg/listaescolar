import { LEAD_STATUS_LABEL, type LeadStatus } from "@/features/leads/state";

const TONE: Record<LeadStatus, string> = {
  received: "bg-verde-certo text-tinta",
  viewed: "bg-tinta text-papel",
  in_progress: "bg-[#fdebd0] text-[#7a4a06]",
  quote_sent: "bg-[#fdebd0] text-[#7a4a06]",
  awaiting_customer: "bg-[#fdebd0] text-[#7a4a06]",
  converted: "bg-[#d6f3e5] text-verde-fundo",
  declined: "bg-[#fde2e0] text-[#8a1c14]",
  expired: "bg-campo text-texto-2",
  cancelled: "bg-campo text-texto-2",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span
      data-testid="lead-status"
      className={`${TONE[status]} rounded-botao inline-flex w-fit items-center px-3 py-1 text-[12px] font-extrabold whitespace-nowrap`}
    >
      {LEAD_STATUS_LABEL[status]}
    </span>
  );
}

export function DemoSeal() {
  return (
    <span className="bg-campo text-texto-2 rounded-botao inline-flex w-fit items-center px-2.5 py-1 text-[11px] font-extrabold whitespace-nowrap">
      Demonstração
    </span>
  );
}
