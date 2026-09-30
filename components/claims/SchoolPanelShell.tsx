import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/Logo";
import { SchoolPanelNav } from "@/components/claims/SchoolPanelNav";
import { SkipLink } from "@/components/site/SkipLink";

export type SchoolNavKey = "escolas" | "listas";

const NAV = [
  { key: "escolas", label: "Minhas escolas", href: "/escola" },
  { key: "listas", label: "Enviar lista", href: "/escola/listas/nova" },
  { key: "buscar", label: "Buscar escola", href: "/escolas" },
  { key: "conta", label: "Minha conta", href: "/conta" },
] as const;

type Props = {
  email: string | undefined;
  title: string;
  crumb: string;
  actions?: ReactNode;
  /** Item do menu da tela atual (padrão: Minhas escolas). */
  active?: SchoolNavKey;
  /** Caminho de volta acima do título (telas de segundo nível). */
  back?: { href: string; label: string };
  children: ReactNode;
};

/** Casca da área da escola (Escola03): barra lateral Tinta no desktop, cabeçalho com menu no celular, conteúdo Papel. Só links que existem. */
export function SchoolPanelShell({ email, title, crumb, actions, active = "escolas", back, children }: Props) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col lg:flex-row">
      <SkipLink />
      <aside className="bg-tinta text-papel flex shrink-0 flex-wrap items-center gap-3 px-[18px] py-4 lg:w-[248px] lg:flex-col lg:items-stretch lg:py-6">
        <Link href="/escola" aria-label="ListaCerta, painel da escola" className="focus-visible:outline-verde-certo inline-flex min-h-11 items-center focus-visible:outline-2 focus-visible:outline-offset-2"><Logo variant="horizontal-negativo" height={34} /></Link>
        <span className="bg-verde-certo text-tinta w-fit rounded-full px-3 py-1 text-[12px] font-extrabold">Escola</span>
        <SchoolPanelNav items={NAV.map((n) => ({ label: n.label, href: n.href, current: n.key === active }))} />
        <p className="mt-auto hidden items-center gap-3 text-xs font-semibold lg:flex">
          <span className="bg-verde-certo text-tinta grid size-10 place-items-center rounded-full font-extrabold">{(email ?? "?").slice(0, 2).toUpperCase()}</span>
          <span className="break-all">{email ?? "indisponível"}</span>
        </p>
      </aside>
      <main id="conteudo" className="flex min-w-0 flex-1 flex-col gap-5 px-6 py-8 lg:px-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            {back ? (
              <Link href={back.href} className="text-verde-fundo focus-visible:outline-verde-fundo -ml-2 inline-flex min-h-11 items-center px-2 text-[14px] font-extrabold underline focus-visible:outline-2 focus-visible:outline-offset-2">
                Voltar para {back.label}
              </Link>
            ) : null}
            <p className="text-texto-3 text-[13px] font-semibold">{crumb}</p>
            <h1 className="text-[28px] leading-[1.1] lg:text-[32px] lg:leading-[1.05] font-extrabold tracking-[-0.035em]">{title}</h1>
          </div>
          {actions}
        </header>
        {children}
      </main>
    </div>
  );
}
