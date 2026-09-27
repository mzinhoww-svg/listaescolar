"use client";

import { useActionState } from "react";

import { deleteAccountAction, type DeleteAccountResult } from "@/app/conta/privacidade/actions";
import { DELETE_ACCOUNT_CONFIRMATION_WORD } from "@/features/privacy/schemas";

const danger = "border-erro-texto text-erro-texto flex h-14 w-full items-center justify-center rounded-botao border-[1.5px] text-base font-extrabold disabled:opacity-60";
const field = "bg-campo text-tinta h-14 w-full rounded-campo px-4 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-verde-fundo";

/** App nova (sem tela de referência, S17): exclusão real e irreversível — exige digitar a palavra de confirmação. */
export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState(deleteAccountAction, { status: "ok" } as DeleteAccountResult);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label htmlFor="confirmation" className="text-[13px] font-extrabold">
        Digite &ldquo;{DELETE_ACCOUNT_CONFIRMATION_WORD}&rdquo; para confirmar
      </label>
      <input
        id="confirmation"
        name="confirmation"
        type="text"
        autoComplete="off"
        placeholder={DELETE_ACCOUNT_CONFIRMATION_WORD}
        className={field}
      />
      <div aria-live="polite">
        {state.status === "error" ? (
          <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[13px] font-bold">
            {state.message}
          </p>
        ) : null}
      </div>
      <button type="submit" disabled={pending} className={danger}>
        {pending ? "Excluindo…" : "Excluir minha conta"}
      </button>
    </form>
  );
}
