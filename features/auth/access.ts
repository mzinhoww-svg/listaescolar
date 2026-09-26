export type UserRole = "parent" | "school_member" | "admin" | "stationery_member" | "system";
export type ProtectedPrefix =
  | "/conta"
  | "/carrinho"
  | "/cotacao"
  | "/ir-para"
  | "/enviar-lista"
  | "/escola"
  | "/papelaria"
  | "/b2b"
  | "/admin";
export type AccessDecision = "allow" | "login" | "forbidden";

export const PREFIXES: readonly ProtectedPrefix[] = [
  "/conta",
  "/carrinho",
  "/cotacao",
  "/ir-para",
  "/enviar-lista",
  "/escola",
  "/papelaria",
  "/b2b",
  "/admin",
];

/** Papéis permitidos por prefixo. `system` nunca é usuário logado no app. `/b2b` (portal do parceiro B2B, S24):
 * acesso real é por linha em `b2b_partner_members` (não por papel), mas os quatro papéis de usuário logado podem
 * chegar à rota — o layout de `/b2b` redireciona quem não é membro para `/parceiros?cadastro=1`. */
const ALLOWED: Record<ProtectedPrefix, readonly UserRole[]> = {
  "/conta": ["parent", "school_member", "admin", "stationery_member"],
  "/carrinho": ["parent", "school_member", "admin", "stationery_member"],
  "/cotacao": ["parent", "school_member", "admin", "stationery_member"],
  "/ir-para": ["parent", "school_member", "admin", "stationery_member"],
  "/enviar-lista": ["parent", "school_member", "admin"],
  "/escola": ["school_member", "admin"],
  "/papelaria": ["stationery_member", "admin"],
  "/b2b": ["parent", "school_member", "stationery_member", "admin"],
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
