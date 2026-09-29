/**
 * Conta interna (revisão M6): e-mail `@listacerta.test` ou papel `admin`/`system`. Calculado NO SERVIDOR; o e-mail
 * nunca vai a evento algum, só o booleano `is_internal`.
 */
export const INTERNAL_EMAIL_SUFFIX = "@listacerta.test";
const INTERNAL_ROLES: readonly string[] = ["admin", "system"];

export function isInternalAccount(account: { email?: string | null | undefined; role?: string | null | undefined }): boolean {
  const email = account.email?.trim().toLowerCase();
  if (email?.endsWith(INTERNAL_EMAIL_SUFFIX)) return true;
  return typeof account.role === "string" && INTERNAL_ROLES.includes(account.role);
}
