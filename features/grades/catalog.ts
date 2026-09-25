export type GradeStage = "ei" | "ef" | "em";

export type Grade = { slug: string; label: string; stage: GradeStage };

export const STAGE_LABEL: Record<GradeStage, string> = {
  ei: "Educação Infantil",
  ef: "Ensino Fundamental",
  em: "Ensino Médio",
};

/** Catálogo estático; a S05 cria a tabela `grades` alinhada a estes slugs (estáveis). */
export const GRADES: readonly Grade[] = [
  { slug: "ei-maternal-1", label: "Maternal I", stage: "ei" },
  { slug: "ei-maternal-2", label: "Maternal II", stage: "ei" },
  { slug: "ei-pre-1", label: "Pré I", stage: "ei" },
  { slug: "ei-pre-2", label: "Pré II", stage: "ei" },
  ...Array.from({ length: 9 }, (_, i) => ({ slug: `ef-${i + 1}`, label: `${i + 1}º ano`, stage: "ef" as const })),
  ...Array.from({ length: 3 }, (_, i) => ({ slug: `em-${i + 1}`, label: `${i + 1}ª série`, stage: "em" as const })),
];

export function findGrade(slug: string | undefined): Grade | null {
  return GRADES.find((g) => g.slug === slug) ?? null;
}

/** Ano letivo corrente e o próximo, derivados de `now` (sem ano fixo no código). */
export function academicYears(now: Date): [number, number] {
  const y = now.getUTCFullYear();
  return [y, y + 1];
}

/** Valida `?serie=&ano=`: valores inválidos viram null. */
export function parseGradeSelection(
  serie: string | undefined,
  ano: string | undefined,
  now: Date,
): { grade: Grade | null; year: number | null } {
  const year = /^\d{4}$/.test(ano ?? "") ? Number(ano) : null;
  return { grade: findGrade(serie), year: year !== null && academicYears(now).includes(year) ? year : null };
}
