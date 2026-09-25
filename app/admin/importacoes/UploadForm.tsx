"use client";

import { useActionState, useRef, useState } from "react";

import { ImportResult } from "@/components/admin/ImportResult";
import { IDLE, uploadFileSchema, type UploadState } from "@/features/schools/upload-schema";

import { uploadInepCsv } from "./actions";

export function UploadForm() {
  const [state, formAction, pending] = useActionState<UploadState, FormData>(uploadInepCsv, IDLE);
  const [localError, setLocalError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const input = e.currentTarget.elements.namedItem("file");
    const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
    const check =
      file && file.size > 0
        ? uploadFileSchema.safeParse({ name: file.name, size: file.size, type: file.type })
        : null;
    if (!check) {
      e.preventDefault();
      setLocalError("Selecione um arquivo CSV.");
    } else if (!check.success) {
      e.preventDefault();
      setLocalError(check.error.issues[0]?.message ?? "Arquivo inválido.");
    } else setLocalError(null);
  }

  const message = localError ?? (state.status === "error" ? state.message : null);

  return (
    <div className="flex flex-col gap-5">
      <form
        ref={formRef}
        action={formAction}
        onSubmit={onSubmit}
        noValidate
        className="rounded-card bg-branco-tonal flex flex-col gap-4 px-6 py-6"
      >
        <label className="flex flex-col gap-2 text-[15px] font-extrabold">
          Arquivo CSV do INEP
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            onChange={() => setLocalError(null)}
            className="bg-campo rounded-campo px-4 py-3 text-[15px] font-normal"
          />
        </label>
        <label className="flex items-center gap-2 text-[15px]">
          <input type="checkbox" name="isDemo" className="size-4" />
          Importação de demonstração (dados fictícios)
        </label>
        <button
          type="submit"
          disabled={pending}
          className="bg-tinta text-papel h-[52px] w-fit rounded-botao px-8 text-base font-extrabold disabled:opacity-60"
        >
          {pending ? "Importando…" : "Importar"}
        </button>
      </form>

      {message ? (
        <div role="alert" className="rounded-campo flex flex-wrap items-center gap-3 bg-red-50 px-5 py-4 text-[15px] text-red-900">
          <span>{message}</span>
          {state.status === "error" && state.retryable && !localError ? (
            <button
              type="button"
              onClick={() => formRef.current?.requestSubmit()}
              className="rounded-botao border-[1.5px] border-red-900 px-4 py-1.5 text-sm font-extrabold"
            >
              Tentar novamente
            </button>
          ) : null}
        </div>
      ) : null}

      {state.status === "file_error" && !localError ? (
        <div role="alert" className="rounded-campo bg-red-50 px-5 py-4 text-[15px] text-red-900">
          <p className="font-extrabold">O arquivo não pôde ser importado.</p>
          <ul className="mt-2 list-disc pl-5">
            {state.errors.map((e, i) => (
              <li key={`${e.code}-${i}`}>{e.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.status === "success" && !localError ? <ImportResult {...state} /> : null}
    </div>
  );
}
