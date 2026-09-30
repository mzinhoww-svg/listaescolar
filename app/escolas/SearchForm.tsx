"use client";

import { useState } from "react";

import { CloseIcon, MagnifierIcon } from "@/components/schools/icons";
import { Button } from "@/components/ui/Button";

type Props = {
  defaultValue?: string;
  /** Bairro (filtro opcional, campo visível). */
  neighborhood?: string;
  /** Filtros a preservar no envio (rede, município). */
  preserve?: Record<string, string>;
  /** Campo Bairro visível (padrão). A landing o omite. */
  showNeighborhood?: boolean;
  submitLabel?: string;
  /** Botão abaixo do campo (celular): o campo ocupa a largura toda e o texto do botão cabe inteiro. */
  stacked?: boolean;
};

/**
 * Busca como `<form method="get">`: funciona sem JS. O JS só acrescenta o botão de limpar.
 * Não envia `pagina`: uma nova busca sempre começa na página 1.
 */
export function SearchForm({ defaultValue = "", neighborhood = "", preserve = {}, showNeighborhood = true, submitLabel = "Buscar", stacked = false }: Props) {
  const [value, setValue] = useState(defaultValue);
  return (
    <form method="get" action="/escolas" role="search">
      {Object.entries(preserve).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label htmlFor="q" className="sr-only">
        Buscar escola pelo nome ou pelo código da escola
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
          aria-describedby="q-hint"
          placeholder="Nome da escola ou código INEP"
          className="placeholder:text-texto-3 h-11 min-w-0 grow bg-transparent text-[15px] font-semibold outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {value ? (
          <Button variant="icon" onClick={() => setValue("")} aria-label="Limpar busca" className="text-texto-2 rounded-full">
            <CloseIcon />
          </Button>
        ) : null}
        {stacked ? null : (
          <button type="submit" className="bg-tinta text-papel focus-visible:outline-verde-fundo rounded-botao h-11 shrink-0 px-4 text-sm font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2">
            {submitLabel}
          </button>
        )}
      </div>
      <p id="q-hint" className="text-texto-3 mt-2 text-xs font-semibold">
        Código INEP: o número da escola no Censo Escolar.
      </p>
      {stacked ? (
        <button type="submit" className="bg-tinta text-papel focus-visible:outline-verde-fundo rounded-botao mt-2.5 flex h-12 w-full items-center justify-center text-[15px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2">
          {submitLabel}
        </button>
      ) : null}
      {showNeighborhood ? (
      <div className="mt-3 flex flex-col gap-1">
        <label htmlFor="bairro" className="text-texto-3 text-xs font-semibold">
          Bairro (opcional)
        </label>
        <input
          id="bairro"
          name="bairro"
          type="text"
          defaultValue={neighborhood}
          maxLength={100}
          autoComplete="off"
          placeholder="Ex.: Centro Sul"
          className="border-tinta focus-visible:outline-verde-fundo rounded-campo h-12 w-full border-[1.5px] bg-white px-3 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        />
      </div>
      ) : null}
    </form>
  );
}
