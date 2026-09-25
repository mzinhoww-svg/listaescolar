/** Mesmo formato do check do banco: Crockford base32 (sem I, L, O, U), 4 a 6 caracteres. */
export const LEAD_CODE_PATTERN = /^LC-[0-9A-HJKMNP-TV-Z]{4,6}$/;

/**
 * Código digitado ou colado (`lc 5tj1`, `LC-5TJl`) para o formato canônico; `null` se não for um código válido.
 * Maiúsculas, O vira 0, I e L viram 1 (o alfabeto não tem esses três).
 */
export function normalizeLeadCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 32) return null;
  const m = /^LC[-\s]?(.+)$/.exec(input.trim().toUpperCase());
  if (!m?.[1]) return null;
  const body = m[1].replace(/O/g, "0").replace(/[IL]/g, "1");
  const code = `LC-${body}`;
  return LEAD_CODE_PATTERN.test(code) ? code : null;
}
