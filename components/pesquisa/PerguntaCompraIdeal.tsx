"use client";

import { useState } from "react";

import { COMPRA_IDEAL_MAX_LENGTH, ULTIMO_STEP } from "@/lib/pesquisa/perguntas";

import { Tela } from "./Tela";

type Props = {
  step: number;
  compraIdealAtual?: string;
  podeCitarAtual?: boolean;
  onResponder: (step: number, answers: Record<string, unknown>) => void;
  onVoltar: () => void;
};

/** Tela 12: texto livre (opcional, máx. 500) + "pode citar" (opcional). Tem "Pular". */
export function PerguntaCompraIdeal({
  step,
  compraIdealAtual,
  podeCitarAtual,
  onResponder,
  onVoltar,
}: Props) {
  const [texto, setTexto] = useState(compraIdealAtual ?? "");
  const [podeCitar, setPodeCitar] = useState(podeCitarAtual ?? false);

  return (
    <Tela
      titulo="Como seria a compra perfeita da lista?"
      progresso={{ atual: step, total: ULTIMO_STEP }}
      onVoltar={onVoltar}
      onContinuar={() =>
        onResponder(step, { compra_ideal: texto.trim() || undefined, pode_citar: podeCitar })
      }
      onPular={() => onResponder(step, {})}
    >
      <textarea
        value={texto}
        maxLength={COMPRA_IDEAL_MAX_LENGTH}
        onChange={(e) => setTexto(e.target.value)}
        rows={5}
        aria-label="Como seria a compra perfeita da lista?"
        placeholder="Conte com suas palavras"
        className="border-linha text-tinta rounded-campo focus-visible:border-verde-fundo focus-visible:ring-verde-fundo/25 placeholder:text-texto-3 w-full resize-none border-[1.5px] bg-white px-4 py-3.5 text-base leading-relaxed font-medium shadow-[0_1px_2px_rgba(15,27,45,0.04)] outline-none focus-visible:ring-4"
      />
      <label
        className={`rounded-campo has-focus-visible:outline-verde-fundo flex cursor-pointer items-center gap-3 border-[1.5px] bg-white px-4 py-3.5 text-sm font-semibold transition-colors duration-150 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 ${
          podeCitar ? "border-verde-fundo" : "border-linha hover:border-linha-tracejada"
        }`}
      >
        <input
          type="checkbox"
          checked={podeCitar}
          onChange={(e) => setPodeCitar(e.target.checked)}
          className="accent-verde-fundo h-5 w-5 shrink-0 outline-none"
        />
        <span className="text-tinta">Pode usar minha frase, sem meu nome</span>
      </label>
    </Tela>
  );
}
