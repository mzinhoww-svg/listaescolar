import Link from "next/link";

import { Tela } from "./Tela";

type Props = { onComecar: () => void };

/** Tela 0: boas-vindas da pesquisa (textos exatos da spec §4). */
export function TelaBoasVindas({ onComecar }: Props) {
  return (
    <Tela
      titulo="Como foi comprar a lista de material escolar este ano?"
      descricao="São 12 perguntas rápidas, menos de 3 minutos. Suas respostas ajudam a criar um jeito mais fácil de resolver a lista da escola."
      onContinuar={onComecar}
      continuarLabel="Começar"
    >
      <div className="border-linha rounded-card flex items-start gap-3 border bg-white px-4 py-4 shadow-[0_1px_2px_rgba(15,27,45,0.04)]">
        <span
          aria-hidden
          className="bg-campo text-verde-fundo flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              d="M12 3.5 5 6.2v5.1c0 4.4 3 8.2 7 9.2 4-1 7-4.8 7-9.2V6.2L12 3.5Z"
              strokeLinejoin="round"
            />
            <path d="m9.2 12.2 1.9 1.9 3.8-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <p className="text-texto-2 text-[15px] leading-relaxed font-semibold">
          Não pedimos nenhum dado do seu filho. Suas respostas são anônimas.{" "}
          <Link
            href="/pesquisa/privacidade"
            className="text-verde-fundo focus-visible:outline-verde-fundo hover:text-tinta rounded-sm underline underline-offset-4 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Como usamos seus dados
          </Link>
        </p>
      </div>
    </Tela>
  );
}
