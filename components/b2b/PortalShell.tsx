import type { ReactNode } from "react";

import { signOutAction } from "@/components/auth/sign-out-action";
import { Logo } from "@/components/brand/Logo";
import { NavLinks, type NavItem } from "@/components/stationeries/NavLinks";
import type { B2bPartnerStatus } from "@/features/b2b/states";

import { PARTNER_STATUS_LABEL, PartnerStatusBadge } from "./StatusBadge";

// Casca do portal B2B (`/b2b`), no padrão de `components/stationeries/PanelShell.tsx`: barra lateral Tinta, área
// de conteúdo Papel. Nav SÓ com o que existe nesta fatia (Ruling S24 · Planejamento): Widget/Webhooks entraram na
// S25; Campanhas/Insights (marca) e Faturamento (todo tipo) entram agora, na S26.

export const B2B_NAV: readonly NavItem[] = [
  { href: "/b2b", label: "Visão geral" },
  { href: "/b2b/api", label: "API e chaves" },
  { href: "/b2b/campanhas", label: "Campanhas" },
  { href: "/b2b/insights", label: "Insights" },
  { href: "/b2b/faturamento", label: "Faturamento" },
  { href: "/b2b/docs", label: "Documentação" },
  { href: "/b2b/widget", label: "Widget" },
  { href: "/b2b/webhooks", label: "Webhooks" },
  { href: "/b2b/conta", label: "Conta" },
];

type Props = { tradeName: string; status: B2bPartnerStatus; email: string | undefined; children: ReactNode };

function StatusBanner({ status }: { status: B2bPartnerStatus }) {
  if (status === "pending") {
    return (
      <p role="status" className="bg-campo text-texto-2 rounded-campo px-4 py-3 text-[14px] font-bold">
        Cadastro em análise. Você recebe acesso a chaves depois da aprovação.
      </p>
    );
  }
  if (status === "rejected") {
    return (
      <p role="alert" className="bg-[#fde2e0] text-[#8a1c14] rounded-campo px-4 py-3 text-[14px] font-bold">
        Cadastro recusado. Veja o motivo em Conta.
      </p>
    );
  }
  if (status === "suspended") {
    return (
      <p role="alert" className="bg-[#fde2e0] text-[#8a1c14] rounded-campo px-4 py-3 text-[14px] font-bold">
        Conta suspensa: as chaves foram revogadas e o portal está somente leitura.
      </p>
    );
  }
  return null;
}

export function PortalShell({ tradeName, status, email, children }: Props) {
  const initials = (email ?? "?").slice(0, 2).toUpperCase();
  return (
    <div className="flex min-h-dvh flex-1 flex-col md:flex-row">
      <aside className="bg-tinta flex shrink-0 flex-col gap-5 px-4 py-5 md:w-[248px] md:px-[18px] md:py-7">
        <div className="px-1">
          <Logo variant="horizontal-negativo" height={32} />
        </div>
        <span className="bg-verde-certo text-tinta w-fit rounded-botao px-3 py-1 text-[12px] font-extrabold">Parceiros B2B</span>
        <NavLinks items={B2B_NAV} />
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
      <main className="min-w-0 flex-1 px-5 py-8 md:px-10">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-texto-3 text-[13px] font-semibold">Portal de parceiros · {tradeName}</p>
          </div>
          <PartnerStatusBadge status={status} />
        </header>
        {status === "active" || status === "sandbox" ? null : (
          <div className="mb-6">
            <StatusBanner status={status} />
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

export { PARTNER_STATUS_LABEL };
