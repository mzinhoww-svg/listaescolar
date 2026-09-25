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
            className={`focus-visible:outline-verde-fundo rounded-campo min-h-12 border px-4 py-3 text-left text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
              ativo ? "bg-verde-fundo border-verde-fundo text-white" : "border-linha bg-white text-tinta"
            }`}
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}
