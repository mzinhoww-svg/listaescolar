"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { ULTIMO_STEP } from "@/lib/pesquisa/perguntas";
import { obterOuCriarEstadoLocal, salvarEstadoLocal, type EstadoPesquisaLocal } from "@/lib/pesquisa/sessao";

import { PerguntaRouter } from "./PerguntaRouter";
import { enviarComRetry } from "./retry";
import { TelaFinal } from "./TelaFinal";

/** Orquestrador client-side: sessão local, navegação entre telas e envio otimista. */
export function Pesquisa() {
  const searchParams = useSearchParams();
  const [estado, setEstado] = useState<EstadoPesquisaLocal | null>(null);
  const [acabouDeConcluir, setAcabouDeConcluir] = useState(false);
  const [falhaEnvio, setFalhaEnvio] = useState(false);

  useEffect(() => {
    // Sincroniza com o localStorage (sistema externo) na primeira montagem: cria ou
    // retoma a sessão. g/ref só são capturados aqui, na primeira visita.
    const g = searchParams.get("g") ?? undefined;
    const ref = searchParams.get("ref") ?? undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza com localStorage, sistema externo
    setEstado(obterOuCriarEstadoLocal({ g, ref }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onComecar = useCallback(() => {
    setEstado((atual) => {
      if (!atual) return atual;
      const novo: EstadoPesquisaLocal = { ...atual, step: 1 };
      salvarEstadoLocal(novo);
      return novo;
    });
  }, []);

  const onVoltar = useCallback(() => {
    setEstado((atual) => {
      if (!atual || atual.step <= 0) return atual;
      const novo: EstadoPesquisaLocal = { ...atual, step: atual.step - 1 };
      salvarEstadoLocal(novo);
      return novo;
    });
  }, []);

  const onResponder = useCallback((step: number, answers: Record<string, unknown>) => {
    setEstado((atual) => {
      if (!atual) return atual;
      const respostas = Object.fromEntries(Object.entries(answers).filter(([, v]) => v !== undefined));
      const concluindoAgora = step === ULTIMO_STEP;
      const novo: EstadoPesquisaLocal = {
        ...atual,
        step: Math.min(step + 1, ULTIMO_STEP),
        respostas: { ...atual.respostas, ...respostas },
        concluida: concluindoAgora ? true : atual.concluida,
      };
      salvarEstadoLocal(novo);

      const falha = () => setFalhaEnvio(true);
      void enviarComRetry(
        "/api/pesquisa/resposta",
        { session_id: novo.sessionId, step, answers: respostas, g: novo.g, ref: novo.ref },
        falha,
      );
      if (concluindoAgora) {
        setAcabouDeConcluir(true);
        void enviarComRetry("/api/pesquisa/concluir", { session_id: novo.sessionId }, falha);
      }
      return novo;
    });
  }, []);

  if (!estado) return null;

  if (estado.concluida) {
    return <TelaFinal sessionId={estado.sessionId} g={estado.g} jaConcluida={!acabouDeConcluir} />;
  }

  return (
    <>
      {falhaEnvio ? (
        <p role="status" className="bg-aviso-fundo text-aviso-texto mx-auto mt-4 w-full max-w-[480px] rounded-campo px-4 py-2 text-center text-xs font-bold">
          Não conseguimos salvar sua última resposta agora. Continue: vamos tentar de novo.
        </p>
      ) : null}
      <PerguntaRouter estado={estado} onResponder={onResponder} onVoltar={onVoltar} onComecar={onComecar} />
    </>
  );
}
