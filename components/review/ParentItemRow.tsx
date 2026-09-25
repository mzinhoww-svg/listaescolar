import type { ReviewItem } from "@/features/review/schemas";

type Props = { item: ReviewItem; index: number; onChange: (patch: Partial<ReviewItem>) => void; onRemove: () => void; error: string | null };

const field = "bg-campo rounded-campo min-h-11 w-full px-3 py-2 text-[15px] font-semibold";

/** Uma linha da lista do pai. Nome e quantidade só como valor de campo (texto): nada vira marcação. */
export function ParentItemRow({ item, index, onChange, onRemove, error }: Props) {
  const n = index + 1;
  return (
    <li className="flex flex-col gap-1.5 rounded-2xl bg-white p-3">
      <div className="flex items-start gap-2">
        <input aria-label={`Nome do item ${n}`} className={field} value={item.name} maxLength={300} onChange={(e) => onChange({ name: e.target.value })} />
        <button type="button" aria-label={`Remover item ${n}`} onClick={onRemove} className="bg-erro-fundo text-erro-texto rounded-botao inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center font-extrabold">
          <span aria-hidden="true">✕</span>
        </button>
      </div>
      <input
        aria-label={`Quantidade do item ${n}`}
        aria-invalid={error ? true : undefined}
        className={`${field} w-32`}
        type="number"
        inputMode="numeric"
        min={1}
        max={9999}
        step={1}
        placeholder="?"
        value={item.quantity ?? ""}
        onChange={(e) => onChange({ quantity: e.target.value === "" ? null : Number(e.target.value) })}
      />
      {error ? <p role="alert" className="text-erro-texto text-[12px] font-bold">{error}</p> : null}
    </li>
  );
}
