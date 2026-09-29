import type { ReactNode } from "react";

import { Logo } from "@/components/brand/Logo";
import { SchoolPanelNav } from "@/components/claims/SchoolPanelNav";
import { SkipLink } from "@/components/site/SkipLink";

const NAV = [
  { label: "Visão geral", href: "/escola" },
  { label: "Minhas escolas", href: "/escola", current: true },
  { label: "Buscar escola", href: "/escolas" },
  { label: "Minha conta", href: "/conta" },
] as const;

/** Casca desktop da área da escola (Escola03): barra lateral Tinta, conteúdo Papel. Só links que existem. */
export function SchoolPanelShell({ email, title, crumb, actions, children }: { email: string | undefined; title: string; crumb: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col lg:flex-row">
      <SkipLink />
      <aside className="bg-tinta text-papel flex shrink-0 flex-wrap items-center gap-3 px-[18px] py-4 lg:w-[248px] lg:flex-col lg:items-stretch lg:py-6">
        <Logo variant="horizontal-negativo" height={34} />
        <span className="bg-verde-certo text-tinta w-fit rounded-full px-3 py-1 text-[12px] font-extrabold">Escola</span>
        <SchoolPanelNav items={NAV} />
        <p className="mt-auto hidden items-center gap-3 text-xs font-semibold lg:flex">
          <span className="bg-verde-certo text-tinta grid size-10 place-items-center rounded-full font-extrabold">{(email ?? "?").slice(0, 2).toUpperCase()}</span>
          <span className="break-all">{email ?? "indisponível"}</span>
        </p>
      </aside>
      <main id="conteudo" className="flex min-w-0 flex-1 flex-col gap-5 px-6 py-8 lg:px-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-texto-3 text-[13px] font-semibold">{crumb}</p>
            <h1 className="text-[32px] leading-[1.05] font-extrabold tracking-[-0.035em]">{title}</h1>
          </div>
          {actions}
        </header>
        {children}
      </main>
    </div>
  );
}
