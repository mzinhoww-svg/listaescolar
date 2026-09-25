"use client";

import { startTransition, useActionState, useRef, useState } from "react";

import { ImportResult } from "@/components/admin/ImportResult";
import { IDLE, uploadFileSchema, type UploadState } from "@/features/schools/upload-schema";

import { uploadInepCsv } from "./actions";

type Sent = { file: File; isDemo: boolean };

export function UploadForm() {
  const [state, formAction, pending] = useActionState<UploadState, FormData>(uploadInepCsv, IDLE);
  const [localError, setLocalError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  // Último envio guardado em memória: o formulário é zerado pelo React 19 após cada action, então o
  // retry não pode reler o input de arquivo.
  const lastSent = useRef<Sent | null>(null);

  function send({ file, isDemo }: Sent) {
    lastSent.current = { file, isDemo };
    const fd = new FormData();
    fd.set("file", file);
    if (isDemo) fd.set("isDemo", "on");
    startTransition(() => formAction(fd));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("file");
    const demo = e.currentTarget.elements.namedItem("isDemo");
    const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
    const check =
      file && file.size > 0
        ? uploadFileSchema.safeParse({ name: file.name, size: file.size, type: file.type })
        : null;
    if (!file || !check) return setLocalError("Selecione um arquivo CSV.");
    if (!check.success) return setLocalError(check.error.issues[0]?.message ?? "Arquivo inválido.");
    setLocalError(null);
    send({ file, isDemo: demo instanceof HTMLInputElement && demo.checked });
  }

  const retry = () => {
    if (lastSent.current) send(lastSent.current);
  };
  const message = localError ?? (state.status === "error" ? state.message : null);

  return (
    <div className="flex flex-col gap-5">
      <form
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
            onChange={(e) => {
              setLocalError(null);
              setFileName(e.currentTarget.files?.[0]?.name ?? null);
            }}
            className="peer sr-only"
          />
          <span className="flex items-center gap-3 font-normal peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2">
            <span className="bg-campo rounded-botao px-4 py-2 text-[15px] font-extrabold">Escolher arquivo</span>
            <span className="text-texto-2 truncate">{fileName ?? "Nenhum arquivo selecionado"}</span>
          </span>
        </label>
        <label className="flex items-center gap-2 text-[15px]">
          <input type="checkbox" name="isDemo" className="size-4" />
          Importação de demonstração (dados fictícios)
        </label>
        <p className="text-texto-3 text-[13px]">Até 4 MB. Arquivos maiores entram pelo script de importação.</p>
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
              onClick={retry}
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

      {state.status === "success" && !localError ? <ImportResult {...state} onRetry={retry} /> : null}
    </div>
  );
}
