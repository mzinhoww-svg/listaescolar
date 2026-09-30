"use client";

import Link from "next/link";
import { startTransition, useActionState, useRef, useState, type DragEvent, type FormEvent } from "react";

import { safeSubmit } from "@/app/enviar-lista/safe-submit";
import { clientCheck, formatSize, pickedFile } from "@/components/submissions/clientChecks";
import { ConsentField } from "@/components/submissions/ConsentField";
import { BoltIcon, CheckIcon, FileIcon, UploadIcon } from "@/components/submissions/icons";
import { prepareUpload } from "@/components/submissions/prepareUpload";
import { LinkedSchoolSelect, type LinkedSchool } from "@/components/submissions/SchoolPicker";
import { SeriesFields } from "@/components/submissions/SeriesFields";
import { Button } from "@/components/ui/Button";
import { ACCEPT_ATTR, FORM_ERROR_ID, REDUCED_NOTE } from "@/features/submissions/copy";
import { idleState } from "@/features/submissions/form-schema";
import { isRetryable } from "@/features/submissions/network";

const TIPS = [
  "PDF gerado pelo computador lê melhor que escaneado.",
  "Uma série por arquivo.",
  "Quantidades escritas junto de cada item.",
];

type Props = { schools: readonly LinkedSchool[]; initialSchoolId: string | null; years: number[]; defaultYear: number; idempotencyKey?: string };

/** Escola08-UploadPDF: área de envio, dados da lista e dicas. Sem porcentagem inventada; chave de idempotência por tela (toque duplo cria um envio só). */
export function SchoolUploadForm({ schools, initialSchoolId, years, defaultYear, idempotencyKey }: Props) {
  const [state, action, pending] = useActionState(safeSubmit, idleState);
  const [picked, setPicked] = useState<{ name: string; size: number } | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<typeof state | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [over, setOver] = useState(false);
  // O envio já preparado: "Tentar de novo" reenvia ESTE, sem pedir série, consentimento e arquivo de novo.
  const [lastSent, setLastSent] = useState<FormData | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const sync = () => {
    const f = input.current?.files?.[0];
    setPicked(f ? { name: f.name, size: f.size } : null);
    setReduced(false);
    setClientError(null);
    setDismissed(state);
  };
  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setOver(false);
    if (input.current && e.dataTransfer.files.length > 0) {
      input.current.files = e.dataTransfer.files;
      sync();
    }
  };
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const problem = clientCheck(form, { compressImages: true });
    setClientError(problem);
    if (problem) return;
    const data = new FormData(form);
    const original = pickedFile(form);
    if (original) {
      setPreparing(true);
      const prepared = await prepareUpload(original);
      setPreparing(false);
      if (!prepared.ok) return void setClientError(prepared.message);
      setReduced(prepared.compressed);
      data.delete("file");
      data.append("file", prepared.file);
    }
    setLastSent(data);
    setDismissed(state);
    startTransition(() => action(data));
  };
  const retry = () => {
    if (lastSent) startTransition(() => action(lastSent));
  };

  const server = state.status === "error" && state !== dismissed ? state : null;
  const message = clientError ?? server?.message ?? null;
  const canRetry = clientError === null && server !== null && isRetryable(server.code) && lastSent !== null;
  const busy = pending || preparing;

  return (
    <form action={action} onSubmit={onSubmit} noValidate className="grid items-start gap-5 lg:grid-cols-[1fr_374px]">
      {idempotencyKey ? <input type="hidden" name="idempotencyKey" value={idempotencyKey} /> : null}
      <div className="flex flex-col gap-5">
        <section
          aria-label="Área de envio"
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={`flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-[24px] border-2 border-dashed p-6 text-center lg:p-8 ${over ? "border-verde-fundo bg-verde-certo/10" : "border-linha"}`}
        >
          <span className="bg-tinta text-papel mb-2 grid size-[60px] place-items-center rounded-2xl">
            <UploadIcon />
          </span>
          <p className="text-xl font-extrabold">Envie o arquivo da lista</p>
          <p className="text-texto-3 text-sm font-semibold">
            <span className="hidden lg:inline">Arraste o arquivo para cá ou escolha no computador. </span>PDF ou foto · até 4 MB
          </p>
          <Button variant="outline" onClick={() => input.current?.click()}>
            Escolher arquivo
          </Button>
          <input ref={input} id="file" name="file" type="file" accept={ACCEPT_ATTR} onChange={sync} className="sr-only" tabIndex={-1} aria-label="Arquivo da lista" />
        </section>

        {picked ? (
          <section aria-label="Arquivo escolhido" className="rounded-[24px] bg-white p-5">
            <p className="flex items-center gap-3">
              <FileIcon className="shrink-0" />
              <span className="flex min-w-0 flex-col">
                <span data-testid="picked" className="text-[15px] font-extrabold break-words">{picked.name}</span>
                <span className="text-texto-3 text-xs font-semibold">{formatSize(picked.size)}</span>
              </span>
            </p>
            {reduced ? <p role="status" className="text-texto-2 mt-3 text-[13px] font-semibold">{REDUCED_NOTE}</p> : null}
            {busy ? (
              <div role="status" className="mt-4 flex flex-col gap-2">
                <span className="bg-campo block h-2 overflow-hidden rounded-full">
                  <span className="bg-verde-certo block h-full w-1/3 motion-safe:animate-pulse rounded-full" />
                </span>
                <span className="text-verde-fundo flex items-center gap-2 text-[13px] font-extrabold">
                  <BoltIcon size={16} /> {preparing ? "Preparando o arquivo" : "Enviando e iniciando a leitura automática"}
                </span>
              </div>
            ) : null}
          </section>
        ) : null}

        <section aria-label="Dados da lista" className="flex max-w-[560px] flex-col gap-4">
          <LinkedSchoolSelect schools={schools} initialId={initialSchoolId} />
          <SeriesFields years={years} defaultYear={defaultYear} />
          <ConsentField invalid={message !== null && /consentimento/i.test(message)} />
          <div aria-live="polite" className="flex flex-col gap-3">
            {message ? (
              <div id={FORM_ERROR_ID} role="alert" className="bg-erro-fundo text-erro-texto flex flex-col gap-3 rounded-campo p-3.5 text-[14px] leading-[1.4] font-semibold">
                <p>
                  {message}
                  {canRetry ? (
                    <>
                      {" "}Se o envio já tiver chegado, ele aparece em <Link href="/escola" className="underline">Minhas escolas</Link>.
                    </>
                  ) : null}
                </p>
                {canRetry ? <Button variant="danger" onClick={retry}>Tentar de novo</Button> : null}
              </div>
            ) : null}
          </div>
          <Button type="submit" size="lg" loading={busy} className="w-fit">
            Enviar para revisão
          </Button>
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
        <p className="border-linha text-verde-fundo mt-5 border-t pt-4 text-sm font-extrabold">A ListaCerta confere a lista antes de publicar; se precisar, a equipe revisa.</p>
      </aside>
    </form>
  );
}
