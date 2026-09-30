"use client";

import { useId, useRef } from "react";

import { Button } from "@/components/ui/Button";

/** Publicar preço é uma decisão com efeito: confirma com o resumo escrito. O envio usa o formulário `formId` (o diálogo não aninha formulário). */
export function PublishConfirm({ formId }: { formId: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <>
      <Button variant="primary" onClick={() => ref.current?.showModal()}>Salvar alterações</Button>
      <dialog ref={ref} aria-labelledby={titleId} className="m-auto rounded-[20px] bg-white p-0 backdrop:bg-black/40">
        <div className="flex w-[min(92vw,420px)] flex-col gap-4 p-6">
          <h2 id={titleId} className="text-[18px] font-extrabold">Publicar esta versão do plano?</h2>
          <p className="text-texto-2 text-[14px] font-semibold">
            Cria uma nova versão do plano. Os preços valem para leads novos; saldos já comprados mantêm o valor pago. A versão anterior fica arquivada.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => ref.current?.close()}>Cancelar</Button>
            <button type="submit" form={formId} onClick={() => queueMicrotask(() => ref.current?.close())} className="bg-tinta text-papel rounded-botao min-h-11 flex-1 px-5 text-[15px] font-extrabold">
              Publicar versão
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
