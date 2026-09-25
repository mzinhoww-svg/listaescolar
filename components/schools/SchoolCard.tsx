import Link from "next/link";

import { NETWORK_LABEL, type SchoolListItem } from "@/features/schools/search/types";

import { initials } from "./format";
import { StatusBadges } from "./StatusBadges";

export function SchoolCard({ school }: { school: SchoolListItem }) {
  const where = [school.neighborhood, NETWORK_LABEL[school.network]].filter(Boolean).join(" · ");
  return (
    <li>
      <Link
        href={`/escolas/${school.inep}`}
        className="focus-visible:outline-verde-fundo flex items-center gap-3 rounded-[22px] bg-white p-3.5 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <span
          aria-hidden
          className="bg-tinta text-papel flex size-[52px] shrink-0 items-center justify-center rounded-2xl text-[15px] font-extrabold"
        >
          {initials(school.name)}
        </span>
        <span className="flex min-w-0 grow flex-col gap-0.5">
          <span className="text-[15px] leading-tight font-extrabold">{school.name}</span>
          <span className="text-texto-3 text-xs font-medium">
            INEP {school.inep}
            {where ? ` · ${where}` : ""}
          </span>
        </span>
        <StatusBadges status={school.verificationStatus} isDemo={school.isDemo} />
      </Link>
    </li>
  );
}
