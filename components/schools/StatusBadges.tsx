import { statusLabel } from "@/features/schools/search/status";
import type { VerificationStatus } from "@/features/schools/search/types";

const TONE: Record<VerificationStatus, string> = {
  registered: "bg-campo text-texto-2",
  claimed: "bg-[#FDE9CC] text-[#7A4A00]",
  verified: "bg-verde-certo text-tinta",
  suspended: "bg-[#FBDADA] text-[#8A1F1F]",
};

const BASE = "rounded-botao inline-flex w-fit items-center px-2.5 py-1 text-[11px] font-extrabold whitespace-nowrap";

/** Selo do status real + selo "Demonstração" quando for dado demonstrativo. */
export function StatusBadges({ status, isDemo }: { status: VerificationStatus; isDemo: boolean }) {
  const s = statusLabel(status, isDemo);
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className={`${BASE} ${TONE[status]}`}>{s.label}</span>
      {s.demoLabel ? <span className={`${BASE} bg-[#FFF0B8] text-[#5C4700]`}>{s.demoLabel}</span> : null}
    </span>
  );
}
