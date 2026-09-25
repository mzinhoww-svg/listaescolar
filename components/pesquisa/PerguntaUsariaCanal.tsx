"use client";

import { useState } from "react";

import { CANAL, ULTIMO_STEP, USARIA } from "@/lib/pesquisa/perguntas";

import { OpcaoUnica } from "./OpcaoUnica";
import { Tela } from "./Tela";

type Props = {
  step: number;
  usariaAtual?: string;
  canalAtual?: string;
  onResponder: (step: number, answers: Record<string, unknown>) => void;
  onVoltar: () => void;
};

/**
 * Tela 11: "usaria" (escolha única, avança sozinha) revela "canal" (escolha única
 * condicional) quando `usaria !== "nao"`. As duas sub-perguntas são uma única tela
 * numerada; só uma chamada de resposta é enviada, com os campos que se aplicam.
 */
export function PerguntaUsariaCanal({ step, usariaAtual, canalAtual, onResponder, onVoltar }: Props) {
  const [usaria, setUsaria] = useState<string | undefined>(usariaAtual);
  const [fase, setFase] = useState<"usaria" | "canal">(
    usariaAtual && usariaAtual !== "nao" ? "canal" : "usaria",
  );

  function escolherUsaria(slug: string) {
    setUsaria(slug);
    if (slug === "nao") {
      onResponder(step, { usaria: slug });
    } else {
      setFase("canal");
    }
  }

  function escolherCanal(slug: string) {
    if (!usaria) return;
    onResponder(step, { usaria, canal: slug });
  }

  if (fase === "canal" && usaria) {
    return (
      <Tela
        titulo="E onde preferiria comprar?"
        progresso={{ atual: step, total: ULTIMO_STEP }}
        onVoltar={() => setFase("usaria")}
      >
        <OpcaoUnica
          nomeGrupo="E onde preferiria comprar?"
          opcoes={CANAL}
          valorSelecionado={canalAtual}
          onEscolher={escolherCanal}
        />
      </Tela>
    );
  }

  return (
    <Tela
      titulo="Imagine escolher a escola e a série e receber o carrinho pronto, com o preço comparado entre lojas. Você usaria?"
      progresso={{ atual: step, total: ULTIMO_STEP }}
      onVoltar={onVoltar}
    >
      <OpcaoUnica nomeGrupo="Você usaria?" opcoes={USARIA} valorSelecionado={usaria} onEscolher={escolherUsaria} />
    </Tela>
  );
}
