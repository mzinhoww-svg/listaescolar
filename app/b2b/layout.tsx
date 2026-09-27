import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { PortalShell } from "@/components/b2b/PortalShell";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { getMyPartnerHeader, getMyPartnerOverview } from "@/features/b2b/queries";
import type { B2bPartnerStatus } from "@/features/b2b/states";

// Casca de `/b2b` (B2B01/02/03/Conta): exige membro de fato (linha em `b2b_partner_members`), não só o papel —
// quem chega sem cadastro vai para `/parceiros?cadastro=1` (Global Constraints). `dynamic = "force-dynamic"`:
// nunca cacheia (sessão + dado sensível de uso/chave).

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function Layout({ children }: { children: ReactNode }) {
  const { user } = await requireAccess("/b2b");
  const actor = await getSessionActor();
  const overview = actor ? await getMyPartnerOverview(actor) : null;
  if (!actor || !overview) redirect("/parceiros?cadastro=1");
  const header = await getMyPartnerHeader(actor);
  return (
    <PortalShell tradeName={header?.tradeName ?? "Parceiro"} status={overview.status as B2bPartnerStatus} email={user.email}>
      {children}
    </PortalShell>
  );
}
