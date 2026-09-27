const field =
  "bg-campo text-tinta h-[52px] w-full rounded-campo px-4 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-verde-fundo";

/** Ano letivo do aluno: só o corrente ou o seguinte (mesma janela de `academicYears`, S07/S15). */
export function SchoolYearSelect({ years, defaultValue }: { years: readonly number[]; defaultValue: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="schoolYear" className="text-[13px] font-extrabold">
        Ano letivo
      </label>
      <select id="schoolYear" name="schoolYear" defaultValue={String(defaultValue)} className={field}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
