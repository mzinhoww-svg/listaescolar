import Link from "next/link";
import type { CSSProperties } from "react";

import { DemoBadge } from "@/components/admin/DemoBadge";
import { buttonClass } from "@/components/ui/Button";
import { SITE_COPY } from "@/features/site/copy";

import { EmptyBox } from "./icons";

/** Cartão ilustrativo: conteúdo genérico com selo de demonstração e sem preço. */
export function HeroListCard() {
  const c = SITE_COPY.hero;
  return (
    <figure aria-label="Exemplo ilustrativo de lista" className="bg-white rounded-card p-5 shadow-[0_24px_60px_-20px_rgba(15,27,45,0.25)] md:p-7">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-extrabold">{c.cardTitle}</p>
        <DemoBadge />
      </div>
      <p className="bg-campo text-texto-2 mt-4 inline-block rounded-full px-2.5 py-0.5 text-xs font-extrabold">{c.cardTag}</p>
      <ul className="mt-2 flex flex-col">
        {c.cardItems.map((i, n) => (
          <li
            key={i}
            style={{ "--i": n } as CSSProperties}
            className="tick-loop motion-reduce:animate-none flex items-center gap-3 py-2.5 text-[15px] font-semibold"
          >
            <EmptyBox />
            {i}
          </li>
        ))}
      </ul>
      <div className="border-linha mt-2 border-t pt-4">
        <Link href="/escolas" className={buttonClass("text", "md", "-mx-2 text-sm font-extrabold")}>
          {c.cardFoot}
        </Link>
        <p className="text-texto-2 text-xs font-semibold">{c.cardPrice}</p>
      </div>
    </figure>
  );
}
