"use client";

import { useActionState, useRef, type ReactNode } from "react";

import { Button, buttonClass } from "@/components/ui/Button";

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
  /** D-006: pede confirmação (diálogo único do produto, `<dialog>`) antes de enviar — para ações terminais e imediatas (ex.: aprovar). */
  confirmMessage?: string;
};

/** Formulário de Server Action com estado (`useActionState`) e mensagem fixa de sucesso/erro. */
export function ActionForm({ action, submitLabel, pendingLabel, disabled, disabledReason, ariaLabel, variant = "primary", className, children, confirmMessage }: Props) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <form
      action={formAction}
      className={className ?? "flex flex-col gap-3"}
    >
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
        type={confirmMessage ? "button" : "submit"}
        onClick={confirmMessage ? () => dialog.current?.showModal() : undefined}
        aria-label={ariaLabel}
        disabled={disabled || pending}
        className={buttonClass(variant)}
      >
        {pending ? (pendingLabel ?? "Enviando...") : submitLabel}
      </button>
      {confirmMessage ? (
        <dialog ref={dialog} aria-label="Confirmar ação" className="m-auto rounded-[20px] bg-white p-0 backdrop:bg-black/40">
          <div className="flex w-[min(92vw,420px)] flex-col gap-4 p-6">
            <p className="text-[15px] font-bold">{confirmMessage}</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => dialog.current?.close()}>
                Cancelar
              </Button>
              <Button type="submit" variant={variant === "danger" ? "danger" : "primary"} className="flex-1" onClick={() => dialog.current?.close()}>
                {submitLabel}
              </Button>
            </div>
          </div>
        </dialog>
      ) : null}
      {disabled && disabledReason ? <p className="text-texto-3 text-[12px] font-semibold">{disabledReason}</p> : null}
    </form>
  );
}
