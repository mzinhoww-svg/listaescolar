import Link from "next/link";

import { Logo } from "@/components/brand/Logo";

const NAV = [
  { href: "/admin", label: "Visão geral" },
  { href: "/admin/importacoes", label: "Importações" },
  { href: "/admin/reivindicacoes", label: "Reivindicações" },
  { href: "/admin/revisao", label: "Revisão" },
  { href: "/admin/papelarias", label: "Papelarias" },
] as const;

type Props = {
  active: "/admin" | "/admin/importacoes" | "/admin/papelarias" | "/admin/reivindicacoes" | "/admin/revisao";
  /** `null`: esconde o rodapé de usuário (tela de carregamento, antes de saber quem é). */
  email: string | null | undefined;
  breadcrumb: string;
  title: string;
  /** Ações ao lado do título (busca, voltar). */
  actions?: React.ReactNode;
  children: React.ReactNode;
};

/** Casca do admin: barra lateral escura e área de conteúdo, como nas telas Admin02/03. */
export function AdminShell({ active, email, breadcrumb, title, actions, children }: Props) {
  const initials = (email ?? "?").slice(0, 2).toUpperCase();
  return (
    <div className="flex min-h-screen flex-1">
      <aside className="bg-tinta text-papel flex w-[248px] shrink-0 flex-col gap-6 px-6 py-7">
        <Logo variant="horizontal-negativo" height={36} />
        <span className="bg-verde-certo text-tinta w-fit rounded-botao px-3 py-0.5 text-xs font-extrabold">
          Admin interno
        </span>
        <nav aria-label="Administração" className="flex flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={n.href === active ? "page" : undefined}
              className={`rounded-campo px-3 py-2.5 text-[15px] font-semibold ${n.href === active ? "bg-white/10" : "text-papel/70"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        {email === null ? null : (
          <div className="mt-auto flex items-center gap-3">
            <span className="bg-verde-certo text-tinta flex size-10 items-center justify-center rounded-full text-xs font-extrabold">
              {initials}
            </span>
            <span className="truncate text-[13px]">{email ?? "indisponível"}</span>
          </div>
        )}
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-6 px-10 py-9">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-texto-3 text-[13px] font-semibold">{breadcrumb}</p>
            <h1 className="text-[32px] leading-[1.1] font-extrabold tracking-[-0.035em]">{title}</h1>
          </div>
          {actions}
        </header>
        {children}
      </main>
    </div>
  );
}
