import Link from "next/link";

import { Tela } from "./Tela";

type Props = { onComecar: () => void };

/** Tela 0: boas-vindas da pesquisa. */
export function TelaBoasVindas({ onComecar }: Props) {
  return (
    <Tela
      titulo="Como foi comprar a lista de material escolar este ano?"
      descricao="São 12 perguntas rápidas, menos de 3 minutos. Suas respostas ajudam a criar um jeito mais fácil de resolver a lista da escola."
      onContinuar={onComecar}
      continuarLabel="Começar"
    >
      <p className="bg-campo text-texto-2 rounded-campo px-4 py-3 text-sm font-semibold">
        Não pedimos nenhum dado do seu filho. Suas respostas são anônimas.{" "}
        <Link href="/pesquisa/privacidade" className="text-verde-fundo underline underline-offset-2">
          Como usamos seus dados
        </Link>
      </p>
    </Tela>
  );
}
