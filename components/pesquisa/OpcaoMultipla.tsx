"use client";

import type { Opcao } from "@/lib/pesquisa/perguntas";

type Props = {
  nomeGrupo: string;
  opcoes: readonly Opcao[];
  valoresSelecionados: string[];
  max?: number;
  onAlternar: (slug: string) => void;
};

/** Múltipla escolha real (checkboxes): respeita `max`, desabilitando opções extras. */
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
            className={`rounded-campo flex min-h-12 items-center gap-3 border px-4 py-3 text-base font-semibold ${
              marcado ? "bg-verde-fundo border-verde-fundo text-white" : "border-linha bg-white text-tinta"
            } ${desabilitado ? "opacity-50" : ""}`}
          >
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={marcado}
              disabled={desabilitado}
              onChange={() => onAlternar(o.slug)}
            />
            {o.rotulo}
          </label>
        );
      })}
    </div>
  );
}
