"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { IDLE, isProblem, type ReviewActionState } from "@/app/admin/revisao/state";
import type { ConfidenceThresholds } from "@/features/review/confidence";
import type { ReviewItem } from "@/features/review/schemas";
import { GRADE_OPTIONS } from "@/features/submissions/copy";

import { useDraft } from "./DraftContext";
import { ReviewItemRow } from "./ReviewItemRow";

export type ReviewDraft = { grade: string | null; schoolYear: number | null; items: ReviewItem[] };
type Props = {
  submissionId: string;
  version: number;
  initial: ReviewDraft;
  thresholds: ConfidenceThresholds | null;
  readOnly: boolean;
  action: (prev: ReviewActionState, formData: FormData) => Promise<ReviewActionState>;
};

const field = "bg-campo rounded-campo min-h-11 px-3 py-2 text-[14px] font-semibold";
const NEW_ITEM: ReviewItem = { name: "", quantity: null, unit: null, category: null, confidence: null, alerts: [], origin: "added" };

const QTY_ERROR = "Quantidade: use um número inteiro de 1 a 9999.";
const qtyError = (it: ReviewItem): string | null => (it.quantity !== null && (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 9999) ? QTY_ERROR : null);

/** Série/ano e itens editáveis. Cada edição vira uma nova versão (versão otimista): `stale` mostra o aviso e mantém o rascunho. */
export function ReviewItemsEditor({ submissionId, version, initial, thresholds, readOnly, action }: Props) {
  const router = useRouter();
  const { setDirty } = useDraft();
  const [draft, setDraft] = useState<ReviewDraft>(initial);
  // Versão e retrato em que o rascunho se baseia. O envio usa SEMPRE `base`: se outra pessoa mudou a lista, o servidor responde stale.
  const [base, setBase] = useState({ version, initial });
  const [reload, setReload] = useState(false);
  const [hideStale, setHideStale] = useState(false);
  const [result, formAction, pending] = useActionState(action, IDLE);
  // Salvou: a próxima versão vinda do servidor (refresh) é a do próprio admin e vira a base, mesmo com o rascunho diferindo da base antiga.
  const [seen, setSeen] = useState(result);
  if (result !== seen) {
    setSeen(result);
    if (result.kind === "saved") setReload(true);
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(base.initial);
  // Nova versão vinda do servidor: só troca o rascunho se ele não tem edição não salva OU se o admin pediu para recarregar.
  if (base.version !== version && (reload || !dirty)) {
    setBase({ version, initial });
    setDraft(initial);
    setReload(false);
  }
  useEffect(() => setDirty(dirty), [dirty, setDirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const setItem = (i: number, patch: Partial<ReviewItem>) =>
    setDraft((d) => ({ ...d, items: d.items.map((it, k) => (k === i ? { ...it, ...patch, origin: it.origin === "extracted" ? "edited" : it.origin } : it)) }));
  const rowErrors = draft.items.map(qtyError);
  const invalid = rowErrors.some((e) => e !== null);
  const attention = draft.items.filter((it) => it.alerts.length > 0 || it.quantity === null || (it.origin === "extracted" && thresholds !== null && it.confidence !== null && it.confidence < thresholds.itemConfidenceThreshold)).length;
  const gradeKnown = draft.grade === null || (GRADE_OPTIONS as readonly string[]).includes(draft.grade);
  const showResult = result.kind !== "idle" && !(hideStale && result.kind === "stale");

  return (
    <form
      action={formAction}
      noValidate
      onSubmit={() => setHideStale(false)}
      aria-label="Itens lidos pela IA"
      className="flex flex-col gap-4 rounded-[24px] bg-white p-5"
    >
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="payload" value={JSON.stringify({ ...draft, expectedVersion: base.version })} />
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-[13px] font-extrabold">
          Série
          {readOnly ? <span className="min-h-11 py-2 text-[14px] font-bold">{draft.grade ?? "Não informada"}</span> : (
            <select className={field} value={draft.grade ?? ""} onChange={(e) => setDraft((d) => ({ ...d, grade: e.target.value === "" ? null : e.target.value }))}>
              <option value="">Selecione</option>
              {gradeKnown ? null : <option value={draft.grade ?? ""}>{draft.grade}</option>}
              {GRADE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-extrabold">
          Ano letivo
          <input
            disabled={readOnly}
            className={`${field} w-28`}
            type="number"
            inputMode="numeric"
            min={2000}
            max={2100}
            value={draft.schoolYear ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, schoolYear: e.target.value === "" ? null : Number(e.target.value) }))}
          />
        </label>
        <p className="ml-auto flex flex-wrap items-center gap-2 text-[14px] font-bold">
          <span className="text-texto-2">{draft.items.length} {draft.items.length === 1 ? "item lido" : "itens lidos"}</span>
          <span className={`${attention > 0 ? "bg-aviso-fundo text-aviso-texto" : "bg-campo text-texto-2"} rounded-botao px-3 py-1 text-xs font-extrabold`}>
            {attention} {attention === 1 ? "precisa" : "precisam"} de atenção
          </span>
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[14px]">
          <caption className="sr-only">Itens lidos no documento, com quantidade, categoria e confiança</caption>
          <thead>
            <tr className="text-texto-3 text-[12px] tracking-[0.06em] uppercase">
              <th scope="col" className="px-2 py-2 font-extrabold">Item</th>
              <th scope="col" className="px-2 py-2 font-extrabold">Quantidade</th>
              <th scope="col" className="px-2 py-2 font-extrabold">Categoria</th>
              <th scope="col" className="px-2 py-2 font-extrabold">Confiança</th>
              {readOnly ? null : <th scope="col" className="px-2 py-2"><span className="sr-only">Remover</span></th>}
            </tr>
          </thead>
          <tbody>
            {draft.items.map((it, i) => (
              <ReviewItemRow key={i} item={it} index={i} thresholds={thresholds} readOnly={readOnly} error={rowErrors[i] ?? null} onChange={(p) => setItem(i, p)} onRemove={() => setDraft((d) => ({ ...d, items: d.items.filter((_, k) => k !== i) }))} />
            ))}
          </tbody>
        </table>
        {draft.items.length === 0 ? <p className="text-texto-2 px-2 py-3 text-[14px] font-bold">Nenhum item lido.</p> : null}
      </div>
      {readOnly ? null : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setDraft((d) => ({ ...d, items: [...d.items, NEW_ITEM] }))} className="bg-campo rounded-botao min-h-11 px-5 text-[14px] font-extrabold">Adicionar item</button>
          <button type="submit" disabled={pending || !dirty || invalid} className="bg-campo text-tinta rounded-botao min-h-11 px-6 text-[14px] font-extrabold disabled:opacity-50">
            {pending ? "Salvando..." : "Salvar edição"}
          </button>
          {dirty ? <span className="text-texto-2 text-[13px] font-bold">Edição não salva</span> : null}
        </div>
      )}
      {showResult ? (
        <div role={isProblem(result.kind) ? "alert" : "status"} className={`${isProblem(result.kind) ? "bg-erro-fundo text-erro-texto" : "bg-campo"} rounded-campo px-4 py-3 text-[14px] font-bold`}>
          {result.message}
          {result.kind === "stale" ? (
            <button type="button" onClick={() => { setHideStale(true); setReload(true); router.refresh(); }} className="ml-2 underline">Recarregar a versão mais recente</button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
