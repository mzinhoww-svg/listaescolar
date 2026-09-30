import Link from "next/link";

import { Logo } from "@/components/brand/Logo";

const FOCUS = "focus-visible:outline-verde-fundo focus-visible:outline-2 focus-visible:outline-offset-2";

/** Barra de topo das telas públicas da papelaria (cadastro e perfil): logo para a home e "Voltar", ambos com alvo de 44 px (UX-077, UX-086). */
export function EntryBar({ backHref = "/", backLabel = "Voltar ao início" }: { backHref?: string; backLabel?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Link href="/" aria-label="ListaCerta, página inicial" className={`flex min-h-11 items-center rounded ${FOCUS}`}>
        <Logo variant="horizontal" height={32} />
      </Link>
      <Link href={backHref} className={`text-tinta flex min-h-11 items-center rounded px-2 text-[14px] font-extrabold underline underline-offset-4 ${FOCUS}`}>
        {backLabel}
      </Link>
    </div>
  );
}
