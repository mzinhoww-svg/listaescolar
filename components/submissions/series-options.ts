import { GRADES, STAGE_LABEL, type GradeStage } from "@/features/grades/catalog";
import { GRADE_OPTIONS } from "@/features/submissions/copy";

export type SeriesOption = { value: (typeof GRADE_OPTIONS)[number]; label: string; stage: GradeStage };

/**
 * Rótulos do seletor de série de `/enviar-lista` no mesmo vocabulário da página da escola (`features/grades/catalog`):
 * mesmas etapas ("Educação Infantil", "Ensino Fundamental", "Ensino Médio") e "N º ano"/"N ª série". O VALOR enviado
 * continua o de `GRADE_OPTIONS` (texto que a revisão e o esquema já usam).
 */
export const SERIES_OPTIONS: readonly SeriesOption[] = GRADE_OPTIONS.map((value) => {
  if (value === "Educação infantil") return { value, label: STAGE_LABEL.ei, stage: "ei" as const };
  if (value.endsWith("do ensino médio")) return { value, label: value.replace(" do ensino médio", ""), stage: "em" as const };
  return { value, label: value, stage: "ef" as const };
});

/** Todo rótulo de ano/série existe no catálogo da página da escola (garantia de "uma palavra por conceito"). */
export const CATALOG_LABELS: ReadonlySet<string> = new Set(GRADES.map((g) => g.label));

/** Valor do seletor de `/enviar-lista` para um slug do catálogo (`ef-5` vira "5º ano"); desconhecido = `undefined`. */
export function seriesValueForSlug(slug: string): SeriesOption["value"] | undefined {
  const grade = GRADES.find((g) => g.slug === slug);
  if (!grade) return undefined;
  const value = grade.stage === "ei" ? "Educação infantil" : grade.stage === "em" ? `${grade.label} do ensino médio` : grade.label;
  return SERIES_OPTIONS.find((o) => o.value === value)?.value;
}

/** Slug do catálogo para o valor do seletor (`5º ano` vira `ef-5`); educação infantil e desconhecido = `undefined` (o valor não diz a turma). */
export function slugForSeriesValue(value: string): string | undefined {
  return GRADES.find((g) => g.stage !== "ei" && seriesValueForSlug(g.slug) === value)?.slug;
}
