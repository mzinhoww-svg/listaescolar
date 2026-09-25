import type { Metadata } from "next";
import { Suspense } from "react";

import { Pesquisa } from "@/components/pesquisa/Pesquisa";

export const metadata: Metadata = {
  title: "Pesquisa: a lista de material escolar | ListaCerta",
  description:
    "São 12 perguntas rápidas, menos de 3 minutos. Suas respostas ajudam a criar um jeito mais fácil de resolver a lista da escola.",
};

export default function PesquisaPage() {
  return (
    <Suspense fallback={null}>
      <Pesquisa />
    </Suspense>
  );
}
