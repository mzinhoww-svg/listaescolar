import { categoryLabel } from "@/features/review/phrases";
import { confidenceBand, type ConfidenceThresholds } from "@/features/review/confidence";
import type { ReviewItem } from "@/features/review/schemas";
import { ITEM_CATEGORIES } from "../../supabase/functions/_shared/extraction-schema";

import { AlertNote } from "./AlertNote";
import { ConfidenceBadge } from "./ConfidenceBadge";

type Props = {
  item: ReviewItem;
  index: number;
  thresholds: ConfidenceThresholds | null;
  readOnly: boolean;
  onChange: (patch: Partial<ReviewItem>) => void;
  onRemove: () => void;
  /** Erro de validação da linha (quantidade), já em frase. */
  error?: string | null;
};

const field = "bg-campo rounded-campo min-h-11 w-full px-3 py-2 text-[14px] font-semibold";

/** Uma linha de item. Nomes são sempre texto (React escapa): um nome hostil nunca vira marcação. */
export function ReviewItemRow({ item, index, thresholds, readOnly, onChange, onRemove, error = null }: Props) {
  const n = index + 1;
  const band = confidenceBand(item, thresholds);
  const qty = item.quantity === null ? "?" : String(item.quantity);
  return (
    <tr className="border-campo border-t align-top">
      <td className="px-2 py-2">
        {readOnly ? <span className="font-bold break-words">{item.name}</span> : (
          <input aria-label={`Nome do item ${n}`} className={field} value={item.name} maxLength={300} onChange={(e) => onChange({ name: e.target.value })} />
        )}
        {item.alerts.length > 0 ? <div className="mt-1.5 flex flex-col gap-1">{item.alerts.map((a) => <AlertNote key={a} code={a} />)}</div> : null}
      </td>
      <td className="w-28 px-2 py-2">
        {readOnly ? <span className="font-bold">{qty}</span> : (
          <input
            aria-label={`Quantidade do item ${n}`}
            className={field}
            aria-invalid={error ? true : undefined}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            max={9999}
            placeholder="?"
            value={item.quantity ?? ""}
            onChange={(e) => onChange({ quantity: e.target.value === "" ? null : Number(e.target.value) })}
          />
        )}
        {error ? <p role="alert" className="text-erro-texto mt-1 text-[12px] font-bold">{error}</p> : null}
      </td>
      <td className="w-40 px-2 py-2">
        {readOnly ? <span className="font-bold">{categoryLabel(item.category)}</span> : (
          <select aria-label={`Categoria do item ${n}`} className={field} value={item.category ?? ""} onChange={(e) => onChange({ category: e.target.value === "" ? null : (e.target.value as ReviewItem["category"]) })}>
            <option value="">Selecione</option>
            {ITEM_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
          </select>
        )}
      </td>
      <td className="px-2 py-2"><ConfidenceBadge band={band} confidence={item.confidence} /></td>
      {readOnly ? null : (
        <td className="px-2 py-2">
          <button type="button" aria-label={`Remover item ${n}`} onClick={onRemove} className="text-erro-texto bg-erro-fundo rounded-botao inline-flex min-h-11 min-w-11 items-center justify-center font-extrabold">
            <span aria-hidden="true">✕</span>
          </button>
        </td>
      )}
    </tr>
  );
}
