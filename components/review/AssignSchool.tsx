"use client";

import { useActionState } from "react";

import { IDLE, isProblem, type ReviewActionState } from "@/app/admin/revisao/state";
import { SchoolSearchPicker } from "@/components/submissions/SchoolPicker";

type Act = (prev: ReviewActionState, formData: FormData) => Promise<ReviewActionState>;

/** Envio sem escola (família não escolheu): o admin atribui a escola antes de aprovar. Grava review/edited com `school_assigned`. */
export function AssignSchool({ submissionId, version, action }: { submissionId: string; version: number; action: Act }) {
  const [result, run, pending] = useActionState(action, IDLE);
  return (
    <section aria-label="Atribuir escola" className="flex flex-col gap-3 rounded-[24px] bg-white p-5">
      <h2 className="text-[17px] font-extrabold">Este envio não tem escola</h2>
      <form action={run} className="flex flex-col gap-3">
        <input type="hidden" name="submissionId" value={submissionId} />
        <input type="hidden" name="expectedVersion" value={version} />
        <SchoolSearchPicker optional={false} label="Escola do envio" />
        <button type="submit" disabled={pending} className="bg-tinta text-papel rounded-botao min-h-11 w-fit px-6 text-[14px] font-extrabold disabled:opacity-50">
          {pending ? "Atribuindo..." : "Atribuir escola"}
        </button>
      </form>
      {result.kind !== "idle" ? (
        <p role={isProblem(result.kind) ? "alert" : "status"} className={`${isProblem(result.kind) ? "bg-erro-fundo text-erro-texto" : "bg-campo"} rounded-campo px-4 py-3 text-[14px] font-bold`}>
          {result.message}
        </p>
      ) : null}
    </section>
  );
}
