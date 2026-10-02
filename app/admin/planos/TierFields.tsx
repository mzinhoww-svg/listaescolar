import { formatBrl } from "@/features/billing/money";
import type { PriceTier } from "@/features/billing/tiers";

const ROWS = 6;

/** Faixas de preço (Admin10): linhas fixas (sem JS de adicionar/remover); em branco = ignorada. A última fica aberta. */
export function TierFields({ tiers }: { tiers: readonly PriceTier[] }) {
  const rows = Array.from({ length: ROWS }, (_, i) => tiers[i] ?? null);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-[15px] font-extrabold">Preço por lead (faixa de itens da lista)</legend>
      <div className="text-texto-3 grid grid-cols-[1fr_1fr_1fr] gap-2 text-[12px] font-extrabold uppercase">
        <span>De (itens)</span>
        <span>Até (itens, vazio = aberta)</span>
        <span>Preço</span>
      </div>
      {rows.map((t, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_1fr] gap-2">
          <input
            name={`tiers.${i}.minItems`}
            inputMode="numeric"
            defaultValue={t?.minItems ?? ""}
            aria-label={`Faixa ${i + 1}: itens a partir de`}
            className="bg-campo h-11 rounded-campo px-3 text-[14px] font-bold"
          />
          <input
            name={`tiers.${i}.maxItems`}
            inputMode="numeric"
            defaultValue={t?.maxItems ?? ""}
            aria-label={`Faixa ${i + 1}: itens até`}
            placeholder="aberta"
            className="bg-campo h-11 rounded-campo px-3 text-[14px] font-bold"
          />
          <input
            name={`tiers.${i}.priceCents`}
            inputMode="decimal"
            defaultValue={t ? formatBrl(t.priceCents).replace("R$", "").trim() : ""}
            aria-label={`Faixa ${i + 1}: preço`}
            placeholder="0,00"
            className="bg-campo h-11 rounded-campo px-3 text-[14px] font-bold"
          />
        </div>
      ))}
    </fieldset>
  );
}
