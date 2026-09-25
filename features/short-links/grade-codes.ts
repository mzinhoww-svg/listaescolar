/**
 * Código numérico CONGELADO de cada série dentro do link curto. Nunca renumerar nem reutilizar: um QR impresso
 * no mural depende destes valores. Novos slugs só ganham o próximo código livre (17..31).
 * `0` é reservado ao perfil da escola (sem série) e não aparece aqui.
 */
export const SHORT_GRADE_CODES: Readonly<Record<string, number>> = Object.freeze({
  "ei-maternal-1": 1,
  "ei-maternal-2": 2,
  "ei-pre-1": 3,
  "ei-pre-2": 4,
  "ef-1": 5,
  "ef-2": 6,
  "ef-3": 7,
  "ef-4": 8,
  "ef-5": 9,
  "ef-6": 10,
  "ef-7": 11,
  "ef-8": 12,
  "ef-9": 13,
  "em-1": 14,
  "em-2": 15,
  "em-3": 16,
});

const BY_CODE: ReadonlyMap<number, string> = new Map(Object.entries(SHORT_GRADE_CODES).map(([slug, n]) => [n, slug]));

/** Slug da série para o código, ou `null` (0 = perfil sem série; fora da tabela = desconhecido). */
export function gradeSlugFromCode(n: number): string | null {
  return BY_CODE.get(n) ?? null;
}
