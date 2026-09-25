import Link from "next/link";

import { buildSearchQuery } from "@/features/schools/search/query";
import type { SearchInput } from "@/features/schools/search/types";

const BTN =
  "rounded-botao focus-visible:outline-verde-fundo flex h-11 items-center justify-center px-5 text-sm font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2";

export function Pagination({ input, page, pageCount }: { input: SearchInput; page: number; pageCount: number }) {
  if (pageCount <= 1) return null;
  const href = (p: number) => `/escolas${buildSearchQuery(input, { page: p })}`;
  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev" className={`${BTN} border-tinta border-[1.5px]`}>
          Anterior
        </Link>
      ) : (
        <span aria-hidden className="w-24" />
      )}
      <span className="text-texto-2 text-[13px] font-semibold">
        Página {page} de {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={href(page + 1)} rel="next" className={`${BTN} bg-tinta text-papel`}>
          Próxima
        </Link>
      ) : (
        <span aria-hidden className="w-24" />
      )}
    </nav>
  );
}
