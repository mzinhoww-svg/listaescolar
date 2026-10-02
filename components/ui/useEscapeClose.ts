"use client";

import { useEffect, type RefObject } from "react";

/** Esc fecha o menu aberto e devolve o foco ao botão que o abriu (padrão de disclosure, WCAG 2.1.2/2.4.3). */
export function useEscapeClose(open: boolean, close: () => void, trigger: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      trigger.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close, trigger]);
}
