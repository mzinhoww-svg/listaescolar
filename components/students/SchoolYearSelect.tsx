const field =
  "bg-campo text-tinta h-[52px] w-full rounded-campo px-4 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-verde-fundo";

/**
 * Ano letivo do aluno: só o corrente ou o seguinte (mesma janela de `academicYears`, S07/S15).
 * Controlado pelo mesmo motivo do `GradeSelect` (achado do E2E da S15: reset do `<form action>` após erro).
 */
export function SchoolYearSelect({ years, value, onChange }: { years: readonly number[]; value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="schoolYear" className="text-[13px] font-extrabold">
        Ano letivo
      </label>
      <select id="schoolYear" name="schoolYear" value={String(value)} onChange={(e) => onChange(Number(e.target.value))} className={field}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
