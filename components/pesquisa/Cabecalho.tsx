import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/Logo";

type Props = {
  direita?: ReactNode;
  /** Liga o logo ao site ("Voltar ao site"). Fica desligado no meio das perguntas, onde sair perderia as respostas. */
  voltarAoSite?: boolean;
};

/** Topo de toda tela da pesquisa: wordmark oficial à esquerda (spec §6) e um slot à direita. */
export function Cabecalho({ direita, voltarAoSite = false }: Props) {
  const logo = <Logo variant="horizontal" height={24} />;
  return (
    <header className="flex h-11 items-center justify-between">
      <div className="w-[112px]">
        {voltarAoSite ? (
          <Link href="/" aria-label="Voltar ao site" className="focus-visible:outline-verde-fundo flex min-h-11 items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2">
            {logo}
          </Link>
        ) : (
          logo
        )}
      </div>
      {direita ? (
        <div aria-hidden className="text-texto-2 text-xs font-bold tabular-nums">
          {direita}
        </div>
      ) : null}
    </header>
  );
}
