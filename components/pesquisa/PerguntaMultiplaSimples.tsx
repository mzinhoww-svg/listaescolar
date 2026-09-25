"use client";

import { useState } from "react";

import { ULTIMO_STEP, type Opcao } from "@/lib/pesquisa/perguntas";

import { OpcaoMultipla } from "./OpcaoMultipla";
import { Tela } from "./Tela";

type Props = {
  step: number;
  campo: string;
  titulo: string;
  opcoes: readonly Opcao[];
  valoresAtuais?: string[];
  max?: number;
  onResponder: (step: number, answers: Record<string, unknown>) => void;
  onVoltar: () => void;
};

/** Tela genérica de múltipla escolha com um único campo (telas 6 e 10). */
export function PerguntaMultiplaSimples({
  step,
  campo,
  titulo,
  opcoes,
  valoresAtuais,
  max,
  onResponder,
  onVoltar,
}: Props) {
  const [selecionados, setSelecionados] = useState<string[]>(valoresAtuais ?? []);

  function alternar(slug: string) {
    setSelecionados((atual) =>
      atual.includes(slug) ? atual.filter((s) => s !== slug) : [...atual, slug],
    );
  }

  return (
    <Tela
      titulo={titulo}
      progresso={{ atual: step, total: ULTIMO_STEP }}
      onVoltar={onVoltar}
      onContinuar={() => onResponder(step, { [campo]: selecionados })}
      continuarDesabilitado={selecionados.length === 0}
    >
      <OpcaoMultipla
        nomeGrupo={titulo}
        opcoes={opcoes}
        valoresSelecionados={selecionados}
        max={max}
        onAlternar={alternar}
      />
    </Tela>
  );
}
