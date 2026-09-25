"use client";

import { useState } from "react";

/** Copia o link curto; sem Clipboard API o texto do link segue selecionável ao lado. */
export function CopyLinkButton({ link }: { link: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setState("copied");
    } catch {
      setState("failed");
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-botao border-tinta text-tinta focus-visible:outline-verde-fundo inline-flex h-11 items-center justify-center border-[1.5px] px-4 text-sm font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {state === "copied" ? "Link copiado" : state === "failed" ? "Selecione o link" : "Copiar link"}
      <span aria-live="polite" className="sr-only">
        {state === "copied" ? "Link copiado." : ""}
      </span>
    </button>
  );
}
