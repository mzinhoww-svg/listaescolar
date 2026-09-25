"use client";

import { useActionState, useRef, useState } from "react";

import { Stepper } from "@/app/cadastrar-papelaria/Stepper";
import {
  stepOfField,
  validateStep,
  type FieldErrors,
  type RegisterState,
  type RegistrationStep,
} from "@/features/stationeries/form-data";
import type { Municipality } from "@/features/stationeries/queries";

import { StepBasics, StepConsent } from "./RegistrationSteps";
import { StepService } from "./StepService";

const ORDER: readonly RegistrationStep[] = ["basics", "service", "consent"];
const initial: RegisterState = { status: "idle" };

type Action = (prev: RegisterState, formData: FormData) => Promise<RegisterState>;

const LEADS_STEPS = [
  "O pai escolhe sua papelaria na lista da escola.",
  "Ele chama no seu WhatsApp com o código do lead e o link da lista.",
  "Você atende como sempre e marca aqui quando vender.",
];

export function RegistrationForm({ action, municipalities }: { action: Action; municipalities: Municipality[] }) {
  const [step, setStep] = useState(0);
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: RegisterState, fd: FormData) => {
    const next = await action(prev, fd);
    if (next.status === "error") {
      const first = Object.keys(next.errors)[0];
      if (first) setStep(ORDER.indexOf(stepOfField(first)));
    }
    return next;
  }, initial);

  const values = state.status === "error" ? state.values : {};
  const errors = { ...(state.status === "error" ? state.errors : {}), ...clientErrors };

  const goNext = () => {
    if (!formRef.current) return;
    const found = validateStep(ORDER[step] ?? "basics", new FormData(formRef.current));
    setClientErrors(found);
    if (Object.keys(found).length === 0) setStep(step + 1);
  };
  const goBack = () => {
    setClientErrors({});
    setStep(Math.max(0, step - 1));
  };
  const cur = step as 0 | 1 | 2;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div>
        <Stepper current={cur} />
        <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-5 rounded-card bg-white p-6">
          {state.status === "error" ? (
            <p role="alert" className="rounded-campo bg-[#fde2e0] px-4 py-3 text-[14px] font-bold text-[#8a1c14]">
              {state.message}
            </p>
          ) : null}
          <div className={step === 0 ? "" : "hidden"}>
            <StepBasics values={values} errors={errors} municipalities={municipalities} />
          </div>
          <div className={step === 1 ? "" : "hidden"}>
            <StepService values={values} errors={errors} />
          </div>
          <div className={step === 2 ? "" : "hidden"}>
            <StepConsent values={values} errors={errors} />
          </div>
          <div className="flex justify-end gap-3">
            {step > 0 ? (
              <button type="button" onClick={goBack} className="border-tinta h-14 rounded-botao border-[1.5px] px-7 text-base font-extrabold">
                Voltar
              </button>
            ) : null}
            {step < 2 ? (
              <button type="button" onClick={goNext} className="bg-tinta text-papel h-14 rounded-botao px-8 text-base font-extrabold">
                Continuar
              </button>
            ) : (
              <button type="submit" disabled={pending} className="bg-tinta text-papel h-14 rounded-botao px-8 text-base font-extrabold disabled:opacity-60">
                {pending ? "Enviando…" : "Enviar para análise"}
              </button>
            )}
          </div>
        </form>
      </div>
      <aside className="bg-tinta h-fit rounded-card p-6 text-white">
        <p className="text-verde-certo mb-4 text-[12px] font-extrabold tracking-[0.12em] uppercase">Como você recebe leads</p>
        <ol className="flex flex-col gap-4">
          {LEADS_STEPS.map((t, i) => (
            <li key={t} className="flex gap-3 text-[14px] font-bold">
              <span className="bg-verde-certo text-tinta grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-extrabold">{i + 1}</span>
              {t}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
