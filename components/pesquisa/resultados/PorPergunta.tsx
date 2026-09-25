import type { PerguntaStats } from "@/lib/pesquisa/agregacao";

import { formatarPercentual } from "./formato";

type Props = { porPergunta: PerguntaStats[] };

/** Título de cada pergunta, igual ao texto exibido na pesquisa (components/pesquisa/PerguntaRouter.tsx). */
const TITULOS: Record<string, string> = {
  cidade: "Em que cidade você mora?",
  filhos: "Quantos filhos você tem na escola?",
  rede: "A escola deles é particular ou pública?",
  etapas: "Qual a escola e em que etapa estão?",
  recebimento: "Como a lista chegou para você em 2026?",
  onde_comprou: "Onde você comprou o material?",
  gasto: "Quanto você gastou por filho, só com material?",
  tempo: "Quanto tempo levou para resolver tudo?",
  comparou: "Você comparou preços antes de comprar?",
  dores: "O que mais deu trabalho? Escolha até 2.",
  usaria:
    "Imagine escolher a escola e a série e receber o carrinho pronto, com o preço comparado entre lojas. Você usaria?",
  canal: "E onde preferiria comprar?",
};

/** Contagem e percentual de cada opção, por pergunta, sobre quem respondeu aquela pergunta. */
export function PorPergunta({ porPergunta }: Props) {
  return (
    <section aria-label="Respostas por pergunta" className="flex flex-col gap-4">
      <h2 className="text-lg font-extrabold">Por pergunta</h2>
      {porPergunta.map((pergunta) => (
        <div key={pergunta.campo} className="border-linha rounded-card border bg-white p-4">
          <h3 className="text-tinta text-base font-bold">
            {TITULOS[pergunta.campo] ?? pergunta.campo}
          </h3>
          <p className="text-texto-3 mb-3 text-xs font-bold">{pergunta.respondentes} respostas</p>
          <div className="flex flex-col gap-2">
            {pergunta.opcoes.map((opcao) => (
              <div key={opcao.slug} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-texto-2">{opcao.rotulo}</span>
                <span className="text-tinta font-bold">
                  {opcao.contagem} ({formatarPercentual(opcao.percentual)})
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
