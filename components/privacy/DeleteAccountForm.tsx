"use client";

import { useActionState, useState } from "react";

import { deleteAccountAction, type DeleteAccountResult } from "@/app/conta/privacidade/actions";
import { Button } from "@/components/ui/Button";
import { fieldInputClass } from "@/components/ui/Field";
import { InlineStatus } from "@/components/ui/InlineStatus";
import { DELETE_ACCOUNT_CONFIRMATION_WORD } from "@/features/privacy/schemas";

/** Exclusão real e irreversível: exige digitar a palavra de confirmação, que continua no campo depois de um erro. */
export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState(deleteAccountAction, { status: "ok" } as DeleteAccountResult);
  // Controlado: a Server Action reinicializa campos não controlados de `<form action>` depois de concluir, inclusive em erro.
  const [typed, setTyped] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label htmlFor="confirmation" className="text-[14px] font-extrabold">
        Digite &ldquo;{DELETE_ACCOUNT_CONFIRMATION_WORD}&rdquo; para confirmar
      </label>
      <input
        id="confirmation"
        name="confirmation"
        type="text"
        autoComplete="off"
        placeholder={DELETE_ACCOUNT_CONFIRMATION_WORD}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        aria-invalid={state.status === "error" ? true : undefined}
        aria-describedby={state.status === "error" ? "confirmation-erro" : undefined}
        className={fieldInputClass}
      />
      <div aria-live="polite">
        {state.status === "error" ? (
          <InlineStatus tone="error">
            <span id="confirmation-erro">{state.message}</span>
          </InlineStatus>
        ) : null}
      </div>
      {/* A palavra digitada acima é a confirmação (mais forte que o diálogo, ficha J3 e Ruling da S17): o checker a aceita por `data-ui`. */}
      <Button type="submit" variant="danger" size="lg" className="w-full" loading={pending} data-ui="native-ok">
        Excluir minha conta
      </Button>
    </form>
  );
}
