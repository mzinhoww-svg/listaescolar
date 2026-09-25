"use client";

import { useState } from "react";

/** "Copiar código": sem telefone do responsável não há conversa para abrir daqui (Ruling S14). */
export function CopyCode({ code }: { code: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
    } catch {
      setState("failed");
    }
  }
  return (
    <button type="button" onClick={copy} className="border-tinta text-tinta rounded-botao h-12 border-[1.5px] px-5 text-[14px] font-extrabold">
      {state === "copied" ? "Código copiado" : state === "failed" ? "Não foi possível copiar" : "Copiar código"}
    </button>
  );
}
