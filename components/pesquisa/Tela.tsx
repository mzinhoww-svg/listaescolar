import type { ReactNode } from "react";

import { Progresso } from "./Progresso";

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

/** Casca de uma tela da pesquisa: progresso, voltar, título, corpo e ações. */
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
    <section aria-live="polite" className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-6 px-5 py-8">
      {progresso ? <Progresso atual={progresso.atual} total={progresso.total} /> : null}
      {onVoltar ? (
        <button type="button" onClick={onVoltar} className="text-texto-2 self-start text-sm font-bold">
          ← Voltar
        </button>
      ) : null}
      <div className="flex flex-col gap-2">
        <h1 className="text-[26px] leading-[1.15] font-extrabold tracking-[-0.02em]">{titulo}</h1>
        {descricao ? <div className="text-texto-2 text-base leading-relaxed">{descricao}</div> : null}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
      {onContinuar ? (
        <button
          type="button"
          onClick={onContinuar}
          disabled={continuarDesabilitado}
          className="bg-tinta text-papel rounded-botao mt-2 flex h-14 w-full items-center justify-center text-base font-extrabold disabled:opacity-40"
        >
          {continuarLabel}
        </button>
      ) : null}
      {onPular ? (
        <button
          type="button"
          onClick={onPular}
          className="text-texto-2 self-center text-sm font-bold underline underline-offset-2"
        >
          Pular
        </button>
      ) : null}
    </section>
  );
}
