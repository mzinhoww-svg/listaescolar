"use client";

import { useState } from "react";

import { CloseIcon, MagnifierIcon } from "@/components/schools/icons";

type Props = {
  defaultValue?: string;
  /** Filtros a preservar no envio (rede, bairro, município). */
  preserve?: Record<string, string>;
};

/**
 * Busca como `<form method="get">`: funciona sem JS. O JS só acrescenta o botão de limpar.
 * Não envia `pagina`: uma nova busca sempre começa na página 1.
 */
export function SearchForm({ defaultValue = "", preserve = {} }: Props) {
  const [value, setValue] = useState(defaultValue);
  return (
    <form method="get" action="/escolas" role="search">
      {Object.entries(preserve).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label htmlFor="q" className="sr-only">
        Buscar escola pelo nome ou INEP
      </label>
      <div className="focus-within:outline-verde-fundo border-tinta flex h-[52px] items-center gap-2 rounded-full border-[1.5px] bg-white pr-1.5 pl-[18px] focus-within:outline-2 focus-within:outline-offset-2">
        <span className="text-tinta" aria-hidden>
          <MagnifierIcon />
        </span>
        <input
          id="q"
          name="q"
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={100}
          autoComplete="off"
          placeholder="Nome da escola ou INEP"
          className="placeholder:text-texto-3 min-w-0 grow bg-transparent text-[15px] font-semibold outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {value ? (
          <button
            type="button"
            onClick={() => setValue("")}
            aria-label="Limpar busca"
            className="text-texto-2 flex size-9 shrink-0 items-center justify-center rounded-full"
          >
            <CloseIcon />
          </button>
        ) : null}
        <button type="submit" className="bg-tinta text-papel rounded-botao h-10 shrink-0 px-4 text-sm font-extrabold">
          Buscar
        </button>
      </div>
    </form>
  );
}
