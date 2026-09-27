"use client";

import { useRef } from "react";

// Revogar chave pelo admin (Admin15): mesma confirmação do `RevokeButton` do dono ("A chave para de funcionar
// imediatamente"), sem duplicar a Server Action redirect-based (`adminRevokeKeyAction`) — o `<form>` já existente
// só ganha um `<dialog>` de confirmação na frente do envio (revisão final do branch S24: revogação do admin era
// irreversível e sem confirmação nenhuma).

type Act = (formData: FormData) => Promise<void>;

export function AdminRevokeButton({ partnerId, keyId, action }: { partnerId: string; keyId: string; action: Act }) {
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <form ref={formRef} action={action} className="ml-auto flex items-center gap-2">
      <input type="hidden" name="partnerId" value={partnerId} />
      <input type="hidden" name="keyId" value={keyId} />
      <input type="hidden" name="reason" value="revogada pelo admin" />
      <button type="button" onClick={() => dialogRef.current?.showModal()} className="text-[13px] font-extrabold text-[#8a1c14] underline">
        Revogar
      </button>
      <dialog ref={dialogRef} className="m-auto rounded-[20px] bg-white p-0 backdrop:bg-black/40">
        <div className="flex w-[min(92vw,420px)] flex-col gap-4 p-6">
          <h2 className="text-[18px] font-extrabold">Revogar chave</h2>
          <p className="text-texto-2 text-[14px] font-semibold">A chave para de funcionar imediatamente. Esta ação não pode ser desfeita.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => dialogRef.current?.close()} className="border-tinta rounded-botao flex h-11 flex-1 items-center justify-center border-[1.5px] text-[14px] font-extrabold">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                dialogRef.current?.close();
                formRef.current?.requestSubmit();
              }}
              className="rounded-botao flex h-11 flex-1 items-center justify-center border-[1.5px] border-[#8a1c14] text-[14px] font-extrabold text-[#8a1c14]"
            >
              Revogar agora
            </button>
          </div>
        </div>
      </dialog>
    </form>
  );
}
