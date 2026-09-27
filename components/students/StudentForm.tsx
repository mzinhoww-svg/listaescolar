"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { GradeSelect } from "@/components/students/GradeSelect";
import type { StudentActionResult } from "@/features/students/form-state";

const field =
  "bg-campo text-tinta h-14 w-full rounded-campo px-4 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-verde-fundo";
const primary = "bg-tinta text-papel flex h-14 w-full items-center justify-center rounded-botao text-base font-extrabold disabled:opacity-60";

export type StudentFormDefaults = {
  id?: string;
  nickname?: string;
  gradeSlug?: string;
};

/**
 * App13 "Novo aluno", reaproveitado para editar (App13/S15). Só apelido e série (SPEC §5, correção da revisão de
 * segurança) — escola e ano letivo vivem na lista salva, nunca no aluno.
 */
export function StudentForm({
  action,
  defaults,
  submitLabel,
  consent = true,
}: {
  action: (prev: StudentActionResult, formData: FormData) => Promise<StudentActionResult>;
  defaults?: StudentFormDefaults;
  submitLabel: string;
  /** Edição não pede consentimento de novo (já foi dado ao criar); só o cadastro novo pede. */
  consent?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" } as StudentActionResult);
  // Controlados de propósito (ver GradeSelect): um `<form action>` reinicializa campos NÃO controlados depois de
  // QUALQUER conclusão da action, mesmo em erro (achado do E2E da S15). Isso não basta para <select>/checkbox: o
  // reset nativo do `<form>` troca o DOM por fora do React (o `<input>` de texto escapa disso por ter um
  // rastreador de valor próprio; select/checkbox não têm o mesmo rastreador — segundo achado do E2E, mais sutil
  // que o primeiro, e uma `key` que remonta o nó não basta porque o reset nativo pode disparar DEPOIS do commit
  // do React). Corrigido reaplicando o valor controlado por `ref` num `useEffect` que roda a cada conclusão da
  // action — efeitos rodam depois do commit e depois de qualquer reset síncrono do navegador, então sempre
  // "ganham" a corrida.
  const [nickname, setNickname] = useState(defaults?.nickname ?? "");
  const [gradeSlug, setGradeSlug] = useState(defaults?.gradeSlug ?? "");
  const [consentChecked, setConsentChecked] = useState(false);
  const gradeRef = useRef<HTMLSelectElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // O reset nativo do checkbox observou-se um instante mais tarde que o do <select> nesta correção: um
    // `setTimeout(0)` empurra a reaplicação para depois de qualquer reset assíncrono, não só o síncrono.
    const id = setTimeout(() => {
      if (gradeRef.current && gradeRef.current.value !== gradeSlug) gradeRef.current.value = gradeSlug;
      if (consentRef.current && consentRef.current.checked !== consentChecked) consentRef.current.checked = consentChecked;
    }, 0);
    return () => clearTimeout(id);
  }, [state, gradeSlug, consentChecked]);

  return (
    <form action={formAction} className="flex flex-1 flex-col gap-4">
      {defaults?.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="nickname" className="text-[13px] font-extrabold">
          Apelido do aluno
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
        <p className="text-verde-fundo text-[12px] font-semibold">Só letras, sem sobrenome nem documento.</p>
      </div>

      <GradeSelect selectRef={gradeRef} value={gradeSlug} onChange={setGradeSlug} />

      {consent ? (
        <label className="bg-campo flex cursor-pointer items-start gap-3 rounded-2xl p-3.5">
          <input
            ref={consentRef}
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
