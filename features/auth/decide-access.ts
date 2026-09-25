import { canAccess, type UserRole } from "./access";
import { safeNextPath } from "./redirect";

export type AccessAction =
  | { action: "next" }
  | { action: "redirect-login"; location: string }
  | { action: "rewrite-403"; location: string };

export type DecideAccessInput = {
  pathname: string;
  search?: string;
  userId: string | null;
  role: UserRole | null;
};

/** Decisão pura do proxy. `userId` vem de `auth.getUser()`, `role` de `profiles`. */
export function decideAccess({
  pathname,
  search = "",
  userId,
  role,
}: DecideAccessInput): AccessAction {
  const decision = canAccess(userId === null ? null : (role ?? "system"), pathname);
  if (decision === "allow") return { action: "next" };
  if (userId === null) {
    const next = safeNextPath(`${pathname}${search}`);
    return { action: "redirect-login", location: `/entrar?next=${encodeURIComponent(next)}` };
  }
  return { action: "rewrite-403", location: "/403" };
}
