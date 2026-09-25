"use client";

import { useState } from "react";

import { ESCOLA_MAX_LENGTH, ETAPAS, ULTIMO_STEP } from "@/lib/pesquisa/perguntas";

import { OpcaoMultipla } from "./OpcaoMultipla";
import { Tela } from "./Tela";

type Props = {
  step: number;
  escolaAtual?: string;
  etapasAtuais?: string[];
  onResponder: (step: number, answers: Record<string, unknown>) => void;
  onVoltar: () => void;
};

/** Tela 4: nome da escola (texto opcional) + etapas (múltipla, obrigatória). */
export function PerguntaEscolaEtapas({ step, escolaAtual, etapasAtuais, onResponder, onVoltar }: Props) {
  const [escola, setEscola] = useState(escolaAtual ?? "");
  const [etapas, setEtapas] = useState<string[]>(etapasAtuais ?? []);

  function alternar(slug: string) {
    setEtapas((atual) => (atual.includes(slug) ? atual.filter((s) => s !== slug) : [...atual, slug]));
  }

  return (
    <Tela
      titulo="Qual a escola e em que etapa estão?"
      progresso={{ atual: step, total: ULTIMO_STEP }}
      onVoltar={onVoltar}
      onContinuar={() => onResponder(step, { escola: escola.trim() || undefined, etapas })}
      continuarDesabilitado={etapas.length === 0}
    >
      <input
        type="text"
        value={escola}
        maxLength={ESCOLA_MAX_LENGTH}
        onChange={(e) => setEscola(e.target.value)}
        placeholder="Nome da escola (opcional)"
        aria-label="Nome da escola"
        className="border-linha rounded-campo h-12 w-full border bg-white px-4 text-base"
      />
      <OpcaoMultipla nomeGrupo="Etapas" opcoes={ETAPAS} valoresSelecionados={etapas} onAlternar={alternar} />
    </Tela>
  );
}
