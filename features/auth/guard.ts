import "server-only";

import { redirect } from "next/navigation";

import { canAccess, type UserRole } from "./access";
import { getCurrentRole, getCurrentUser } from "./queries";

/** Gate dos layouts protegidos (segunda camada, além do proxy). Consultas cacheadas por request. */
export async function requireAccess(pathname: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(pathname)}`);
  const role: UserRole | null = await getCurrentRole();
  if (role === null || canAccess(role, pathname) !== "allow") redirect("/403");
  return { user, role };
}
