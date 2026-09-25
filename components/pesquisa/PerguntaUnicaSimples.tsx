"use client";

import { ULTIMO_STEP, type Opcao } from "@/lib/pesquisa/perguntas";

import { OpcaoUnica } from "./OpcaoUnica";
import { Tela } from "./Tela";

type Props = {
  step: number;
  campo: string;
  titulo: string;
  opcoes: readonly Opcao[];
  valorAtual?: string;
  onResponder: (step: number, answers: Record<string, unknown>) => void;
  onVoltar: () => void;
};

/** Tela genérica de escolha única com um único campo (telas 1, 2, 3, 5, 7, 8 e 9). */
export function PerguntaUnicaSimples({ step, campo, titulo, opcoes, valorAtual, onResponder, onVoltar }: Props) {
  return (
    <Tela titulo={titulo} progresso={{ atual: step, total: ULTIMO_STEP }} onVoltar={onVoltar}>
      <OpcaoUnica
        nomeGrupo={titulo}
        opcoes={opcoes}
        valorSelecionado={valorAtual}
        onEscolher={(slug) => onResponder(step, { [campo]: slug })}
      />
    </Tela>
  );
}
