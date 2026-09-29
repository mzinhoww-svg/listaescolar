"use client";

import Link from "next/link";
import { useState } from "react";

type Item = { href: string; label: string };

/**
 * Menu do admin. No desktop fica sempre aberto na barra lateral; no celular vira botão "Menu" que recolhe a lista
 * (M34: a barra fixa de 248 px deixava 142 px de conteúdo em 390 px). Um único `<nav>` no DOM.
 */
export function AdminNav({ items, active }: { items: readonly Item[]; active: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="admin-menu"
        onClick={() => setOpen((v) => !v)}
        className="border-papel/40 text-papel rounded-botao ml-auto inline-flex min-h-11 items-center border-[1.5px] px-4 text-[14px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-verde-certo md:hidden"
      >
        {open ? "Fechar menu" : "Menu"}
      </button>
      <nav id="admin-menu" aria-label="Administração" className={`${open ? "flex" : "hidden"} w-full flex-col gap-1 md:flex md:w-auto`}>
        {items.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={n.href === active ? "page" : undefined}
            className={`focus-visible:outline-verde-certo rounded-campo inline-flex min-h-11 items-center px-3 py-2.5 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 ${n.href === active ? "bg-white/10" : "text-papel/70"}`}
          >
            {n.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
