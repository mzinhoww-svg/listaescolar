import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/Logo";
import { CheckIcon } from "./icons";

const NAV = [
  { label: "Visão geral", href: "/escola" },
  { label: "Minhas escolas" },
  { label: "Listas", current: true },
  { label: "Papelarias parceiras" },
  { label: "Administradores" },
  { label: "Minha conta", href: "/conta" },
] as const;

const STEPS = ["Dados da lista", "Itens", "Revisar e publicar"];

/** Moldura desktop do portal da escola (Escola08, 1280×800): barra lateral, título e passos. */
export function SchoolShell({ email, children }: { email: string | undefined; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1">
      <aside className="bg-tinta text-papel hidden w-[248px] shrink-0 flex-col gap-3 px-[18px] py-6 lg:flex">
        <Logo variant="horizontal-negativo" height={34} />
        <span className="bg-verde-certo text-tinta w-fit rounded-full px-3 py-1 text-[11px] font-extrabold">Escola</span>
        <nav aria-label="Portal da escola" className="mt-4 flex flex-col gap-1">
          {NAV.map((n) => {
            const cls = `rounded-xl px-3.5 py-2.5 text-[15px] font-bold ${"current" in n ? "bg-papel/10 text-papel" : "text-papel/70"}`;
            return "href" in n ? (
              <Link key={n.label} href={n.href} className={cls}>
                {n.label}
              </Link>
            ) : (
              <span key={n.label} aria-current={"current" in n ? "page" : undefined} className={cls}>
                {n.label}
              </span>
            );
          })}
        </nav>
        <p className="mt-auto flex items-center gap-3 text-xs font-semibold">
          <span className="bg-verde-certo text-tinta grid size-10 place-items-center rounded-full font-extrabold">
            {(email ?? "?").slice(0, 2).toUpperCase()}
          </span>
          <span className="break-all">{email ?? "indisponível"}</span>
        </p>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-5 px-6 py-8 lg:px-10">
        <p className="text-texto-3 text-xs font-bold">Escola / Listas / Nova / PDF</p>
        <h1 className="text-[32px] leading-[1.05] font-extrabold tracking-[-0.035em]">Enviar PDF da lista</h1>
        <ol className="flex items-center gap-3 text-sm font-bold">
          {STEPS.map((label, i) => (
            <li key={label} className="flex flex-1 items-center gap-3 last:flex-none">
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-extrabold ${
                  i === 0 ? "bg-verde-certo text-tinta" : i === 1 ? "bg-tinta text-papel" : "border-linha text-texto-3 border-2"
                }`}
              >
                {i === 0 ? <CheckIcon size={16} /> : i + 1}
              </span>
              <span className={i === 2 ? "text-texto-3" : ""}>{label}</span>
              {i < 2 ? <span aria-hidden="true" className={`h-0.5 flex-1 ${i === 0 ? "bg-verde-certo" : "bg-linha"}`} /> : null}
            </li>
          ))}
        </ol>
        {children}
      </main>
    </div>
  );
}
