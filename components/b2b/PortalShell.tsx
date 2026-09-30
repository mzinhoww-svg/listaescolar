import Link from "next/link";
import type { ReactNode } from "react";

import { signOutAction } from "@/components/auth/sign-out-action";
import { Logo } from "@/components/brand/Logo";
import { SkipLink } from "@/components/site/SkipLink";
import { Button } from "@/components/ui/Button";
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

export type PartnerType = "retailer" | "brand" | "edtech";

/** UX-123: campanha é do tipo marca; os demais tipos nem veem o item (a autorização segue no servidor). */
export function navFor(partnerType: PartnerType | undefined): readonly NavItem[] {
  return partnerType && partnerType !== "brand" ? B2B_NAV.filter((i) => i.href !== "/b2b/campanhas") : B2B_NAV;
}

type Props = { tradeName: string; status: B2bPartnerStatus; email: string | undefined; partnerType?: PartnerType; children: ReactNode };

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
      <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">
        Cadastro recusado. Veja o motivo em Conta.
      </p>
    );
  }
  if (status === "suspended") {
    return (
      <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">
        Conta suspensa: as chaves foram revogadas e o portal está somente leitura.
      </p>
    );
  }
  return null;
}

export function PortalShell({ tradeName, status, email, partnerType, children }: Props) {
  const initials = (email ?? "?").slice(0, 2).toUpperCase();
  return (
    <div className="flex min-h-dvh flex-1 flex-col md:flex-row">
      <SkipLink />
      <aside className="bg-tinta flex shrink-0 flex-row flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 md:w-[248px] md:flex-col md:items-stretch md:gap-5 md:px-[18px] md:py-7">
        <header className="order-1 px-1 md:order-1">
          <Link href="/b2b" aria-label="ListaCerta, portal de parceiros" className="flex min-h-11 items-center rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-verde-certo">
            <Logo variant="horizontal-negativo" height={32} />
          </Link>
        </header>
        <span className="bg-verde-certo text-tinta order-2 w-fit rounded-botao px-3 py-1 text-[12px] font-extrabold md:order-2">Parceiros B2B</span>
        <div className="order-3 ml-auto flex items-center gap-2 text-white md:order-4 md:mt-auto md:ml-0 md:gap-3 md:px-1 md:pt-4">
          <span className="bg-verde-certo text-tinta grid size-10 shrink-0 place-items-center rounded-full text-[12px] font-extrabold">{initials}</span>
          <div className="min-w-0 md:flex-1">
            <p className="hidden truncate text-[13px] font-bold md:block">{email ?? "indisponível"}</p>
            <form action={signOutAction}>
              <Button type="submit" variant="outline" className="!h-11 !border-white/40 !px-4 !text-[13px] !text-white">
                Sair
              </Button>
            </form>
          </div>
        </div>
        <NavLinks items={navFor(partnerType)} />
      </aside>
      <main id="conteudo" className="min-w-0 flex-1 px-5 py-8 md:px-10">
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
