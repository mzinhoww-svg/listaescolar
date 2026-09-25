import Link from "next/link";
import type { ReactNode } from "react";

import { outlineButton } from "@/components/auth/Screen";

/** Sem lista publicada para escola/série/ano: nada é inventado; só o estado e o caminho de volta. */
export function UnpublishedState({
  inep,
  gradeLabel,
  year,
  notify,
}: {
  inep: string;
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
      <Link href={`/escolas/${inep}`} className={outlineButton}>
        Escolher outra série
      </Link>
    </section>
  );
}
