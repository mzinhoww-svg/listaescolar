import {
  CIDADE,
  COMPAROU,
  DORES,
  DORES_MAX_SELECIONADAS,
  FILHOS,
  GASTO,
  ONDE_COMPROU,
  RECEBIMENTO,
  REDE,
  TEMPO,
} from "@/lib/pesquisa/perguntas";
import type { EstadoPesquisaLocal } from "@/lib/pesquisa/sessao";

import { PerguntaCompraIdeal } from "./PerguntaCompraIdeal";
import { PerguntaEscolaEtapas } from "./PerguntaEscolaEtapas";
import { PerguntaMultiplaSimples } from "./PerguntaMultiplaSimples";
import { PerguntaUnicaSimples } from "./PerguntaUnicaSimples";
import { PerguntaUsariaCanal } from "./PerguntaUsariaCanal";
import { TelaBoasVindas } from "./TelaBoasVindas";

type Props = {
  estado: EstadoPesquisaLocal;
  onResponder: (step: number, answers: Record<string, unknown>) => void;
  onVoltar: () => void;
  onComecar: () => void;
};

function texto(respostas: Record<string, unknown>, campo: string): string | undefined {
  const v = respostas[campo];
  return typeof v === "string" ? v : undefined;
}

function lista(respostas: Record<string, unknown>, campo: string): string[] | undefined {
  const v = respostas[campo];
  return Array.isArray(v) ? (v as string[]) : undefined;
}

function booleano(respostas: Record<string, unknown>, campo: string): boolean | undefined {
  const v = respostas[campo];
  return typeof v === "boolean" ? v : undefined;
}

/** Escolhe a tela a renderizar a partir do step atual (0 a 12). */
export function PerguntaRouter({ estado, onResponder, onVoltar, onComecar }: Props) {
  const r = estado.respostas;
  const unica = (
    step: number,
    campo: string,
    titulo: string,
    opcoes: Parameters<typeof PerguntaUnicaSimples>[0]["opcoes"],
  ) => (
    <PerguntaUnicaSimples
      step={step}
      campo={campo}
      titulo={titulo}
      opcoes={opcoes}
      valorAtual={texto(r, campo)}
      onResponder={onResponder}
      onVoltar={onVoltar}
    />
  );

  switch (estado.step) {
    case 0:
      return <TelaBoasVindas onComecar={onComecar} />;
    case 1:
      return unica(1, "cidade", "Em que cidade você mora?", CIDADE);
    case 2:
      return unica(2, "filhos", "Quantos filhos você tem na escola?", FILHOS);
    case 3:
      return unica(3, "rede", "A escola deles é particular ou pública?", REDE);
    case 4:
      return (
        <PerguntaEscolaEtapas
          step={4}
          escolaAtual={texto(r, "escola")}
          etapasAtuais={lista(r, "etapas")}
          onResponder={onResponder}
          onVoltar={onVoltar}
        />
      );
    case 5:
      return unica(5, "recebimento", "Como a lista chegou para você em 2026?", RECEBIMENTO);
    case 6:
      return (
        <PerguntaMultiplaSimples
          step={6}
          campo="onde_comprou"
          titulo="Onde você comprou o material?"
          opcoes={ONDE_COMPROU}
          valoresAtuais={lista(r, "onde_comprou")}
          onResponder={onResponder}
          onVoltar={onVoltar}
        />
      );
    case 7:
      return unica(7, "gasto", "Quanto você gastou por filho, só com material?", GASTO);
    case 8:
      return unica(8, "tempo", "Quanto tempo levou para resolver tudo?", TEMPO);
    case 9:
      return unica(9, "comparou", "Você comparou preços antes de comprar?", COMPAROU);
    case 10:
      return (
        <PerguntaMultiplaSimples
          step={10}
          campo="dores"
          titulo="O que mais deu trabalho? Escolha até 2."
          opcoes={DORES}
          max={DORES_MAX_SELECIONADAS}
          valoresAtuais={lista(r, "dores")}
          onResponder={onResponder}
          onVoltar={onVoltar}
        />
      );
    case 11:
      return (
        <PerguntaUsariaCanal
          step={11}
          usariaAtual={texto(r, "usaria")}
          canalAtual={texto(r, "canal")}
          onResponder={onResponder}
          onVoltar={onVoltar}
        />
      );
    case 12:
      return (
        <PerguntaCompraIdeal
          step={12}
          compraIdealAtual={texto(r, "compra_ideal")}
          podeCitarAtual={booleano(r, "pode_citar")}
          onResponder={onResponder}
          onVoltar={onVoltar}
        />
      );
    default:
      return null;
  }
}
