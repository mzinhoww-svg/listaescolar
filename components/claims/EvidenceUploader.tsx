"use client";

import { useActionState, useRef, useState } from "react";

import { IDLE, type ClaimActionState } from "@/features/claims/form-state";
import { formatBytes } from "@/features/claims/format";
import { EVIDENCE_WARNING } from "@/features/claims/messages";
import type { EvidenceView } from "@/features/claims/types";

import { ActionForm } from "./ActionForm";

type Act = (prev: ClaimActionState, formData: FormData) => Promise<ClaimActionState>;
export const MAX_FILES = 5;

type Props = {
  inep: string;
  claimId: string;
  evidence: EvidenceView[];
  evidenceNote: string | null;
  /** `insufficient_evidence` permite reescrever a nota; o reenvio exige arquivo novo ou nota alterada (regra do banco). */
  editableNote: boolean;
  upload: Act;
  remove: Act;
  submit: Act;
};

const MAX_BYTES = 4_000_000;

/** Até 5 arquivos (PDF/JPG/PNG, 4 MB), um por envio ao servidor; remover antes de enviar para análise. */
export function EvidenceUploader({ inep, claimId, evidence, evidenceNote, editableNote, upload, remove, submit }: Props) {
  const [state, uploadAction, pending] = useActionState(upload, IDLE);
  const [clientError, setClientError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const full = evidence.length >= MAX_FILES;

  const check = (e: React.FormEvent<HTMLFormElement>) => {
    const f = input.current?.files?.[0];
    const problem = !f || f.size === 0 ? "Escolha um arquivo PDF, PNG ou JPEG." : f.size > MAX_BYTES ? "O arquivo passa de 4 MB." : null;
    setClientError(problem);
    if (problem) e.preventDefault();
  };
  const message = clientError ?? (state.status === "error" ? state.message : null);

  return (
    <div className="flex flex-col gap-5">
      <p className="bg-aviso-fundo text-aviso-texto rounded-campo px-3 py-2.5 text-[13px] font-bold">{EVIDENCE_WARNING}</p>
      <form action={uploadAction} onSubmit={check} noValidate className="flex flex-col gap-3">
        <input type="hidden" name="inep" value={inep} />
        <input type="hidden" name="claimId" value={claimId} />
        <label className="flex flex-col gap-1.5 text-[14px] font-bold">
          Adicionar arquivo (PDF, JPG ou PNG, até 4 MB)
          <input ref={input} type="file" name="file" accept="application/pdf,image/jpeg,image/png" disabled={full} className="bg-campo rounded-campo p-3 text-[14px] font-semibold" />
        </label>
        {message ? <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-3 py-2.5 text-[13px] font-bold">{message}</p> : null}
        {state.status === "ok" && !clientError ? <p role="status" className="text-verde-fundo text-[13px] font-bold">{state.message}</p> : null}
        <button type="submit" disabled={pending || full} className="border-tinta text-tinta rounded-botao h-[52px] border-[1.5px] px-6 text-base font-extrabold disabled:opacity-50">
          {pending ? "Enviando arquivo..." : full ? `Limite de ${MAX_FILES} arquivos` : "Adicionar arquivo"}
        </button>
      </form>

      <section aria-label="Arquivos adicionados" className="flex flex-col gap-2">
        <h3 className="text-[15px] font-extrabold">Arquivos ({evidence.length}/{MAX_FILES})</h3>
        {evidence.length === 0 ? <p className="text-texto-3 text-[13px] font-semibold">Nenhum arquivo ainda.</p> : null}
        <ul className="flex flex-col gap-2">
          {evidence.map((e) => (
            <li key={e.id} className="bg-campo rounded-campo flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="min-w-0 text-[14px] font-bold">
                <span className="block truncate">{e.originalName}</span>
                <span className="text-texto-3 text-[12px] font-semibold">{formatBytes(e.sizeBytes)}</span>
              </span>
              <ActionForm action={remove} submitLabel="Remover" pendingLabel="Removendo..." variant="danger" className="flex items-center">
                <input type="hidden" name="inep" value={inep} />
                <input type="hidden" name="evidenceId" value={e.id} />
              </ActionForm>
            </li>
          ))}
        </ul>
      </section>

      <ActionForm action={submit} submitLabel="Enviar para análise" pendingLabel="Enviando..." disabled={evidence.length === 0 && !editableNote} disabledReason={evidence.length === 0 ? "Adicione ao menos um arquivo." : undefined}>
        <input type="hidden" name="inep" value={inep} />
        <input type="hidden" name="claimId" value={claimId} />
        {editableNote ? (
          <label className="flex flex-col gap-1.5 text-[14px] font-bold">
            Nota de evidência (até 500 caracteres)
            <textarea name="evidenceNote" maxLength={500} rows={3} defaultValue={evidenceNote ?? ""} className="bg-campo rounded-campo w-full p-3 text-[14px] font-medium" />
          </label>
        ) : null}
      </ActionForm>
    </div>
  );
}
