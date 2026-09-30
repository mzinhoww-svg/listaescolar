import type { Ref } from "react";

import { fieldInputClass, Field } from "@/components/ui/Field";
import { GRADES, STAGE_LABEL, type GradeStage } from "@/features/grades/catalog";

const STAGES: readonly GradeStage[] = ["ei", "ef", "em"];

/**
 * Série do aluno por slug (liga a `public.grades`, S05/S15) — nunca nome de aluno, nunca free-text.
 * Controlado (não `defaultValue`): React 19 reresseta campos não controlados de um `<form action>` depois de
 * QUALQUER conclusão da action, inclusive quando ela devolve erro (achado do E2E da S15) — só campo controlado
 * sobrevive a essa reinicialização.
 */
export function GradeSelect({
  value,
  onChange,
  selectRef,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Para reaplicar o valor no DOM depois de um reset nativo (ver StudentForm). */
  selectRef?: Ref<HTMLSelectElement>;
  error?: string | undefined;
}) {
  return (
    <Field id="gradeSlug" label="Série" error={error}>
      <select
        ref={selectRef}
        id="gradeSlug"
        name="gradeSlug"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "gradeSlug-erro" : undefined}
        className={fieldInputClass}
      >
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
    </Field>
  );
}
