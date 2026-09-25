import type { ReactNode } from "react";

type Props = {
  onPrimario?: () => void;
  primarioLabel?: string;
  primarioDesabilitado?: boolean;
  primarioTipo?: "button" | "submit";
  secundario?: ReactNode;
};

/**
 * Barra de ações fixa no rodapé (uso com uma mão no celular): fundo Papel com
 * degradê por cima do conteúdo e respeito à safe-area do iOS.
 */
export function BarraAcoes({
  onPrimario,
  primarioLabel,
  primarioDesabilitado,
  primarioTipo = "button",
  secundario,
}: Props) {
  if (!primarioLabel && !secundario) return null;
  return (
    <div className="from-papel via-papel sticky bottom-0 -mx-5 mt-auto bg-gradient-to-t to-transparent px-5 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-col items-center gap-3">
        {primarioLabel ? (
          <button
            type={primarioTipo}
            onClick={onPrimario}
            disabled={primarioDesabilitado}
            className="bg-tinta text-papel rounded-botao focus-visible:outline-verde-fundo flex h-14 w-full items-center justify-center text-base font-extrabold shadow-[0_8px_24px_rgba(15,27,45,0.18)] transition-[transform,opacity] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.99] disabled:opacity-40 disabled:shadow-none"
          >
            {primarioLabel}
          </button>
        ) : null}
        {secundario}
      </div>
    </div>
  );
}
