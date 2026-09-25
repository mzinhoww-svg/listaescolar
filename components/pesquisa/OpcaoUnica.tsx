"use client";

import { useState } from "react";

import type { Opcao } from "@/lib/pesquisa/perguntas";

const ATRASO_AVANCO_MS = 250;

type Props = {
  nomeGrupo: string;
  opcoes: readonly Opcao[];
  valorSelecionado?: string;
  onEscolher: (slug: string) => void;
};

/** Escolha única real (`radiogroup`): marca na hora e avança sozinho 250ms depois. */
export function OpcaoUnica({ nomeGrupo, opcoes, valorSelecionado, onEscolher }: Props) {
  const [selecionado, setSelecionado] = useState<string | undefined>(valorSelecionado);

  function selecionar(slug: string) {
    setSelecionado(slug);
    setTimeout(() => onEscolher(slug), ATRASO_AVANCO_MS);
  }

  return (
    <div role="radiogroup" aria-label={nomeGrupo} className="flex flex-col gap-3">
      {opcoes.map((o) => {
        const ativo = selecionado === o.slug;
        return (
          <button
            key={o.slug}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => selecionar(o.slug)}
            className={`rounded-campo focus-visible:outline-verde-fundo flex min-h-14 w-full items-center justify-between gap-3 border-[1.5px] px-4 py-3.5 text-left text-base font-semibold transition-[background-color,border-color,color,transform,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.985] ${
              ativo
                ? "bg-verde-fundo border-verde-fundo text-white shadow-[0_6px_18px_rgba(11,107,74,0.28)]"
                : "border-linha text-tinta bg-white shadow-[0_1px_2px_rgba(15,27,45,0.04)]"
            }`}
          >
            <span>{o.rotulo}</span>
            <span
              aria-hidden
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                ativo ? "border-white bg-white" : "border-linha bg-transparent"
              }`}
            >
              {ativo ? (
                <svg viewBox="0 0 20 20" className="text-verde-fundo h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.6">
                  <path d="m5 10.5 3.2 3.2L15 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
