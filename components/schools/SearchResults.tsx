import Link from "next/link";

import type { SearchInput, SearchResult } from "@/features/schools/search/types";

import { foundLabel } from "./format";
import { Pagination } from "./Pagination";
import { SchoolCard } from "./SchoolCard";

type Results = Extract<SearchResult, { kind: "results" }>;

const EXIT = "text-verde-fundo focus-visible:outline-verde-fundo flex min-h-11 items-center text-[14px] font-extrabold underline focus-visible:outline-2 focus-visible:outline-offset-2";

export function EmptyState({ tooShort }: { tooShort: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[22px] border-[1.5px] border-dashed border-linha-tracejada p-[18px]" role="status">
      <p className="text-[15px] font-extrabold">{tooShort ? "Digite um pouco mais" : "Nenhuma escola encontrada"}</p>
      <p className="text-texto-2 text-[13px] leading-[1.4] font-medium">
        {tooShort
          ? "Use pelo menos 2 letras do nome da escola, ou o INEP de 8 números."
          : "Confira a grafia, tente só parte do nome ou o INEP de 8 números, ou remova o filtro de rede."}
      </p>
      {tooShort ? null : (
        <ul className="mt-1 flex flex-col">
          <li>
            <Link href="/enviar-lista" className={EXIT}>
              Enviar a lista da escola
            </Link>
          </li>
          <li>
            <Link href="/escolas" className={EXIT}>
              Ver escolas de Cuiabá
            </Link>
          </li>
        </ul>
      )}
    </div>
  );
}

export function SearchResults({ input, result }: { input: SearchInput; result: Results }) {
  if (result.schools.length === 0) return <EmptyState tooShort={input.qTooShort} />;
  return (
    <section aria-labelledby="resultados" className="flex flex-col gap-4">
      <h2 id="resultados" className="text-[26px] leading-[1.1] font-extrabold tracking-[-0.03em]">
        {foundLabel(result.total)}
      </h2>
      <ul className="flex flex-col gap-2.5">
        {result.schools.map((s) => (
          <SchoolCard key={s.id} school={s} />
        ))}
      </ul>
      <Pagination input={input} page={result.page} pageCount={result.pageCount} />
    </section>
  );
}
