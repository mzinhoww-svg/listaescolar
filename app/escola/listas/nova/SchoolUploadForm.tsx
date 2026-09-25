"use client";

import { useActionState, useRef, useState, type DragEvent, type FormEvent } from "react";

import { submitListAction } from "@/app/enviar-lista/actions";
import { clientCheck, formatSize } from "@/components/submissions/clientChecks";
import { ConsentField } from "@/components/submissions/ConsentField";
import { BoltIcon, CheckIcon, FileIcon, UploadIcon } from "@/components/submissions/icons";
import { LinkedSchoolSelect, type LinkedSchool } from "@/components/submissions/SchoolPicker";
import { SeriesFields } from "@/components/submissions/SeriesFields";
import { ACCEPT_ATTR } from "@/features/submissions/copy";
import { idleState } from "@/features/submissions/form-schema";

const TIPS = [
  "PDF gerado pelo computador lê melhor que escaneado.",
  "Uma série por arquivo.",
  "Quantidades escritas junto de cada item.",
];

/** Escola08-UploadPDF (1280×800): área de envio, dados da lista e dicas. Sem porcentagem inventada. */
export function SchoolUploadForm({ schools, initialSchoolId, years, defaultYear }: { schools: readonly LinkedSchool[]; initialSchoolId: string | null; years: number[]; defaultYear: number }) {
  const [state, action, pending] = useActionState(submitListAction, idleState);
  const [picked, setPicked] = useState<{ name: string; size: number } | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const sync = () => {
    const f = input.current?.files?.[0];
    setPicked(f ? { name: f.name, size: f.size } : null);
    setClientError(null);
  };
  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setOver(false);
    if (input.current && e.dataTransfer.files.length > 0) {
      input.current.files = e.dataTransfer.files;
      sync();
    }
  };
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    const problem = clientCheck(e.currentTarget);
    setClientError(problem);
    if (problem) e.preventDefault();
  };
  const message = clientError ?? (state.status === "error" ? state.message : null);

  return (
    <form action={action} onSubmit={onSubmit} noValidate className="grid items-start gap-5 lg:grid-cols-[1fr_374px]">
      <div className="flex flex-col gap-5">
        <section
          aria-label="Área de envio"
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={`flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-[24px] border-2 border-dashed p-8 text-center ${over ? "border-verde-fundo bg-verde-certo/10" : "border-[#c9c3b3]"}`}
        >
          <span className="bg-tinta text-papel mb-2 grid size-[60px] place-items-center rounded-2xl">
            <UploadIcon />
          </span>
          <p className="text-xl font-extrabold">Arraste o PDF aqui</p>
          <p className="text-texto-3 text-sm font-semibold">
            ou{" "}
            <button type="button" onClick={() => input.current?.click()} className="text-tinta font-bold underline">
              escolha no computador
            </button>{" "}
            · até 4 MB
          </p>
          <input ref={input} id="file" name="file" type="file" accept={ACCEPT_ATTR} onChange={sync} className="sr-only" tabIndex={-1} aria-label="Arquivo da lista" />
        </section>

        {picked ? (
          <section aria-label="Arquivo escolhido" className="rounded-[24px] bg-white p-5">
            <p className="flex items-center gap-3">
              <FileIcon className="shrink-0" />
              <span className="flex flex-col">
                <span data-testid="picked" className="text-[15px] font-extrabold">{picked.name}</span>
                <span className="text-texto-3 text-xs font-semibold">{formatSize(picked.size)}</span>
              </span>
            </p>
            {pending ? (
              <div role="status" className="mt-4 flex flex-col gap-2">
                <span className="bg-campo block h-2 overflow-hidden rounded-full">
                  <span className="bg-verde-certo block h-full w-1/3 animate-pulse rounded-full" />
                </span>
                <span className="text-verde-fundo flex items-center gap-2 text-[13px] font-extrabold">
                  <BoltIcon size={16} /> A IA está lendo os itens e as quantidades
                </span>
              </div>
            ) : null}
          </section>
        ) : null}

        <section aria-label="Dados da lista" className="flex max-w-[560px] flex-col gap-4">
          <LinkedSchoolSelect schools={schools} initialId={initialSchoolId} />
          <SeriesFields years={years} defaultYear={defaultYear} />
          <ConsentField invalid={message !== null && /consentimento/i.test(message)} />
          <div aria-live="polite">
            {message ? (
              <p role="alert" className="text-[13px] font-bold text-red-700">
                {message}
              </p>
            ) : null}
          </div>
          <button type="submit" disabled={pending} className="bg-tinta text-papel flex h-14 w-fit items-center justify-center rounded-botao px-8 text-base font-extrabold disabled:opacity-60">
            {pending ? "Enviando…" : "Enviar para revisão"}
          </button>
        </section>
      </div>

      <aside className="rounded-[24px] bg-white p-6">
        <h2 className="mb-4 text-lg font-extrabold">Para a leitura sair certa</h2>
        <ul className="flex flex-col gap-3">
          {TIPS.map((t) => (
            <li key={t} className="flex items-start gap-3 text-[15px] leading-[1.3] font-semibold">
              <span className="bg-tinta text-verde-certo mt-0.5 grid size-5 shrink-0 place-items-center rounded-md">
                <CheckIcon size={14} />
              </span>
              {t}
            </li>
          ))}
        </ul>
        <p className="border-linha text-verde-fundo mt-5 border-t pt-4 text-sm font-extrabold">Nada é publicado sem a sua revisão.</p>
      </aside>
    </form>
  );
}
