"use client";

import { useActionState, useState } from "react";

import { IDLE, type ClaimActionState } from "@/features/claims/form-state";
import { EVIDENCE_WARNING, PRIVACY_TEXT } from "@/features/claims/messages";
import type { SchoolClaimContext } from "@/features/claims/types";

import { MethodPicker } from "./MethodPicker";

type Props = {
  action: (prev: ClaimActionState, formData: FormData) => Promise<ClaimActionState>;
  inep: string;
  methods: SchoolClaimContext["methods"];
  accountEmail: string | null;
  privacyVersion: string;
};

const input = "bg-campo rounded-campo focus-visible:outline-verde-fundo h-12 w-full px-4 text-[15px] font-semibold outline-none focus-visible:outline-2";

/** Passos "Método" e "Responsável" da Escola01 (o passo "Escola" é o cartão acima do formulário). */
export function CreateClaimForm({ action, inep, methods, accountEmail, privacyVersion }: Props) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const [note, setNote] = useState("");
  const errors = state.status === "error" ? state.errors : {};
  const field = (name: string) => (errors[name] ? <p role="alert" className="text-erro-texto text-[12px] font-bold">{errors[name]}</p> : null);
  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="inep" value={inep} />
      <MethodPicker methods={methods} error={errors.method} />
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-[15px] font-extrabold">Responsável</legend>
        <label className="flex flex-col gap-1.5 text-[14px] font-bold">
          Seu nome
          <input name="claimantName" required minLength={2} maxLength={120} autoComplete="name" className={input} />
          {field("claimantName")}
        </label>
        <label className="flex flex-col gap-1.5 text-[14px] font-bold">
          Seu cargo na escola
          <input name="claimantRoleTitle" required minLength={2} maxLength={80} placeholder="Ex.: secretário(a), diretor(a)" className={input} />
          {field("claimantRoleTitle")}
        </label>
        <label className="flex flex-col gap-1.5 text-[14px] font-bold">
          Como você comprova o vínculo (opcional)
          <textarea
            name="evidenceNote"
            maxLength={500}
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="bg-campo rounded-campo focus-visible:outline-verde-fundo w-full resize-y p-4 text-[15px] font-medium outline-none focus-visible:outline-2"
          />
          <span className="text-texto-3 text-[12px] font-semibold">{note.length}/500 · {EVIDENCE_WARNING}</span>
          {field("evidenceNote")}
        </label>
        <p className="text-texto-2 text-[13px] font-semibold">Você entra como {accountEmail ?? "indisponível"}.</p>
      </fieldset>
      <label className="flex items-start gap-3 text-[13px] leading-[1.4] font-semibold">
        <input type="checkbox" name="privacyAck" required className="accent-tinta mt-0.5 size-4" />
        <span>
          {PRIVACY_TEXT} <span className="text-texto-3">(texto {privacyVersion})</span>
          {field("privacyAck")}
        </span>
      </label>
      {state.status === "error" ? (
        <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-3 py-2.5 text-[13px] font-bold">
          {state.message}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-tinta text-papel rounded-botao h-14 text-base font-extrabold disabled:opacity-60">
        {pending ? "Enviando..." : "Continuar"}
      </button>
    </form>
  );
}
