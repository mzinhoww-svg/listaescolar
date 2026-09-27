import { GRADES, STAGE_LABEL, type GradeStage } from "@/features/grades/catalog";

const field =
  "bg-campo text-tinta h-[52px] w-full rounded-campo px-4 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-verde-fundo";

const STAGES: readonly GradeStage[] = ["ei", "ef", "em"];

/**
 * Série do aluno por slug (liga a `public.grades`, S05/S15) — nunca nome de aluno, nunca free-text.
 * Controlado (não `defaultValue`): React 19 reresseta campos não controlados de um `<form action>` depois de
 * QUALQUER conclusão da action, inclusive quando ela devolve erro (achado do E2E da S15) — só campo controlado
 * sobrevive a essa reinicialização.
 */
export function GradeSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="gradeSlug" className="text-[13px] font-extrabold">
        Série
      </label>
      <select id="gradeSlug" name="gradeSlug" required value={value} onChange={(e) => onChange(e.target.value)} className={field}>
        <option value="" disabled>
          Escolha a série
        </option>
        {STAGES.map((stage) => (
          <optgroup key={stage} label={STAGE_LABEL[stage]}>
            {GRADES.filter((g) => g.stage === stage).map((g) => (
              <option key={g.slug} value={g.slug}>
                {g.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
