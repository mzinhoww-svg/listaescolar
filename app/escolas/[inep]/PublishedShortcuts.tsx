import Link from "next/link";

import { findGrade } from "@/features/grades/catalog";

export type PublishedShortcut = { gradeSlug: string; year: number };

/** Atalhos para as listas já publicadas da escola (dado do servidor); alvo de toque de 44 px. */
export function PublishedShortcuts({ inep, items }: { inep: string; items: readonly PublishedShortcut[] }) {
  const shown = items.filter((i) => findGrade(i.gradeSlug));
  if (shown.length === 0) return null;
  return (
    <nav aria-label="Listas publicadas" className="flex flex-col gap-2">
      <p className="text-texto-2 text-[13px] font-semibold">Escolha a série para abrir a lista</p>
      <ul className="flex flex-wrap gap-2">
        {shown.map((i) => (
          <li key={`${i.gradeSlug}-${i.year}`}>
            <Link
              href={`/escolas/${inep}/${i.gradeSlug}?ano=${i.year}`}
              className="border-tinta focus-visible:outline-verde-fundo rounded-botao inline-flex min-h-11 items-center border-[1.5px] bg-white px-4 text-sm font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {`${findGrade(i.gradeSlug)?.label} · ${i.year}`}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
