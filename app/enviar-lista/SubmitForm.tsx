"use client";

import Link from "next/link";
import { startTransition, useActionState, useRef, useState, type FormEvent } from "react";

import { clientChecks, pickedFile, type FieldErrors } from "@/components/submissions/clientChecks";
import { ConsentField } from "@/components/submissions/ConsentField";
import { FilePicker } from "@/components/submissions/FilePicker";
import { ChevronLeftIcon } from "@/components/submissions/icons";
import { prepareUpload } from "@/components/submissions/prepareUpload";
import { ProcessingScreen } from "@/components/submissions/ProcessingScreen";
import { SchoolSearchPicker, type SchoolHit } from "@/components/submissions/SchoolPicker";
import { SeriesFields } from "@/components/submissions/SeriesFields";
import { Button } from "@/components/ui/Button";
import { InlineStatus } from "@/components/ui/InlineStatus";
import { errorFieldFor, FORM_ERROR_ID, messageFor, REDUCED_NOTE, type ErrorField } from "@/features/submissions/copy";
import { idleState, type SubmitState } from "@/features/submissions/form-schema";
import { isControlFlowError, isRetryable, submitFailureCode } from "@/features/submissions/network";
import { trackUploadStarted } from "@/lib/analytics/track";

import { submitListAction } from "./actions";

/** Foco no primeiro campo com erro, na ordem da tela: arquivo, série, consentimento (UX-064). */
const FOCUS_ORDER: [ErrorField, string][] = [["file", "file-choose"], ["grade", "grade"], ["consent", "consent"]];

/**
 * A chamada da Server Action viaja por `fetch`: sem rede ela REJEITA. Sem este envoltório a rejeição derrubaria a tela
 * (limite de erro); aqui vira um estado de erro com "Tentar de novo". `redirect()` da action não é erro: mantém o estado.
 */
async function safeSubmit(prev: SubmitState, data: FormData): Promise<SubmitState> {
  try {
    return await submitListAction(prev, data);
  } catch (e) {
    if (isControlFlowError(e)) return prev;
    const code = submitFailureCode(e);
    return { status: "error", code, message: messageFor(code) };
  }
}

type Props = { years: number[]; defaultYear: number; initialSchool?: SchoolHit | null; initialGrade?: string; idempotencyKey?: string; readingAvailable?: boolean };

/** App15-EnviarLista + App06-Foto (390×844). O arquivo vai pela Server Action; a tela App20 cobre o envio. */
export function SubmitForm({ years, defaultYear, initialSchool = null, initialGrade = "", idempotencyKey, readingAvailable = true }: Props) {
  const [state, action, pending] = useActionState(safeSubmit, idleState);
  const [picked, setPicked] = useState<{ name: string; size: number } | null>(null);
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const [dismissed, setDismissed] = useState<SubmitState | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [reduced, setReduced] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  // O envio já preparado (série, consentimento, arquivo reduzido): "Tentar de novo" reenvia ESTE, sem pedir nada de novo.
  const [lastSent, setLastSent] = useState<FormData | null>(null);

  const clear = (key: ErrorField) => {
    setClientErrors((cur) => {
      const next = { ...cur };
      delete next[key];
      return next;
    });
    setDismissed(state);
  };
  const onPick = (own: HTMLInputElement | null, other: HTMLInputElement | null) => {
    const file = own?.files?.[0];
    if (other) other.value = ""; // um só arquivo por envio
    setPicked(file ? { name: file.name, size: file.size } : null);
    setReduced(false);
    clear("file");
  };
  const onChange = (e: FormEvent<HTMLFormElement>) => {
    const name = (e.target as HTMLInputElement).name;
    if (name === "grade" || name === "consent") clear(name);
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const problems = clientChecks(form, { compressImages: true });
    setClientErrors(problems);
    const first = FOCUS_ORDER.find(([field]) => problems[field] !== undefined);
    if (first) return void document.getElementById(first[1])?.focus();
    const data = new FormData(form);
    const original = pickedFile(form);
    if (original) trackUploadStarted(original, data.get("schoolId") !== "");
    if (original) {
      setPreparing(true);
      const prepared = await prepareUpload(original);
      setPreparing(false);
      if (!prepared.ok) return void setClientErrors({ file: prepared.message });
      setReduced(prepared.compressed);
      data.delete("file");
      data.append("file", prepared.file);
    }
    setLastSent(data);
    startTransition(() => action(data));
  };
  const retry = () => {
    if (lastSent) startTransition(() => action(lastSent));
  };

  const server = state.status === "error" && state !== dismissed ? state : null;
  const serverField = errorFieldFor(server?.message ?? null);
  const errors: FieldErrors = { ...(server && serverField ? { [serverField]: server.message } : {}), ...clientErrors };
  const general = server && !serverField ? server : null;
  const canRetry = general !== null && isRetryable(general.code) && lastSent !== null;

  return (
    <>
      <main id="conteudo" className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-1 flex-col">
        <form action={action} onSubmit={onSubmit} onChange={onChange} noValidate className="flex w-full flex-1 flex-col gap-5 px-6 pt-6 pb-9">
          {idempotencyKey ? <input type="hidden" name="idempotencyKey" value={idempotencyKey} /> : null}
          <header className="flex flex-col gap-3">
            <Link href={initialSchool ? `/escolas/${initialSchool.inep}` : "/conta"} aria-label="Voltar" className="bg-campo focus-visible:outline-verde-fundo grid size-12 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2">
              <ChevronLeftIcon />
            </Link>
            <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em]">Enviar a lista da escola</h1>
            <p className="text-texto-2 text-[14px] leading-[1.4] font-semibold">Mande a foto ou o PDF da lista que a escola entregou.</p>
          </header>

          <FilePicker camera={camera} gallery={gallery} picked={picked} error={errors.file} onPick={onPick} />
          {reduced ? <InlineStatus tone="info">{REDUCED_NOTE}</InlineStatus> : null}
          <SchoolSearchPicker initial={initialSchool} />
          <SeriesFields years={years} defaultYear={defaultYear} defaultGrade={initialGrade} error={errors.grade} />
          <ConsentField error={errors.consent} />

          <div aria-live="polite" className="flex flex-col gap-3">
            {preparing ? <InlineStatus tone="info">Preparando a foto…</InlineStatus> : null}
            {general ? (
              <div id={FORM_ERROR_ID} role="alert" className="bg-erro-fundo text-erro-texto flex flex-col gap-3 rounded-campo p-3.5 text-[14px] leading-[1.4] font-semibold">
                <p>
                  {general.message}
                  {canRetry ? (
                    <>
                      {" "}Toque em Tentar de novo. Se o envio já tiver chegado, ele aparece em{" "}
                      <Link href="/conta/envios" className="underline">Meus envios</Link>.
                    </>
                  ) : null}
                </p>
                {canRetry ? (
                  <Button variant="danger" className="w-full" onClick={retry}>
                    Tentar de novo
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          <Button type="submit" size="lg" loading={pending || preparing} className="mt-auto w-full">
            Enviar para revisão
          </Button>
        </form>
      </main>
      {pending ? (
        <div className="fixed inset-0 z-50 overflow-auto">
          <ProcessingScreen embedded phase="sending" title="Enviando sua lista" subtitle={`${readingAvailable ? "Guardando o arquivo e iniciando a leitura." : "Guardando o arquivo."}${reduced ? ` ${REDUCED_NOTE}` : ""}`} />
        </div>
      ) : null}
    </>
  );
}
