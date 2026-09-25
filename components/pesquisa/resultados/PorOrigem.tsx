import type { OrigemStats } from "@/lib/pesquisa/agregacao";

type Props = { porOrigem: OrigemStats[] };

/** Iniciadas e completas por `source_group`; `null` aparece como "sem origem". */
export function PorOrigem({ porOrigem }: Props) {
  return (
    <section aria-label="Por origem" className="flex flex-col gap-3">
      <h2 className="text-lg font-extrabold">Por origem</h2>
      <table className="border-linha w-full border-collapse overflow-hidden rounded-lg border text-sm">
        <thead>
          <tr className="bg-campo text-left">
            <th className="px-3 py-2 font-bold">Origem</th>
            <th className="px-3 py-2 font-bold">Iniciadas</th>
            <th className="px-3 py-2 font-bold">Completas</th>
          </tr>
        </thead>
        <tbody>
          {porOrigem.map((linha) => (
            <tr key={linha.sourceGroup ?? "__sem_origem__"} className="border-linha border-t">
              <td className="px-3 py-2">{linha.sourceGroup ?? "sem origem"}</td>
              <td className="px-3 py-2">{linha.iniciadas}</td>
              <td className="px-3 py-2">{linha.completas}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
