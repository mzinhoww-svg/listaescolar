import Link from "next/link";

import { type SchoolProfile } from "@/features/schools/search/types";

import { BackIcon } from "./icons";
import { StatusBadges } from "./StatusBadges";

/** Cabeçalho escuro do perfil (App14): selo, INEP, nome e localização. */
export function ProfileHeader({ school }: { school: SchoolProfile }) {
  const place = [school.neighborhood, `${school.municipalityName} · ${school.uf}`].filter(Boolean).join(" · ");
  return (
    <header className="bg-tinta text-papel rounded-b-[32px] px-6 pt-14 pb-7">
      <div className="mx-auto flex w-full max-w-[420px] flex-col gap-3.5">
        <Link
          href="/escolas"
          aria-label="Voltar para a busca"
          className="bg-papel/10 focus-visible:outline-verde-certo flex size-12 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <BackIcon />
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadges status={school.verificationStatus} isDemo={school.isDemo} />
          <span className="text-papel/80 text-xs font-semibold">INEP {school.inep}</span>
        </div>
        <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em]">{school.name}</h1>
        <p className="text-papel/80 text-sm font-medium">{place}</p>
      </div>
    </header>
  );
}
