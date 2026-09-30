import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";
import { signOutAction } from "@/components/auth/sign-out-action";
import { SkipLink } from "@/components/site/SkipLink";

import { NavLinks, type NavItem } from "./NavLinks";

type Props = { badge: string; nav: readonly NavItem[]; email: string | undefined; children: ReactNode };

/** Casca desktop das áreas de papelaria e admin (menu lateral Tinta, conteúdo Papel), como nas telas Pap04 e Admin09. */
export function PanelShell({ badge, nav, email, children }: Props) {
  const initials = (email ?? "?").slice(0, 2).toUpperCase();
  return (
    <div className="flex min-h-dvh flex-1 flex-col md:flex-row">
      <SkipLink />
      <aside className="bg-tinta flex shrink-0 flex-row flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 md:w-[248px] md:flex-col md:items-stretch md:gap-5 md:px-[18px] md:py-7">
        <header className="order-1 px-1 md:order-1">
          <Link href="/" aria-label="ListaCerta, página inicial" className="flex min-h-11 items-center rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-verde-certo">
            <Logo variant="horizontal-negativo" height={32} />
          </Link>
        </header>
        <span className="bg-verde-certo text-tinta order-2 w-fit rounded-botao px-3 py-1 text-[12px] font-extrabold md:order-2">{badge}</span>
        <div className="order-3 ml-auto flex items-center gap-2 text-white md:order-4 md:mt-auto md:ml-0 md:gap-3 md:px-1 md:pt-4">
          <span className="bg-verde-certo text-tinta grid size-10 shrink-0 place-items-center rounded-full text-[12px] font-extrabold">
            {initials}
          </span>
          <div className="min-w-0 md:flex-1">
            <p className="hidden truncate text-[13px] font-bold md:block">{email ?? "indisponível"}</p>
            <form action={signOutAction}>
              <Button type="submit" variant="outline" className="!h-11 !border-white/40 !px-4 !text-[13px] !text-white">
                Sair
              </Button>
            </form>
          </div>
        </div>
        <NavLinks items={nav} />
      </aside>
      <main id="conteudo" className="min-w-0 flex-1 px-5 py-8 md:px-10">{children}</main>
    </div>
  );
}

export const PANEL_NAV: readonly NavItem[] = [
  { href: "/papelaria", label: "Visão geral" },
  { href: "/papelaria/leads", label: "Leads" },
  { href: "/papelaria/catalogo", label: "Catálogo" },
  { href: "/papelaria/areas", label: "Bairros atendidos" },
  { href: "/papelaria/creditos", label: "Créditos e plano" },
  { href: "/papelaria/desempenho", label: "Desempenho" },
];

export function PageHeader({ crumb, title, children }: { crumb: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-texto-3 text-[13px] font-semibold">{crumb}</p>
        <h1 className="text-[32px] leading-[1.1] font-extrabold tracking-[-0.035em]">{title}</h1>
      </div>
      {children}
    </header>
  );
}

export function Notice({ kind, children }: { kind: "ok" | "error" | "info"; children: ReactNode }) {
  const tone =
    kind === "ok"
      ? "bg-verde-certo/20 text-verde-fundo"
      : kind === "error"
        ? "bg-erro-fundo text-erro-texto"
        : "bg-campo text-texto-2";
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`mb-4 rounded-campo px-4 py-3 text-[14px] font-bold ${tone}`}>
      {children}
    </p>
  );
}
