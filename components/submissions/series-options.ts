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
