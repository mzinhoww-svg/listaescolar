export type UserRole = "parent" | "school_member" | "admin" | "stationery_member" | "system";
export type ProtectedPrefix =
  "/conta" | "/carrinho" | "/ir-para" | "/escola" | "/papelaria" | "/admin";
export type AccessDecision = "allow" | "login" | "forbidden";

const PREFIXES: readonly ProtectedPrefix[] = [
  "/conta",
  "/carrinho",
  "/ir-para",
  "/escola",
  "/papelaria",
  "/admin",
];

/** Papéis permitidos por prefixo. `system` nunca é usuário logado no app. */
const ALLOWED: Record<ProtectedPrefix, readonly UserRole[]> = {
  "/conta": ["parent", "school_member", "admin", "stationery_member"],
  "/carrinho": ["parent", "school_member", "admin", "stationery_member"],
  "/ir-para": ["parent", "school_member", "admin", "stationery_member"],
  "/escola": ["school_member", "admin"],
  "/papelaria": ["stationery_member", "admin"],
  "/admin": ["admin"],
};

export function protectedPrefix(pathname: string): ProtectedPrefix | null {
  for (const prefix of PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return prefix;
  }
  return null;
}

export function canAccess(role: UserRole | null, pathname: string): AccessDecision {
  const prefix = protectedPrefix(pathname);
  if (prefix === null) return "allow";
  if (role === null) return "login";
  return ALLOWED[prefix].includes(role) ? "allow" : "forbidden";
}
