import { STAGE_LABEL, type GradeStage } from "@/features/grades/catalog";

import { FORM_ERROR_ID } from "@/features/submissions/copy";

import { SERIES_OPTIONS } from "./series-options";

const STAGES: GradeStage[] = ["ei", "ef", "em"];

const field =
  "bg-campo text-tinta h-[52px] w-full rounded-campo px-4 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-verde-fundo";

/** Série e ano letivo (App15). Só série: nunca nome de aluno. */
export function SeriesFields({ years, defaultYear, invalid = false }: { years: number[]; defaultYear: number; invalid?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="grade" className="text-[13px] font-extrabold">
          Série
        </label>
        <select id="grade" name="grade" defaultValue="" className={field} aria-invalid={invalid} aria-describedby={invalid ? FORM_ERROR_ID : undefined}>
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
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="schoolYear" className="text-[13px] font-extrabold">
          Ano letivo
        </label>
        <select id="schoolYear" name="schoolYear" defaultValue={String(defaultYear)} className={field}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
