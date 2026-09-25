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

/** Fuso do piloto (Cuiabá/MT, UTC-4, sem horário de verão): o corte do ano letivo usa a data local, não UTC. */
const SCHOOL_TZ = "America/Cuiaba";
/** Mês (1-12) a partir do qual o ano letivo padrão passa a ser o seguinte: agosto (matrículas e listas do ano seguinte). */
export const DEFAULT_YEAR_CUTOFF_MONTH = 8;

function localYearMonth(now: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: SCHOOL_TZ, year: "numeric", month: "numeric" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month") };
}

/** Ano letivo corrente e o próximo, derivados de `now` no fuso de Cuiabá (sem ano fixo no código). */
export function academicYears(now: Date): [number, number] {
  const { year } = localYearMonth(now);
  return [year, year + 1];
}

/** Ano pré-selecionado: o seguinte a partir de agosto (fuso de Cuiabá), o corrente antes disso. */
export function defaultAcademicYear(now: Date): number {
  const { year, month } = localYearMonth(now);
  return month >= DEFAULT_YEAR_CUTOFF_MONTH ? year + 1 : year;
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
