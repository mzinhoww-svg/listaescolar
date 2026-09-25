"use client";

import { useActionState, type ReactNode } from "react";

import { IDLE, type ClaimActionState } from "@/features/claims/form-state";

type Props = {
  action: (prev: ClaimActionState, formData: FormData) => Promise<ClaimActionState>;
  submitLabel: string;
  pendingLabel?: string;
  /** `disabled` desliga o botão; `disabledReason` aparece ao lado (nunca um botão mudo). */
  disabled?: boolean;
  disabledReason?: string;
  /** Nome acessível do botão quando o rótulo visível é ambíguo (ex.: "Remover" em uma lista). */
  ariaLabel?: string;
  variant?: "primary" | "outline" | "danger";
  className?: string;
  children?: ReactNode;
};

const BUTTON: Record<NonNullable<Props["variant"]>, string> = {
  primary: "bg-tinta text-papel",
  outline: "border-tinta text-tinta border-[1.5px] bg-transparent",
  danger: "border-[1.5px] border-[#8a1c14] bg-transparent text-[#8a1c14]",
};

/** Formulário de Server Action com estado (`useActionState`) e mensagem fixa de sucesso/erro. */
export function ActionForm({ action, submitLabel, pendingLabel, disabled, disabledReason, ariaLabel, variant = "primary", className, children }: Props) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  return (
    <form action={formAction} className={className ?? "flex flex-col gap-3"}>
      {children}
      {state.status === "error" ? (
        <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-3 py-2.5 text-[13px] font-bold">
          {state.message}
        </p>
      ) : null}
      {state.status === "ok" ? (
        <p role="status" className="bg-verde-certo/20 text-verde-fundo rounded-campo px-3 py-2.5 text-[13px] font-bold">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        aria-label={ariaLabel}
        disabled={disabled || pending}
        className={`rounded-botao focus-visible:outline-verde-fundo flex h-[52px] items-center justify-center px-6 text-base font-extrabold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 ${BUTTON[variant]}`}
      >
        {pending ? (pendingLabel ?? "Enviando...") : submitLabel}
      </button>
      {disabled && disabledReason ? <p className="text-texto-3 text-[12px] font-semibold">{disabledReason}</p> : null}
    </form>
  );
}
