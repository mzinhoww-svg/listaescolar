import { canAccess, type UserRole } from "./access";
import { loginPathFor } from "./redirect";

export type AccessAction =
  | { action: "next" }
  | { action: "redirect-login"; location: string }
  | { action: "rewrite-403"; location: string };

export type DecideAccessInput = {
  pathname: string;
  search?: string;
  userId: string | null;
  role: UserRole | null;
  /** Havia cookie de sessão, mas `getUser` não o aceitou: a sessão terminou (a tela de entrada avisa). */
  hadSession?: boolean;
};

/** Decisão pura do proxy. `userId` vem de `auth.getUser()`, `role` de `profiles`. */
export function decideAccess({
  pathname,
  search = "",
  userId,
  role,
  hadSession = false,
}: DecideAccessInput): AccessAction {
  if (userId === null) {
    if (canAccess(null, pathname) === "allow") return { action: "next" };
    return { action: "redirect-login", location: loginPathFor(`${pathname}${search}`, { expired: hadSession }) };
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
