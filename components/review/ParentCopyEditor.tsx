"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { PARENT_IDLE, type ParentCopyState } from "@/app/enviar-lista/[submissionId]/revisar/state";
import type { ReviewItem } from "@/features/review/schemas";

import { ParentItemRow } from "./ParentItemRow";

type Props = {
  copyId: string;
  submissionId: string;
  initialVersion: number;
  initialItems: ReviewItem[];
  grade: string | null;
  schoolYear: number | null;
  action: (prev: ParentCopyState, formData: FormData) => Promise<ParentCopyState>;
};

const NEW_ITEM: ReviewItem = { name: "", quantity: null, unit: null, category: null, confidence: null, alerts: [], origin: "added" };
const qtyError = (it: ReviewItem): string | null => (it.quantity !== null && (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 9999) ? "Use um número inteiro de 1 a 9999." : null);

/** Revisão da lista do pai (App15, mobile). Edita só a cópia dele: não existe "enviar para revisão" aqui e nada vira lista oficial. */
export function ParentCopyEditor({ copyId, submissionId, initialVersion, initialItems, grade, schoolYear, action }: Props) {
  const [items, setItems] = useState<ReviewItem[]>(initialItems);
  const [result, formAction, pending] = useActionState(action, PARENT_IDLE);
  const [version, setVersion] = useState(initialVersion);
  const [seen, setSeen] = useState(result);
  const [submitted, setSubmitted] = useState<string | null>(null);
  if (result !== seen) {
    setSeen(result);
    if (result.kind === "saved" && result.version !== undefined) setVersion(result.version);
  }
  const snapshot = JSON.stringify(items);
  const errors = items.map(qtyError);
  const namesOk = items.every((it) => it.name.trim().length > 0);
  const invalid = errors.some((e) => e !== null) || !namesOk;
  const savedNow = result.kind === "saved" && submitted === snapshot;

  const setItem = (i: number, patch: Partial<ReviewItem>) => setItems((cur) => cur.map((it, k) => (k === i ? { ...it, ...patch, origin: it.origin === "extracted" ? "edited" : it.origin } : it)));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-1 flex-col gap-4 px-6 pt-14 pb-9">
      <Link href={`/enviar-lista/${submissionId}`} className="text-texto-2 inline-flex min-h-11 items-center text-[14px] font-extrabold underline">Voltar ao andamento</Link>
      <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em]">Revise seus itens</h1>
      <p className="bg-campo rounded-2xl p-3.5 text-[13px] leading-[1.4] font-semibold">
        Estas mudanças valem só para você. A lista oficial da escola é conferida pela equipe antes de aparecer para outras famílias.
      </p>
      <p className="bg-aviso-fundo text-aviso-texto rounded-2xl p-3.5 text-[13px] leading-[1.4] font-extrabold">Não escreva o nome da criança nos itens.</p>
      <p className="text-texto-2 text-[14px] font-bold">Série: {grade ?? "indisponível"} · Ano letivo: {schoolYear ?? "indisponível"}</p>
      <form action={formAction} noValidate onSubmit={() => setSubmitted(snapshot)} aria-label="Meus itens" className="flex flex-col gap-3">
        <input type="hidden" name="copyId" value={copyId} />
        <input type="hidden" name="payload" value={JSON.stringify({ items, expectedVersion: version })} />
        {items.length === 0 ? <p className="text-texto-2 text-[15px] font-semibold">Nenhum item na sua lista.</p> : null}
        <ul className="flex flex-col gap-2">
          {items.map((it, i) => (
            <ParentItemRow key={i} item={it} index={i} error={errors[i] ?? null} onChange={(p) => setItem(i, p)} onRemove={() => setItems((cur) => cur.filter((_, k) => k !== i))} />
          ))}
        </ul>
        <button type="button" onClick={() => setItems((cur) => [...cur, NEW_ITEM])} className="bg-campo rounded-botao min-h-11 px-5 text-[14px] font-extrabold">Adicionar item</button>
        {namesOk ? null : <p role="status" className="text-erro-texto text-[13px] font-bold">Escreva o nome de todos os itens antes de salvar.</p>}
        <button type="submit" disabled={pending || invalid} className="bg-tinta text-papel rounded-botao h-14 text-base font-extrabold disabled:opacity-50">
          {pending ? "Salvando..." : "Salvar minha lista"}
        </button>
      </form>
      {result.kind !== "idle" ? (
        <p role={result.kind === "saved" ? "status" : "alert"} className={`${result.kind === "saved" ? "bg-campo" : "bg-erro-fundo text-erro-texto"} rounded-2xl p-3.5 text-[14px] font-bold`}>
          {result.message}
          {result.kind === "stale" ? <button type="button" onClick={() => window.location.reload()} className="ml-2 underline">Recarregar</button> : null}
        </p>
      ) : null}
      {savedNow ? (
        <Link href={`/carrinho/novo?lista=${copyId}`} className="border-tinta text-tinta flex h-[52px] w-full items-center justify-center rounded-botao border-[1.5px] text-base font-extrabold">
          Montar carrinho com esta lista
        </Link>
      ) : null}
    </main>
  );
}
