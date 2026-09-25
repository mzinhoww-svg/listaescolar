import { DemoBadge } from "@/components/admin/DemoBadge";
import { SCHOOL_LABEL_UNAVAILABLE, type SchoolLabel } from "@/features/review/school-labels";

import { formatWhen } from "./format";

const STATUS: Record<string, string> = {
  human_review: "Em revisão",
  approved: "Aprovada pela equipe",
  published: "Publicada",
  rejected: "Recusada",
};

type Props = { status: string; source: "parent" | "school"; createdAt: string; isDemo: boolean; school: SchoolLabel | null };

/** Resumo do envio: só origem e data (sem nome, e-mail ou arquivo de quem enviou). A escola não é editável aqui. */
export function ReviewHeader({ status, source, createdAt, isDemo, school }: Props) {
  return (
    <section aria-label="Resumo do envio" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[24px] bg-white px-6 py-4 text-[14px]">
      <span className="bg-tinta text-papel rounded-botao px-3 py-1 text-xs font-extrabold">{STATUS[status] ?? "Estado desconhecido"}</span>
      <span className="font-extrabold">{school ? `${school.name} · INEP ${school.inep}` : SCHOOL_LABEL_UNAVAILABLE}</span>
      <span className="text-texto-2 font-semibold">Origem: {source === "parent" ? "Família" : "Escola"}</span>
      <span className="text-texto-2 font-semibold">Enviada em {formatWhen(createdAt)}</span>
      {isDemo ? <DemoBadge /> : null}
    </section>
  );
}
