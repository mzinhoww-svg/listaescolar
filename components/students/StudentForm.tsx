"use client";

import { useActionState, useState } from "react";

import { SchoolSearchPicker, type SchoolHit } from "@/components/submissions/SchoolPicker";
import { GradeSelect } from "@/components/students/GradeSelect";
import { SchoolYearSelect } from "@/components/students/SchoolYearSelect";
import type { StudentActionResult } from "@/features/students/form-state";

const field =
  "bg-campo text-tinta h-14 w-full rounded-campo px-4 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-verde-fundo";
const primary = "bg-tinta text-papel flex h-14 w-full items-center justify-center rounded-botao text-base font-extrabold disabled:opacity-60";

export type StudentFormDefaults = {
  id?: string;
  nickname?: string;
  school?: SchoolHit | null;
  gradeSlug?: string;
  schoolYear?: number;
};

/** App13 "Novo aluno", reaproveitado para editar (App13/S15). Só apelido, escola, série e ano letivo. */
export function StudentForm({
  action,
  defaults,
  years,
  defaultYear,
  submitLabel,
  consent = true,
}: {
  action: (prev: StudentActionResult, formData: FormData) => Promise<StudentActionResult>;
  defaults?: StudentFormDefaults;
  years: readonly number[];
  defaultYear: number;
  submitLabel: string;
  /** Edição não pede consentimento de novo (já foi dado ao criar); só o cadastro novo pede. */
  consent?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" } as StudentActionResult);
  // Controlados de propósito (ver GradeSelect/SchoolYearSelect): um `<form action>` reinicializa campos NÃO
  // controlados depois de QUALQUER conclusão da action, mesmo em erro (achado do E2E da S15).
  const [nickname, setNickname] = useState(defaults?.nickname ?? "");
  const [gradeSlug, setGradeSlug] = useState(defaults?.gradeSlug ?? "");
  const [schoolYear, setSchoolYear] = useState(defaults?.schoolYear ?? defaultYear);
  const [consentChecked, setConsentChecked] = useState(false);

  return (
    <form action={formAction} className="flex flex-1 flex-col gap-4">
      {defaults?.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="nickname" className="text-[13px] font-extrabold">
          Nome ou apelido do aluno
        </label>
        <input
          id="nickname"
          name="nickname"
          type="text"
          required
          maxLength={30}
          placeholder="Ex.: Maria"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          className={field}
        />
        <p className="text-verde-fundo text-[12px] font-semibold">Não pedimos sobrenome nem documento.</p>
      </div>

      <SchoolSearchPicker optional={false} label="Escola" initial={defaults?.school} />
      <GradeSelect value={gradeSlug} onChange={setGradeSlug} />
      <SchoolYearSelect years={years} value={schoolYear} onChange={setSchoolYear} />

      {consent ? (
        <label className="bg-campo flex cursor-pointer items-start gap-3 rounded-2xl p-3.5">
          <input
            type="checkbox"
            name="consent"
            checked={consentChecked}
            onChange={(e) => setConsentChecked(e.target.checked)}
            className="accent-verde-fundo mt-0.5 size-5 shrink-0"
          />
          <span className="text-texto-2 text-[13px] leading-[1.4] font-semibold">
            Sou responsável por este aluno e autorizo o uso destes dados só para montar a lista.
          </span>
        </label>
      ) : null}

      <div aria-live="polite">
        {state.status === "error" ? (
          <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[13px] font-bold">
            {state.message}
          </p>
        ) : null}
      </div>

      <button type="submit" disabled={pending} className={`${primary} mt-auto`}>
        {pending ? "Salvando…" : submitLabel}
      </button>
    </form>
  );
}
