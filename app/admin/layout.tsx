import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ADMIN_NAV, PanelShell } from "@/components/stationeries/PanelShell";
import { requireAccess } from "@/features/auth/guard";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function Layout({ children }: { children: ReactNode }) {
  const { user } = await requireAccess("/admin");
  return (
    <PanelShell badge="Admin interno" nav={ADMIN_NAV} email={user.email}>
      {children}
    </PanelShell>
  );
}
