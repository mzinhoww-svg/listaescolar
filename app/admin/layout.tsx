import type { Metadata } from "next";
import type { ReactNode } from "react";

import { requireAccess } from "@/features/auth/guard";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Só guarda o acesso; a casca (barra lateral) é `components/admin/AdminShell`, usada por cada página. */
export default async function Layout({ children }: { children: ReactNode }) {
  await requireAccess("/admin");
  return children;
}
