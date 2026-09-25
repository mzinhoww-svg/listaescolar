import "server-only";

import { redirect } from "next/navigation";

import type { UserRole } from "@/features/auth/access";
import { getCurrentRole, getCurrentUser } from "@/features/auth/queries";

import { getStationeryOfOwner } from "./queries";
import type { AdminRow } from "./repository";

/** Sessão validada no servidor (`getUser`); sem sessão, login. O `actorId` das ações vem só daqui. */
export async function requireSession(nextPath: string): Promise<{ userId: string; email: string | undefined; role: UserRole }> {
  const user = await getCurrentUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(nextPath)}`);
  const role = await getCurrentRole();
  if (role === null) redirect("/403");
  return { userId: user.id, email: user.email, role };
}

export type OwnerContext = { userId: string; role: UserRole; stationery: AdminRow };

/** Dono da papelaria (vínculo `owner`): sem papelaria vinculada, `null`. */
export async function getOwnerContext(nextPath: string): Promise<OwnerContext | null> {
  const { userId, role } = await requireSession(nextPath);
  if (role !== "parent" && role !== "stationery_member" && role !== "admin") return null;
  const stationery = await getStationeryOfOwner(userId);
  return stationery ? { userId, role, stationery } : null;
}
