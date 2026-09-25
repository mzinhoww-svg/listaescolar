import type { ReactNode } from "react";

import { Logo } from "@/components/brand/Logo";
import { signOutAction } from "@/components/auth/sign-out-action";

import { NavLinks, type NavItem } from "./NavLinks";

type Props = { badge: string; nav: readonly NavItem[]; email: string | undefined; children: ReactNode };

/** Casca desktop das áreas de papelaria e admin (menu lateral Tinta, conteúdo Papel), como nas telas Pap04 e Admin09. */
export function PanelShell({ badge, nav, email, children }: Props) {
  const initials = (email ?? "?").slice(0, 2).toUpperCase();
  return (
    <div className="flex min-h-dvh flex-1 flex-col md:flex-row">
      <aside className="bg-tinta flex shrink-0 flex-col gap-5 px-4 py-5 md:w-[248px] md:px-[18px] md:py-7">
        <div className="px-1">
          <Logo variant="horizontal-negativo" height={32} />
        </div>
        <span className="bg-verde-certo text-tinta w-fit rounded-botao px-3 py-1 text-[12px] font-extrabold">{badge}</span>
        <NavLinks items={nav} />
        <div className="mt-auto flex items-center gap-3 px-1 pt-4 text-white">
          <span className="bg-verde-certo text-tinta grid size-10 shrink-0 place-items-center rounded-full text-[12px] font-extrabold">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold">{email ?? "indisponível"}</p>
            <form action={signOutAction}>
              <button type="submit" className="text-[12px] font-semibold text-white/70 underline">
                Sair
              </button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-5 py-8 md:px-10">{children}</main>
    </div>
  );
}

export const PANEL_NAV: readonly NavItem[] = [
  { href: "/papelaria", label: "Visão geral" },
  { href: "/papelaria/catalogo", label: "Catálogo" },
  { href: "/papelaria/areas", label: "Bairros atendidos" },
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
      ? "bg-[#d6f3e5] text-verde-fundo"
      : kind === "error"
        ? "bg-[#fde2e0] text-[#8a1c14]"
        : "bg-campo text-texto-2";
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`mb-4 rounded-campo px-4 py-3 text-[14px] font-bold ${tone}`}>
      {children}
    </p>
  );
}
