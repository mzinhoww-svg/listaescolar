"use client";

import { useActionState, useState } from "react";

import { IDLE, type ClaimActionState } from "@/features/claims/form-state";
import { EVIDENCE_WARNING, PRIVACY_TEXT } from "@/features/claims/messages";
import type { SchoolClaimContext } from "@/features/claims/types";

import { Button } from "@/components/ui/Button";
import { Field, fieldInputClass } from "@/components/ui/Field";
import { InlineStatus } from "@/components/ui/InlineStatus";

import { MethodPicker } from "./MethodPicker";

type Props = {
  action: (prev: ClaimActionState, formData: FormData) => Promise<ClaimActionState>;
  inep: string;
  methods: SchoolClaimContext["methods"];
  accountEmail: string | null;
};

type Errors = Record<string, string>;

/** Conferência barata no navegador (mensagens em português junto do campo); o servidor repete tudo. */
function check(form: HTMLFormElement): Errors {
  const d = new FormData(form);
  const text = (k: string) => String(d.get(k) ?? "").trim();
  const e: Errors = {};
  if (text("claimantName").length < 2) e.claimantName = "Escreva seu nome.";
  if (text("claimantRoleTitle").length < 2) e.claimantRoleTitle = "Escreva seu cargo na escola.";
  if (d.get("privacyAck") !== "on") e.privacyAck = "Marque a caixa para continuar.";
  if (!d.get("method")) e.method = "Escolha como confirmar seu vínculo.";
  return e;
}

/** Passos "Método" e "Responsável" da Escola01 (o passo "Escola" é o cartão acima do formulário). */
export function CreateClaimForm({ action, inep, methods, accountEmail }: Props) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const [note, setNote] = useState("");
  const [local, setLocal] = useState<Errors>({});
  const errors: Errors = { ...(state.status === "error" ? state.errors : {}), ...local };
  const bad = (k: string) => errors[k] !== undefined;
  const clear = (k: string) => setLocal((cur) => (k in cur ? Object.fromEntries(Object.entries(cur).filter(([key]) => key !== k)) : cur));
  return (
    <form
      action={formAction}
      noValidate
      onSubmit={(e) => {
        const problems = check(e.currentTarget);
        setLocal(problems);
        if (Object.keys(problems).length > 0) {
          e.preventDefault();
          const first = Object.keys(problems)[0];
          e.currentTarget.querySelector<HTMLElement>(first === "method" ? 'input[name="method"]' : `[name="${first}"]`)?.focus();
        }
      }}
      className="flex flex-col gap-6"
    >
      <input type="hidden" name="inep" value={inep} />
      <MethodPicker methods={methods} error={errors.method} />
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-[15px] font-extrabold">Responsável</legend>
        <Field id="claimantName" label="Seu nome" error={errors.claimantName}>
          <input id="claimantName" name="claimantName" maxLength={120} autoComplete="name" placeholder="Ex.: Maria da Silva" aria-invalid={bad("claimantName")} aria-describedby={bad("claimantName") ? "claimantName-erro" : undefined} onChange={() => clear("claimantName")} className={fieldInputClass} />
        </Field>
        <Field id="claimantRoleTitle" label="Seu cargo na escola" error={errors.claimantRoleTitle}>
          <input id="claimantRoleTitle" name="claimantRoleTitle" maxLength={80} placeholder="Ex.: secretário(a), diretor(a)" aria-invalid={bad("claimantRoleTitle")} aria-describedby={bad("claimantRoleTitle") ? "claimantRoleTitle-erro" : undefined} onChange={() => clear("claimantRoleTitle")} className={fieldInputClass} />
        </Field>
        <Field id="evidenceNote" label="Como você comprova o vínculo (opcional)" error={errors.evidenceNote} hint={`${note.length}/500 · ${EVIDENCE_WARNING}`}>
          <textarea
            id="evidenceNote"
            name="evidenceNote"
            maxLength={500}
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-invalid={bad("evidenceNote")}
            aria-describedby={bad("evidenceNote") ? "evidenceNote-erro" : undefined}
            className={`${fieldInputClass} h-auto resize-y py-3`}
          />
        </Field>
        <p className="text-texto-2 text-[13px] font-semibold">Você entra como {accountEmail ?? "indisponível"}.</p>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label className="flex items-start gap-3 text-[13px] leading-[1.4] font-semibold">
          <input type="checkbox" name="privacyAck" aria-invalid={bad("privacyAck")} aria-describedby={bad("privacyAck") ? "privacyAck-erro" : undefined} onChange={() => clear("privacyAck")} className="accent-tinta focus-visible:outline-verde-fundo mt-0.5 size-6 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2" />
          <span>{PRIVACY_TEXT}</span>
        </label>
        {errors.privacyAck ? <p id="privacyAck-erro" role="alert" className="text-erro-texto text-[13px] font-semibold">{errors.privacyAck}</p> : null}
      </div>
      {state.status === "error" ? <InlineStatus tone="error">{state.message}</InlineStatus> : null}
      <Button type="submit" size="lg" loading={pending}>
        Continuar
      </Button>
    </form>
  );
}
