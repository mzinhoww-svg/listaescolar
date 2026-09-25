import { formatBRL } from "@/features/cart/money";
import type { CatalogRow } from "@/features/stationeries/repository";

import { Field, inputClass } from "./fields";

/** Novo item ou edição de preço/estoque (o nome é a chave do item, por isso não muda na edição). */
export function ItemForm({ action, editing }: { action: (fd: FormData) => Promise<void>; editing?: CatalogRow | undefined }) {
  const price = editing ? formatBRL(editing.priceCents).replace("R$ ", "") : "";
  const stock = editing?.stock === "in_stock" ? "sim" : editing?.stock === "out_of_stock" ? "nao" : "";
  return (
    <form action={action} className="grid gap-4 rounded-card bg-white p-5 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end" key={editing?.id ?? "novo"}>
      <Field id="item-name" label="Item">
        <input id="item-name" name="name" required maxLength={200} defaultValue={editing?.name ?? ""} readOnly={editing !== undefined} className={inputClass} />
      </Field>
      <Field id="item-price" label="Preço (R$)">
        <input id="item-price" name="price" required inputMode="decimal" placeholder="12,90" defaultValue={price} className={inputClass} />
      </Field>
      <Field id="item-stock" label="Estoque">
        <select id="item-stock" name="stock" defaultValue={stock} className={inputClass}>
          <option value="">Não informado</option>
          <option value="sim">Tenho</option>
          <option value="nao">Em falta</option>
        </select>
      </Field>
      <button type="submit" className="bg-tinta text-papel h-[52px] rounded-botao px-6 text-[15px] font-extrabold">
        {editing ? "Salvar" : "Adicionar"}
      </button>
    </form>
  );
}
