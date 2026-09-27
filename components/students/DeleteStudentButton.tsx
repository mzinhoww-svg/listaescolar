"use client";

import { useRef } from "react";

import { deleteStudentAction } from "@/app/conta/alunos/actions";

/** Exclusão real (LGPD): apaga o aluno e as listas salvas para ele. Confirmação com o nome do apelido. */
export function DeleteStudentButton({ id, nickname }: { id: string; nickname: string }) {
  const ref = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className="text-[13px] font-extrabold text-[#8a1c14] underline">
        Excluir aluno
      </button>
      <dialog ref={ref} className="m-auto rounded-[20px] bg-white p-0 backdrop:bg-black/40">
        <form action={deleteStudentAction} className="flex w-[min(92vw,420px)] flex-col gap-4 p-6">
          <input type="hidden" name="id" value={id} />
          <h2 className="text-[18px] font-extrabold">Excluir {nickname}?</h2>
          <p className="text-texto-2 text-[14px] font-semibold">
            Isso apaga o aluno e as listas salvas para ele de verdade. Não pode ser desfeito.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="border-tinta rounded-botao flex h-11 flex-1 items-center justify-center border-[1.5px] text-[14px] font-extrabold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-botao flex h-11 flex-1 items-center justify-center border-[1.5px] border-[#8a1c14] text-[14px] font-extrabold text-[#8a1c14]"
            >
              Excluir agora
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
