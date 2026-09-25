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
export function PerguntaCompraIdeal({ step, compraIdealAtual, podeCitarAtual, onResponder, onVoltar }: Props) {
  const [texto, setTexto] = useState(compraIdealAtual ?? "");
  const [podeCitar, setPodeCitar] = useState(podeCitarAtual ?? false);

  return (
    <Tela
      titulo="Como seria a compra perfeita da lista?"
      progresso={{ atual: step, total: ULTIMO_STEP }}
      onVoltar={onVoltar}
      onContinuar={() => onResponder(step, { compra_ideal: texto.trim() || undefined, pode_citar: podeCitar })}
      onPular={() => onResponder(step, {})}
    >
      <textarea
        value={texto}
        maxLength={COMPRA_IDEAL_MAX_LENGTH}
        onChange={(e) => setTexto(e.target.value)}
        rows={5}
        aria-label="Como seria a compra perfeita da lista?"
        placeholder="Conte com suas palavras"
        className="border-linha rounded-campo w-full border bg-white px-4 py-3 text-base"
      />
      <label className="flex items-start gap-3 text-sm font-semibold">
        <input
          type="checkbox"
          checked={podeCitar}
          onChange={(e) => setPodeCitar(e.target.checked)}
          className="mt-1 h-5 w-5"
        />
        Pode usar minha frase, sem meu nome
      </label>
    </Tela>
  );
}
