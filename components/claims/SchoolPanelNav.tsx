"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import { useEscapeClose } from "@/components/ui/useEscapeClose";

type Item = { label: string; href: string; current?: boolean };

/**
 * Menu da área da escola. No desktop fica na barra lateral; no celular vira o botão "Menu" que recolhe a lista
 * (mesmo padrão do `AdminNav`; Esc fecha e devolve o foco). Um único `<nav>` no DOM.
 */
export function SchoolPanelNav({ items }: { items: readonly Item[] }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useEscapeClose(open, close, trigger);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls="school-menu"
        onClick={() => setOpen((v) => !v)}
        className="border-papel/40 text-papel rounded-botao focus-visible:outline-verde-certo ml-auto inline-flex min-h-11 items-center border-[1.5px] px-4 text-[14px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 lg:hidden"
      >
        {open ? "Fechar menu" : "Menu"}
      </button>
      <nav id="school-menu" aria-label="Portal da escola" className={`${open ? "flex" : "hidden"} w-full flex-col gap-1 lg:mt-4 lg:flex`}>
        {items.map((n) => (
          <Link
            key={n.label}
            href={n.href}
            aria-current={n.current ? "page" : undefined}
            className={`focus-visible:outline-verde-certo inline-flex min-h-11 items-center rounded-xl px-3.5 py-2.5 text-[15px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2 ${n.current ? "bg-papel/10 text-papel" : "text-papel/70"}`}
          >
            {n.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
