import type { FunilEntrada } from "@/lib/pesquisa/agregacao";

type Props = { funil: FunilEntrada[] };

/** Funil por etapa (0 a 12) em barras horizontais; largura proporcional ao maior valor. */
export function Funil({ funil }: Props) {
  const maximo = Math.max(1, ...funil.map((f) => f.sessoes));

  return (
    <section aria-label="Funil por etapa" className="flex flex-col gap-3">
      <h2 className="text-lg font-extrabold">Funil</h2>
      <div className="flex flex-col gap-2">
        {funil.map((entrada) => {
          const largura = Math.round((entrada.sessoes / maximo) * 100);
          return (
            <div key={entrada.step} className="flex items-center gap-3">
              <span className="text-texto-2 w-16 shrink-0 text-xs font-bold">Etapa {entrada.step}</span>
              <div className="bg-campo h-6 flex-1 overflow-hidden rounded-full">
                <div className="bg-verde-fundo h-full rounded-full" style={{ width: `${largura}%` }} />
              </div>
              <span className="text-tinta w-8 shrink-0 text-right text-xs font-bold">{entrada.sessoes}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
