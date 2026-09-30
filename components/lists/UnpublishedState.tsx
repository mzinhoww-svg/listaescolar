import Link from "next/link";
import type { ReactNode } from "react";

import { buttonClass } from "@/components/ui/Button";
import { sendListHref } from "@/features/submissions/href";

/**
 * Sem lista publicada para escola/série/ano: nada é inventado. Os caminhos são "Me avise" (quando há como avisar),
 * "Enviar a lista desta série" (a família que tem a lista pode enviá-la; a equipe revisa) e voltar às séries.
 */
export function UnpublishedState({
  inep,
  gradeSlug,
  gradeLabel,
  year,
  notify,
}: {
  inep: string;
  gradeSlug: string;
  gradeLabel: string;
  year: number;
  /** "Me avise" (App24, S11): só quando há como avisar. */
  notify?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="rounded-[22px] bg-white p-4">
        <h2 className="text-[15px] font-extrabold">
          {gradeLabel} · {year}: lista não publicada
        </h2>
        <p className="text-texto-2 mt-1 text-[13px] leading-[1.4] font-medium">
          Ainda não há lista publicada para esta escola, série e ano. Quando houver, ela aparece
          aqui.
        </p>
      </div>
      {notify}
      <Link href={sendListHref({ inep, gradeSlug, year })} className={buttonClass("outline")}>
        Enviar a lista desta série
      </Link>
      <Link href={`/escolas/${inep}`} className={buttonClass("text", "md", "self-center")}>
        Escolher outra série
      </Link>
    </section>
  );
}
