import { GRADE_OPTIONS } from "@/features/submissions/copy";

const field =
  "bg-campo text-tinta h-[52px] w-full rounded-campo px-4 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-verde-fundo";

/** Série e ano letivo (App15). Só série: nunca nome de aluno. */
export function SeriesFields({ years, defaultYear }: { years: number[]; defaultYear: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="grade" className="text-[13px] font-extrabold">
          Série
        </label>
        <select id="grade" name="grade" defaultValue="" className={field}>
          <option value="" disabled>
            Escolha
          </option>
          {GRADE_OPTIONS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
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
