"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Button, type ButtonVariant } from "./Button";

type Props = {
  /** Texto do botão que abre a confirmação. */
  triggerLabel: string;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  /** Ação confirmada; devolve `{ ok: false, message }` para mostrar o erro dentro do diálogo. */
  onConfirm?: () => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Alternativa para Server Actions de formulário: campos ocultos e `action`. Ignorada se houver `onConfirm`. */
  action?: (formData: FormData) => void | Promise<void>;
  hidden?: Record<string, string>;
  /** `link` = texto sublinhado em `erro-texto` (linha de tabela); `button` = botão de contorno. */
  triggerStyle?: "link" | "button";
  /** Variante do gatilho quando `triggerStyle` é `button` (padrão `danger`). */
  triggerVariant?: ButtonVariant;
  /** Variante do botão de confirmar (padrão `danger`; `primary` para confirmar uma decisão que não destrói nada, mas tem efeito). */
  confirmVariant?: ButtonVariant;
  /** Desabilita o gatilho (ex.: decisão bloqueada por pendências). */
  triggerDisabled?: boolean;
};

/** Confirmar de um formulário com Server Action: durante o envio fica desabilitado e anuncia (`aria-busy`), então o segundo toque não reenvia. */
function ActionConfirm({ variant, label }: { variant: ButtonVariant; label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} className="flex-1" loading={pending}>
      {label}
    </Button>
  );
}

/**
 * Confirmação destrutiva única do produto (D-11): `<dialog>` nativo, foco preso pelo navegador, Esc fecha,
 * botão de risco por último e em `erro-texto`. Substitui `window.confirm` e os diálogos avulsos.
 */
export function ConfirmDialog({ triggerLabel, title, body, confirmLabel, pendingLabel, onConfirm, action, hidden, triggerStyle = "link", triggerVariant = "danger", confirmVariant = "danger", triggerDisabled = false }: Props) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!onConfirm) return;
    setPending(true);
    setError(null);
    const r = await onConfirm();
    setPending(false);
    if (r.ok) ref.current?.close();
    else setError(r.message);
  }

  const cancel = (
    <Button variant="outline" className="flex-1" onClick={() => ref.current?.close()}>
      Cancelar
    </Button>
  );

  return (
    <>
      {triggerStyle === "link" ? (
        <button
          type="button"
          disabled={triggerDisabled}
          onClick={() => ref.current?.showModal()}
          className="text-erro-texto inline-flex min-h-11 items-center text-[13px] font-extrabold underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-verde-fundo"
        >
          {triggerLabel}
        </button>
      ) : (
        <Button variant={triggerVariant} disabled={triggerDisabled} onClick={() => ref.current?.showModal()}>
          {triggerLabel}
        </Button>
      )}
      <dialog ref={ref} onClose={() => setError(null)} aria-labelledby={titleId} className="m-auto rounded-[20px] bg-white p-0 backdrop:bg-black/40">
        <form action={onConfirm ? undefined : action} onSubmit={onConfirm ? (e) => e.preventDefault() : () => queueMicrotask(() => ref.current?.close())} className="flex w-[min(92vw,420px)] flex-col gap-4 p-6">
          {Object.entries(hidden ?? {}).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <h2 id={titleId} className="text-[18px] font-extrabold">
            {title}
          </h2>
          <div className="text-texto-2 text-[14px] font-semibold">{body}</div>
          {error ? (
            <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-3 py-2.5 text-[13px] font-bold">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            {cancel}
            {onConfirm ? (
              <Button type="button" variant={confirmVariant} className="flex-1" disabled={pending} onClick={run}>
                {pending ? (pendingLabel ?? "Aguarde…") : confirmLabel}
              </Button>
            ) : (
              <ActionConfirm variant={confirmVariant} label={confirmLabel} />
            )}
          </div>
        </form>
      </dialog>
    </>
  );
}
