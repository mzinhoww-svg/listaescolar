import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/Logo";

const WHY = [
  "Você mantém as listas oficiais da escola em um só lugar.",
  "Cada pedido é revisado pelo time ListaCerta antes de a escola ser verificada.",
  "Sem verificação, o perfil segue como cadastrado a partir do INEP.",
];

/** Moldura das telas do responsável (Escola01/02 adaptadas): coluna principal + "Por que reivindicar". Responsiva até 390. */
export function ClaimLayout({ inep, title, crumb, exit = "cancel", why = true, children }: { inep: string; title: string; crumb: string; /** `cancel` no formulário; `back` depois do envio (o pedido já existe e sair não o cancela). */ exit?: "cancel" | "back"; /** Sem o quadro "Por que administrar" quando a tela é um aviso (escola que já tem administrador). */ why?: boolean; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <header className="flex items-center justify-between gap-2 px-6 py-3 lg:px-10">
        <Link href="/" aria-label="ListaCerta, início" className="focus-visible:outline-verde-fundo flex min-h-11 w-[142px] shrink-0 items-center focus-visible:outline-2 focus-visible:outline-offset-2"><Logo variant="horizontal" height={32} /></Link>
        <Link href={`/escolas/${inep}`} className="focus-visible:outline-verde-fundo inline-flex min-h-11 items-center px-3 text-right text-[14px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2">
          {exit === "back" ? "Voltar ao perfil da escola" : "Cancelar"}
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-[1040px] flex-1 flex-col gap-5 px-6 pb-12 lg:px-10">
        <div>
          <p className="text-texto-3 text-[13px] font-semibold">{crumb}</p>
          <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em] lg:text-[32px]">{title}</h1>
        </div>
        <div className={`grid items-start gap-5 ${why ? "grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_320px]" : "grid-cols-[minmax(0,1fr)]"}`}>
          <div className="flex min-w-0 flex-col gap-5 rounded-[24px] bg-white p-6 lg:p-8">{children}</div>
          {why ? <aside className="bg-tinta text-papel flex flex-col gap-4 rounded-[24px] p-6">
            <p className="text-verde-certo text-[12px] font-extrabold tracking-[0.15em] uppercase">Por que administrar a página</p>
            <ul className="flex flex-col gap-3 text-[14px] leading-[1.4] font-bold">
              {WHY.map((t) => (
                <li key={t} className="flex gap-2.5"><span aria-hidden="true" className="text-verde-certo">✓</span>{t}</li>
              ))}
            </ul>
          </aside> : null}
        </div>
      </main>
    </div>
  );
}
