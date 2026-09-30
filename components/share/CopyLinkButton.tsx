"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { track } from "@/lib/analytics/track";

/** Copia o link curto; sem Clipboard API o texto do link segue selecionável ao lado. */
export function CopyLinkButton({ link, inep, gradeSlug }: { link: string; inep?: string; gradeSlug?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setState("copied");
      track("list_shared", { channel: "copy_link", ...(inep ? { school_inep: inep } : {}), ...(gradeSlug ? { grade_slug: gradeSlug } : {}) });
    } catch {
      setState("failed");
    }
  }
  return (
    <Button variant="outline" onClick={copy}>
      {state === "copied" ? "Link copiado" : state === "failed" ? "Selecione o link" : "Copiar link"}
      <span aria-live="polite" className="sr-only">
        {state === "copied" ? "Link copiado." : state === "failed" ? "Não foi possível copiar. Selecione o link acima." : ""}
      </span>
    </Button>
  );
}
