import type { ReactNode } from "react";

import { Logo } from "@/components/brand/Logo";

type Props = { direita?: ReactNode };

/** Topo de toda tela da pesquisa: wordmark oficial à esquerda (spec §6) e um slot à direita. */
export function Cabecalho({ direita }: Props) {
  return (
    <header className="flex h-11 items-center justify-between">
      <div className="w-[112px]">
        <Logo variant="horizontal" height={24} />
      </div>
      {direita ? <div className="text-texto-3 text-xs font-bold tabular-nums">{direita}</div> : null}
    </header>
  );
}
