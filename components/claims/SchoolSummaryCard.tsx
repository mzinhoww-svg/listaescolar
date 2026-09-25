import { DemoBadge } from "@/components/admin/DemoBadge";
import { INEP_NOTE } from "@/features/claims/messages";
import type { SchoolClaimContext } from "@/features/claims/types";

/** Passo "Escola": nome, INEP e município vindos do banco. "Encontrada no cadastro do INEP", nunca "verificada". */
export function SchoolSummaryCard({ school }: { school: SchoolClaimContext["school"] }) {
  return (
    <section aria-label="Escola" className="bg-campo flex flex-col gap-1 rounded-[20px] p-4">
      <p className="text-texto-3 text-[12px] font-extrabold tracking-[0.08em] uppercase">Encontrada no cadastro do INEP</p>
      <p className="flex flex-wrap items-center gap-2 text-[18px] font-extrabold">{school.name}{school.isDemo ? <DemoBadge /> : null}</p>
      <p className="text-texto-2 text-[13px] font-semibold">INEP {school.inep} · {school.municipality}</p>
      <p className="text-texto-3 text-[12px] font-medium">{INEP_NOTE}</p>
    </section>
  );
}
