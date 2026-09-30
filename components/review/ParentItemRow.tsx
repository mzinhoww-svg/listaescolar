import type { ReviewItem } from "@/features/review/schemas";

type Props = { item: ReviewItem; index: number; onChange: (patch: Partial<ReviewItem>) => void; onRemove: () => void; error: string | null };

// Campo do sistema: fundo Campo, borda de 1,5 px, foco em Verde Fundo (nada de foco azul do navegador).
const field =
  "bg-campo border-texto-3 rounded-campo min-h-11 w-full border-[1.5px] px-3 py-2 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-verde-fundo aria-[invalid=true]:border-erro-texto";
const label = "text-[13px] font-extrabold";

/** Uma linha da lista do pai. Nome, quantidade e unidade só como valor de campo (texto): nada vira marcação. */
export function ParentItemRow({ item, index, onChange, onRemove, error }: Props) {
  const n = index + 1;
  const uncertain = item.alerts.includes("low_confidence_item");
  return (
    <li className="flex flex-col gap-2 rounded-2xl bg-white p-3">
      <div className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={`item-nome-${n}`} className={label}>
            Nome do item<span className="sr-only"> {n}</span>
          </label>
          <input id={`item-nome-${n}`} className={field} value={item.name} maxLength={300} onChange={(e) => onChange({ name: e.target.value })} />
        </div>
        {/* data-ui="native-ok": remover é desfeito por "Desfazer" (ParentCopyEditor) e só vale ao salvar; não pede ConfirmDialog. */}
        <button type="button" data-ui="native-ok" aria-label={`Remover item ${n}`} onClick={onRemove} className="bg-erro-fundo text-erro-texto rounded-botao focus-visible:outline-erro-texto inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2">
          <span aria-hidden="true">✕</span>
        </button>
      </div>
      <div className="flex gap-2">
        <div className="flex w-28 flex-col gap-1">
          <label htmlFor={`item-qtd-${n}`} className={label}>
            Quantidade<span className="sr-only"> do item {n}</span>
          </label>
          <input
            id={`item-qtd-${n}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `item-qtd-${n}-erro` : undefined}
            className={field}
            type="number"
            inputMode="numeric"
            min={1}
            max={9999}
            step={1}
            placeholder="?"
            value={item.quantity ?? ""}
            onChange={(e) => onChange({ quantity: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={`item-un-${n}`} className={label}>
            Unidade<span className="sr-only"> do item {n}</span>
          </label>
          <input id={`item-un-${n}`} className={field} value={item.unit ?? ""} maxLength={40} placeholder="un, cx, pacote" onChange={(e) => onChange({ unit: e.target.value === "" ? null : e.target.value })} />
        </div>
      </div>
      {error ? <p id={`item-qtd-${n}-erro`} role="alert" className="text-erro-texto text-[12px] font-bold">{error}</p> : null}
      {uncertain ? <p className="bg-aviso-fundo text-aviso-texto rounded-campo px-3 py-2 text-[13px] font-extrabold">Leitura incerta: confira o nome e a quantidade deste item.</p> : null}
    </li>
  );
}
