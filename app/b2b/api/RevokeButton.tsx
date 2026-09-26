"use client";

import { useRef, useState } from "react";

import { revokeKeyAction } from "@/features/b2b/actions";

// "Revogar" (B2B02): confirmação com o aviso do design ("A chave para de funcionar imediatamente"). Sem texto de
// chave nenhum aqui — só o `keyId`.

export function RevokeButton({ keyId }: { keyId: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);
    const r = await revokeKeyAction({ keyId });
    setPending(false);
    if (r.ok) ref.current?.close();
    else setError(r.message);
  }

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className="text-[13px] font-extrabold text-[#8a1c14] underline">
        Revogar
      </button>
      <dialog ref={ref} onClose={() => setError(null)} className="rounded-[20px] bg-white p-0 backdrop:bg-black/40">
        <div className="flex w-[min(92vw,420px)] flex-col gap-4 p-6">
          <h2 className="text-[18px] font-extrabold">Revogar chave</h2>
          <p className="text-texto-2 text-[14px] font-semibold">A chave para de funcionar imediatamente. Esta ação não pode ser desfeita.</p>
          {error ? <p role="alert" className="bg-[#fde2e0] text-[#8a1c14] rounded-campo px-3 py-2.5 text-[13px] font-bold">{error}</p> : null}
          <div className="flex gap-2">
            <button type="button" onClick={() => ref.current?.close()} className="border-tinta rounded-botao flex h-11 flex-1 items-center justify-center border-[1.5px] text-[14px] font-extrabold">
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={pending}
              className="rounded-botao flex h-11 flex-1 items-center justify-center border-[1.5px] border-[#8a1c14] text-[14px] font-extrabold text-[#8a1c14] disabled:opacity-50"
            >
              {pending ? "Revogando..." : "Revogar agora"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
