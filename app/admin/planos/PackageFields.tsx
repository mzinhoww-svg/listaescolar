import { formatBrl } from "@/features/billing/money";
import { PACKAGES_MAX } from "@/features/billing/limits";
import type { PlanPackage } from "@/features/billing/ports";

/** Pacotes de crédito (card novo, ausente no design original — Pap06 vende pacotes e o valor vem de configuração). */
export function PackageFields({ packages }: { packages: readonly PlanPackage[] }) {
  const rows = Array.from({ length: PACKAGES_MAX }, (_, i) => packages[i] ?? null);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-[15px] font-extrabold">Pacotes de crédito</legend>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {rows.map((p, i) => (
          <input
            key={i}
            name={`packages.${i}.amountCents`}
            inputMode="decimal"
            defaultValue={p ? formatBrl(p.amountCents).replace("R$", "").trim() : ""}
            aria-label={`Pacote ${i + 1}`}
            placeholder="0,00"
            className="bg-campo h-11 rounded-campo px-3 text-[14px] font-bold"
          />
        ))}
      </div>
    </fieldset>
  );
}
