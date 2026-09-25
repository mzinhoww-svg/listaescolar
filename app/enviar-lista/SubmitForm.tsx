"use client";

import Link from "next/link";
import { useActionState, useRef, useState, type FormEvent } from "react";

import { clientCheck, formatSize } from "@/components/submissions/clientChecks";
import { ConsentField } from "@/components/submissions/ConsentField";
import { BoltIcon, CameraIcon, ChevronLeftIcon, ClockIcon } from "@/components/submissions/icons";
import { ProcessingScreen } from "@/components/submissions/ProcessingScreen";
import { SeriesFields } from "@/components/submissions/SeriesFields";
import { ACCEPT_ATTR, REVIEW_NOTICE } from "@/features/submissions/copy";
import { idleState } from "@/features/submissions/form-schema";

import { submitListAction } from "./actions";

const primary = "bg-tinta text-papel flex h-14 w-full items-center justify-center gap-2 rounded-botao text-base font-extrabold disabled:opacity-60";
const outline = "border-tinta text-tinta flex h-[52px] w-full items-center justify-center gap-2 rounded-botao border-[1.5px] text-base font-extrabold";

/** App15-EnviarLista + App06-Foto (390×844). O arquivo vai pela Server Action; a tela App20 cobre o envio. */
export function SubmitForm({ years, defaultYear }: { years: number[]; defaultYear: number }) {
  const [state, action, pending] = useActionState(submitListAction, idleState);
  const [picked, setPicked] = useState<{ name: string; size: number } | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  const onPick = (own: HTMLInputElement | null, other: HTMLInputElement | null) => {
    const file = own?.files?.[0];
    if (other) other.value = ""; // um só arquivo por envio
    setPicked(file ? { name: file.name, size: file.size } : null);
    setClientError(null);
  };
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    const problem = clientCheck(e.currentTarget);
    setClientError(problem);
    if (problem) e.preventDefault();
  };
  const message = clientError ?? (state.status === "error" ? state.message : null);

  return (
    <>
      <form action={action} onSubmit={onSubmit} noValidate className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-1 flex-col gap-4 px-5 pt-14 pb-9">
        <header className="relative flex h-12 items-center justify-center">
          <Link href="/" aria-label="Voltar" className="bg-campo absolute left-0 grid size-12 place-items-center rounded-full">
            <ChevronLeftIcon />
          </Link>
          <h1 className="text-base font-extrabold">Enviar lista</h1>
        </header>
        <p className="flex items-start gap-2.5 rounded-2xl bg-[#fdebd3] p-3.5 text-[13px] leading-[1.4] font-semibold text-[#7a4a0a]">
          <ClockIcon size={16} className="mt-0.5 shrink-0" />
          {REVIEW_NOTICE}
        </p>

        <section aria-label="Foto ou arquivo da lista" className="flex flex-col gap-3">
          <p className="bg-verde-certo/15 text-verde-fundo flex items-center gap-3 rounded-2xl p-3.5 text-[13px] leading-[1.4] font-bold">
            <span className="bg-verde-certo text-tinta grid size-9 shrink-0 place-items-center rounded-full">
              <BoltIcon size={18} />
            </span>
            A IA lê a lista, identifica cada item e confere as quantidades.
          </p>
          <input ref={camera} name="file" type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-label="Tirar foto da lista" onChange={() => onPick(camera.current, gallery.current)} />
          <input ref={gallery} id="file" name="file" type="file" accept={ACCEPT_ATTR} className="sr-only" tabIndex={-1} aria-label="Arquivo da lista" onChange={() => onPick(gallery.current, camera.current)} />
          <button type="button" className={`${primary} h-14`} onClick={() => camera.current?.click()}>
            <CameraIcon size={18} /> Tirar foto
          </button>
          <button type="button" className={outline} onClick={() => gallery.current?.click()}>
            Escolher da galeria ou PDF
          </button>
          {picked ? (
            <p data-testid="picked" className="text-texto-2 text-center text-[13px] font-bold">
              {picked.name} · {formatSize(picked.size)}
            </p>
          ) : null}
        </section>

        <SeriesFields years={years} defaultYear={defaultYear} />
        <ConsentField invalid={message !== null && /consentimento/i.test(message)} />
        <div aria-live="polite">
          {message ? (
            <p role="alert" className="text-[13px] font-bold text-red-700">
              {message}
            </p>
          ) : null}
        </div>
        <button type="submit" disabled={pending} className={`${primary} mt-auto`}>
          Enviar para revisão
        </button>
      </form>
      {pending ? (
        <div className="fixed inset-0 z-50 overflow-auto">
          <ProcessingScreen phase="sending" title="Enviando sua lista" subtitle="Guardando o arquivo e iniciando a leitura." />
        </div>
      ) : null}
    </>
  );
}
