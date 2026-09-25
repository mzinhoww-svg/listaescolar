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
  if (userId === null) {
    if (canAccess(null, pathname) === "allow") return { action: "next" };
    const next = safeNextPath(`${pathname}${search}`);
    return { action: "redirect-login", location: `/entrar?next=${encodeURIComponent(next)}` };
  }
  // Logado sem papel (profile ausente): só rota pública passa; o resto é 403, sem laço de login.
  if (role === null) {
    return canAccess(null, pathname) === "allow"
      ? { action: "next" }
      : { action: "rewrite-403", location: "/403" };
  }
  return canAccess(role, pathname) === "allow"
    ? { action: "next" }
    : { action: "rewrite-403", location: "/403" };
}
