"use client";

import type { Opcao } from "@/lib/pesquisa/perguntas";

type Props = {
  nomeGrupo: string;
  opcoes: readonly Opcao[];
  valoresSelecionados: string[];
  max?: number;
  onAlternar: (slug: string) => void;
};

/** Múltipla escolha real (checkboxes nativos): respeita `max`, desabilitando opções extras. */
export function OpcaoMultipla({ nomeGrupo, opcoes, valoresSelecionados, max, onAlternar }: Props) {
  const atingiuMax = typeof max === "number" && valoresSelecionados.length >= max;
  return (
    <div role="group" aria-label={nomeGrupo} className="flex flex-col gap-3">
      {opcoes.map((o) => {
        const marcado = valoresSelecionados.includes(o.slug);
        const desabilitado = !marcado && atingiuMax;
        return (
          <label
            key={o.slug}
            className={`rounded-campo has-focus-visible:outline-verde-fundo flex min-h-14 cursor-pointer items-center gap-3 border-[1.5px] px-4 py-3.5 text-base font-semibold transition-[background-color,border-color,color,transform,box-shadow,opacity] duration-150 active:scale-[0.985] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 ${
              marcado
                ? "bg-verde-fundo border-verde-fundo text-white shadow-[0_6px_18px_rgba(11,107,74,0.28)]"
                : "border-linha text-tinta hover:border-linha-tracejada bg-white shadow-[0_1px_2px_rgba(15,27,45,0.04)]"
            } ${desabilitado ? "cursor-not-allowed opacity-45" : ""}`}
          >
            <input
              type="checkbox"
              className="accent-verde-fundo h-5 w-5 shrink-0 rounded-[6px] outline-none"
              checked={marcado}
              disabled={desabilitado}
              onChange={() => {
                if (desabilitado) return;
                onAlternar(o.slug);
              }}
            />
            <span className="flex-1">{o.rotulo}</span>
          </label>
        );
      })}
    </div>
  );
}
