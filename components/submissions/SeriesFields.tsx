import { STAGE_LABEL, type GradeStage } from "@/features/grades/catalog";

import { Field, fieldInputClass } from "@/components/ui/Field";
import { FORM_ERROR_ID } from "@/features/submissions/copy";

import { SERIES_OPTIONS } from "./series-options";

const STAGES: GradeStage[] = ["ei", "ef", "em"];

/** Série e ano letivo (App15). Só série: nunca nome de aluno. `error` põe a mensagem junto do campo (UX-064). */
export function SeriesFields({ years, defaultYear, invalid = false, defaultGrade = "", error }: { years: number[]; defaultYear: number; invalid?: boolean; defaultGrade?: string; error?: string | undefined }) {
  const bad = invalid || error !== undefined;
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field id="grade" label="Série" error={error}>
        <select id="grade" name="grade" defaultValue={defaultGrade} className={fieldInputClass} aria-invalid={bad} aria-describedby={error !== undefined ? "grade-erro" : invalid ? FORM_ERROR_ID : undefined}>
          <option value="" disabled>
            Escolha a série
          </option>
          {STAGES.map((stage) => (
            <optgroup key={stage} label={STAGE_LABEL[stage]}>
              {SERIES_OPTIONS.filter((o) => o.stage === stage).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      <Field id="schoolYear" label="Ano letivo">
        <select id="schoolYear" name="schoolYear" defaultValue={String(defaultYear)} className={fieldInputClass}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
