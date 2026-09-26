import { formatBrl } from "@/features/billing/money";
import type { PriceTier } from "@/features/billing/tiers";

/** "Preço por lead" (Pap06/Admin10): faixa de itens da lista -> preço, sem "R$ por lead" nem "por item" inventado. */
export function PriceTierTable({ tiers }: { tiers: readonly PriceTier[] }) {
  return (
    <table className="w-full text-[14px]" data-testid="price-tier-table">
      <caption className="mb-2 text-left text-[13px] font-extrabold">Preço por lead (faixa de itens da lista)</caption>
      <thead>
        <tr className="text-texto-3 text-left text-[12px] font-extrabold uppercase">
          <th className="pb-2">Faixa da lista</th>
          <th className="pb-2">Preço</th>
        </tr>
      </thead>
      <tbody>
        {tiers.map((t) => (
          <tr key={`${t.minItems}-${t.maxItems ?? "aberta"}`} className="border-t border-black/5">
            <td className="py-2 font-semibold">
              {t.maxItems === null ? (t.minItems <= 1 ? "qualquer quantidade de itens" : `a partir de ${t.minItems} itens`) : `${t.minItems} a ${t.maxItems} itens`}
            </td>
            <td className="py-2 font-extrabold">{formatBrl(t.priceCents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
