"use client";

import { useRef, useState } from "react";

import { rotateKeyAction } from "@/features/b2b/actions";
import type { GeneratedApiKey } from "@/features/b2b/keys/format";
import { KEY_ROTATION_GRACE_DAYS } from "@/features/b2b/limits";

// "Rotacionar" (B2B02): cria uma chave nova (mesmo ambiente e escopos) e marca a antiga com carência (1/7/30
// dias, padrão 7). Mostra a chave NOVA uma vez, mesmo fluxo de cópia do `NewKeyDialog` — a antiga continua válida
// durante a carência, sem downtime.

const GRACE_OPTIONS = [1, 7, 30] as const;

export function RotateDialog({ keyId }: { keyId: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [graceDays, setGraceDays] = useState<number>(KEY_ROTATION_GRACE_DAYS.default);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  function close() {
    setResult(null);
    setError(null);
    setCopied(false);
    ref.current?.close();
  }

  async function submit() {
    setPending(true);
    setError(null);
    const r = await rotateKeyAction({ keyId, graceDays });
    setPending(false);
    if (r.ok) setResult(r.data);
    else setError(r.message);
  }

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className="text-verde-fundo text-[13px] font-extrabold underline">
        Rotacionar
      </button>
      <dialog ref={ref} onClose={close} className="m-auto rounded-[20px] bg-white p-0 backdrop:bg-black/40">
        <div className="flex w-[min(92vw,440px)] flex-col gap-4 p-6">
          {result ? (
            <>
              <h2 className="text-[18px] font-extrabold">Copie agora: esta chave não será mostrada de novo.</h2>
              <code className="bg-tinta text-papel rounded-campo block overflow-x-auto p-3 text-[13px] font-bold">{result.plaintext}</code>
              <p className="text-texto-3 text-[12px] font-semibold">A chave anterior continua válida por {graceDays} dia(s).</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(result.plaintext);
                    setCopied(true);
                  }}
                  className="border-tinta rounded-botao flex h-11 flex-1 items-center justify-center border-[1.5px] text-[14px] font-extrabold"
                >
                  {copied ? "Copiado" : "Copiar"}
                </button>
                <button type="button" onClick={close} className="bg-tinta text-papel rounded-botao flex h-11 flex-1 items-center justify-center text-[14px] font-extrabold">
                  Já copiei
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-[18px] font-extrabold">Rotacionar chave</h2>
              <p className="text-texto-2 text-[14px] font-semibold">Rotação sem downtime: a chave anterior vale pelos dias de carência escolhidos.</p>
              {error ? <p role="alert" className="bg-[#fde2e0] text-[#8a1c14] rounded-campo px-3 py-2.5 text-[13px] font-bold">{error}</p> : null}
              <fieldset className="flex flex-col gap-2">
                <legend className="text-[13px] font-bold">Carência da chave anterior</legend>
                <div className="flex gap-2">
                  {GRACE_OPTIONS.map((d) => (
                    <label key={d} className={`rounded-botao border-tinta flex-1 border-[1.5px] px-3 py-2 text-center text-[13px] font-bold ${graceDays === d ? "bg-verde-certo" : ""}`}>
                      <input type="radio" name="graceDays" className="sr-only" checked={graceDays === d} onChange={() => setGraceDays(d)} />
                      {d} dia{d > 1 ? "s" : ""}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex gap-2">
                <button type="button" onClick={close} className="border-tinta rounded-botao flex h-11 flex-1 items-center justify-center border-[1.5px] text-[14px] font-extrabold">
                  Cancelar
                </button>
                <button type="button" onClick={submit} disabled={pending} className="bg-tinta text-papel rounded-botao flex h-11 flex-1 items-center justify-center text-[14px] font-extrabold disabled:opacity-50">
                  {pending ? "Rotacionando..." : "Confirmar rotação"}
                </button>
              </div>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
