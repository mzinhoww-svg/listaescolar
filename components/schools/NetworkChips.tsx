import Link from "next/link";

import { buildSearchQuery } from "@/features/schools/search/query";
import { NETWORK_PARAMS, type SearchInput } from "@/features/schools/search/types";

const CHIPS: { label: string; network: SearchInput["network"] }[] = [
  { label: "Todas", network: null },
  { label: "Municipal", network: NETWORK_PARAMS.municipal },
  { label: "Estadual", network: NETWORK_PARAMS.estadual },
  { label: "Federal", network: NETWORK_PARAMS.federal },
  { label: "Privada", network: NETWORK_PARAMS.privada },
];

/** Filtro de rede como links (funciona sem JS); volta à página 1 ao trocar. */
export function NetworkChips({ input }: { input: SearchInput }) {
  return (
    <nav aria-label="Filtrar por rede" className="-mx-6 overflow-x-auto px-6">
      <ul className="flex gap-2">
        {CHIPS.map((c) => {
          const active = input.network === c.network;
          const href = `/escolas${buildSearchQuery({ ...input, network: c.network }, { page: 1 })}`;
          return (
            <li key={c.label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`rounded-botao focus-visible:outline-verde-fundo block px-4 py-2.5 text-[13px] whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  active ? "bg-tinta text-papel font-bold" : "bg-campo text-tinta font-semibold"
                }`}
              >
                {c.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
