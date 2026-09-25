import "server-only";

import { redirect } from "next/navigation";

import { canAccess, type UserRole } from "./access";
import { getCurrentRole, getCurrentUser } from "./queries";

/** Gate dos layouts protegidos (segunda camada, além do proxy). */
export async function requireAccess(pathname: string) {
  const user = await getCurrentUser();
  const role: UserRole | null = user ? await getCurrentRole() : null;
  const decision = canAccess(user ? role : null, pathname);
  if (!user || decision === "login") redirect(`/entrar?next=${encodeURIComponent(pathname)}`);
  if (decision === "forbidden" || role === null) redirect("/403");
  return { user, role };
}
