import Link from "next/link";

import { DemoBadge } from "@/components/admin/DemoBadge";
import type { PublishedListShortcut } from "@/features/schools/published-lists";

/** Atalhos para escolas reais com lista publicada. Sem nenhuma, nada é exibido (nunca lista inventada). */
export function PublishedShortcuts({ items, title = "Escolas com lista publicada" }: { items: readonly PublishedListShortcut[]; title?: string }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="atalhos-t" className="flex flex-col gap-2">
      <h2 id="atalhos-t" className="text-texto-2 text-[13px] font-extrabold">
        {title}
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((i) => (
          <li key={i.inep}>
            <Link
              href={i.href}
              className="bg-white focus-visible:outline-verde-fundo flex min-h-14 items-center justify-between gap-3 rounded-[18px] px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[14px] font-extrabold">{i.schoolName}</span>
                <span className="text-texto-2 text-xs font-semibold">
                  {i.gradeLabel} · {i.year}
                </span>
              </span>
              {i.isDemo ? <DemoBadge /> : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
