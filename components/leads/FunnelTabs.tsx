import Link from "next/link";

import { FUNNEL_TABS, type FunnelTabId } from "@/features/leads/funnel";

type Props = { active: FunnelTabId; counts: Record<FunnelTabId, number>; hrefFor: (tab: FunnelTabId) => string };

/** Abas do funil (Pap02): links, para funcionar sem JavaScript. */
export function FunnelTabs({ active, counts, hrefFor }: Props) {
  return (
    <nav aria-label="Funil de leads" className="flex flex-wrap gap-2">
      {FUNNEL_TABS.map((t) => (
        <Link
          key={t.id}
          href={hrefFor(t.id)}
          aria-current={t.id === active ? "page" : undefined}
          className={`${t.id === active ? "bg-tinta text-papel" : "bg-campo text-tinta"} rounded-botao px-4 py-2.5 text-[14px] font-extrabold`}
        >
          {t.label} <span className="opacity-70">({counts[t.id]})</span>
        </Link>
      ))}
    </nav>
  );
}
