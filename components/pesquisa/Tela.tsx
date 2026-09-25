import type { ReactNode } from "react";

import { BarraAcoes } from "./BarraAcoes";
import { Cabecalho } from "./Cabecalho";
import { Progresso } from "./Progresso";
import styles from "./pesquisa.module.css";

type Props = {
  titulo: string;
  descricao?: ReactNode;
  progresso?: { atual: number; total: number };
  onVoltar?: () => void;
  onContinuar?: () => void;
  continuarLabel?: string;
  continuarDesabilitado?: boolean;
  onPular?: () => void;
  children?: ReactNode;
};

/** Casca de uma tela da pesquisa: cabeçalho com wordmark, progresso, voltar, título, corpo e ações. */
export function Tela({
  titulo,
  descricao,
  progresso,
  onVoltar,
  onContinuar,
  continuarLabel = "Continuar",
  continuarDesabilitado,
  onPular,
  children,
}: Props) {
  return (
    <section
      aria-live="polite"
      className={`${styles.entrar} mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-1 flex-col gap-5 px-5 pt-3`}
    >
      <Cabecalho direita={progresso ? `${progresso.atual} de ${progresso.total}` : undefined} />
      {progresso ? <Progresso atual={progresso.atual} total={progresso.total} /> : null}
      {onVoltar ? (
        <button
          type="button"
          onClick={onVoltar}
          className="text-texto-2 focus-visible:outline-verde-fundo -ml-2 flex h-11 items-center gap-1 self-start rounded-full px-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 active:opacity-70"
        >
          <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12.5 4.5 7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Voltar
        </button>
      ) : null}
      <div className="flex flex-col gap-2.5">
        <h1 className="text-tinta text-[26px] leading-[1.15] font-extrabold tracking-[-0.02em] text-balance">
          {titulo}
        </h1>
        {descricao ? <div className="text-texto-2 text-[17px] leading-relaxed">{descricao}</div> : null}
      </div>
      <div className="flex flex-col gap-4 pb-2">{children}</div>
      <BarraAcoes
        onPrimario={onContinuar}
        primarioLabel={onContinuar ? continuarLabel : undefined}
        primarioDesabilitado={continuarDesabilitado}
        secundario={
          onPular ? (
            <button
              type="button"
              onClick={onPular}
              className="text-texto-2 focus-visible:outline-verde-fundo flex h-11 items-center rounded-full px-4 text-sm font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 active:opacity-70"
            >
              Pular
            </button>
          ) : undefined
        }
      />
    </section>
  );
}
