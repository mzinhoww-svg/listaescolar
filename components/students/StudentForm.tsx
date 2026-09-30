"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";

import { GradeSelect } from "@/components/students/GradeSelect";
import { Button } from "@/components/ui/Button";
import { Field, fieldInputClass } from "@/components/ui/Field";
import { InlineStatus } from "@/components/ui/InlineStatus";
import type { StudentActionResult } from "@/features/students/form-state";
import { gradeSlugSchema, nicknameSchema } from "@/features/students/schemas";

type Errors = { nickname?: string; gradeSlug?: string; consent?: string };

/** Erros de campo em português, iguais aos do servidor, antes de enviar (UX-055). */
function validate(nickname: string, gradeSlug: string, consent: boolean, needsConsent: boolean): Errors {
  const errors: Errors = {};
  const n = nicknameSchema.safeParse(nickname);
  if (!n.success) errors.nickname = n.error.issues[0]?.message ?? "Confira o apelido.";
  if (!gradeSlugSchema.safeParse(gradeSlug).success) errors.gradeSlug = "Escolha a série.";
  if (needsConsent && !consent) errors.consent = "Marque o consentimento para salvar o aluno.";
  return errors;
}

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
  const [errors, setErrors] = useState<Errors>({});
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

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    const found = validate(nickname, gradeSlug, consentChecked, consent);
    setErrors(found);
    if (Object.keys(found).length === 0) return;
    e.preventDefault();
    const first = found.nickname ? "nickname" : found.gradeSlug ? "gradeSlug" : "consent";
    document.getElementById(first)?.focus();
  };

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="flex flex-1 flex-col gap-4">
      {defaults?.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <Field id="nickname" label="Apelido do aluno" error={errors.nickname} hint="Só o apelido, sem sobrenome nem documento.">
        <input
          id="nickname"
          name="nickname"
          type="text"
          required
          maxLength={30}
          placeholder="Ex.: Maria"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          aria-invalid={errors.nickname ? true : undefined}
          aria-describedby={errors.nickname ? "nickname-erro" : undefined}
          className={fieldInputClass}
        />
      </Field>

      <GradeSelect selectRef={gradeRef} value={gradeSlug} onChange={setGradeSlug} error={errors.gradeSlug} />

      {consent ? (
        <div className="flex flex-col gap-1.5">
          <label className="bg-campo flex cursor-pointer items-start gap-3 rounded-2xl p-3.5">
            <input
              ref={consentRef}
              id="consent"
              type="checkbox"
              name="consent"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              aria-invalid={errors.consent ? true : undefined}
              aria-describedby={errors.consent ? "consent-erro" : undefined}
              className="accent-verde-fundo mt-0.5 size-5 shrink-0"
            />
            <span className="text-texto-2 text-[14px] leading-[1.4] font-semibold">
              Sou responsável por este aluno e autorizo o uso destes dados só para montar a lista.
            </span>
          </label>
          {errors.consent ? (
            <p id="consent-erro" role="alert" className="text-erro-texto text-[13px] font-semibold">
              {errors.consent}
            </p>
          ) : null}
        </div>
      ) : null}

      {state.status === "error" ? <InlineStatus tone="error">{state.message}</InlineStatus> : null}

      <Button type="submit" size="lg" className="mt-auto w-full" loading={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}
