import type { CartaoStats } from "@/lib/pesquisa/agregacao";

import { formatarPercentual, formatarTempoMinutoSegundo } from "./formato";

type Props = { cartoes: CartaoStats };

/** Seis números-chave da pesquisa (spec seção 8 / critérios de sucesso da seção 1). */
export function Cartoes({ cartoes }: Props) {
  const itens: { rotulo: string; valor: string }[] = [
    { rotulo: "Iniciadas", valor: String(cartoes.iniciadas) },
    { rotulo: "Completas", valor: String(cartoes.completas) },
    { rotulo: "Taxa de conclusão", valor: formatarPercentual(cartoes.taxaConclusao) },
    { rotulo: "Tempo mediano", valor: formatarTempoMinutoSegundo(cartoes.tempoMedianoSegundos) },
    { rotulo: "Leads", valor: String(cartoes.leads) },
    { rotulo: "Taxa de lead", valor: formatarPercentual(cartoes.taxaLead) },
  ];

  return (
    <section aria-label="Números gerais" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {itens.map((item) => (
        <div key={item.rotulo} className="border-linha rounded-card flex flex-col gap-1 border bg-white p-4">
          <p className="text-texto-3 text-xs font-bold tracking-wide uppercase">{item.rotulo}</p>
          <p className="text-tinta text-2xl font-extrabold">{item.valor}</p>
        </div>
      ))}
    </section>
  );
}
