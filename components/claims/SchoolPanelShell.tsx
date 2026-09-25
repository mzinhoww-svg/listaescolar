import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/Logo";

const NAV = [
  { label: "Visão geral", href: "/escola" },
  { label: "Minhas escolas", href: "/escola", current: true },
  { label: "Buscar escola", href: "/escolas" },
  { label: "Minha conta", href: "/conta" },
] as const;

/** Casca desktop da área da escola (Escola03): barra lateral Tinta, conteúdo Papel. Só links que existem. */
export function SchoolPanelShell({ email, title, crumb, actions, children }: { email: string | undefined; title: string; crumb: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1">
      <aside className="bg-tinta text-papel hidden w-[248px] shrink-0 flex-col gap-3 px-[18px] py-6 lg:flex">
        <Logo variant="horizontal-negativo" height={34} />
        <span className="bg-verde-certo text-tinta w-fit rounded-full px-3 py-1 text-[11px] font-extrabold">Escola</span>
        <nav aria-label="Portal da escola" className="mt-4 flex flex-col gap-1">
          {NAV.map((n) => (
            <Link key={n.label} href={n.href} aria-current={"current" in n ? "page" : undefined} className={`rounded-xl px-3.5 py-2.5 text-[15px] font-bold ${"current" in n ? "bg-papel/10 text-papel" : "text-papel/70"}`}>
              {n.label}
            </Link>
          ))}
        </nav>
        <p className="mt-auto flex items-center gap-3 text-xs font-semibold">
          <span className="bg-verde-certo text-tinta grid size-10 place-items-center rounded-full font-extrabold">{(email ?? "?").slice(0, 2).toUpperCase()}</span>
          <span className="break-all">{email ?? "indisponível"}</span>
        </p>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-5 px-6 py-8 lg:px-10">
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
