import { formatBrl } from "@/features/billing/money";
import { PASS_INSTALLMENTS_MAX, PASS_INSTALLMENTS_MIN } from "@/features/billing/limits";
import type { PassConfig } from "@/features/billing/ports";

/** Passe (Admin10): preço, leads incluídos e parcelas máximas. Meses de início/fim ficam em PlanForm (são do plano). */
export function PassFields({ pass }: { pass: PassConfig | null }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-[15px] font-extrabold">Passe de temporada</legend>
      <label className="flex items-center gap-2 text-[13px] font-extrabold">
        <input type="checkbox" name="passEnabled" defaultChecked={pass !== null} />
        Oferecer passe de temporada
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-[13px] font-extrabold">
          Preço
          <input name="passPriceCents" inputMode="decimal" defaultValue={pass ? formatBrl(pass.priceCents).replace("R$", "").trim() : ""} placeholder="0,00" className="bg-campo h-11 rounded-campo px-3 text-[14px] font-bold" />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-extrabold">
          Leads incluídos
          <input name="passIncludedLeads" inputMode="numeric" defaultValue={pass?.includedLeads ?? ""} className="bg-campo h-11 rounded-campo px-3 text-[14px] font-bold" />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-extrabold">
          Parcelas máximas
          <input
            name="passMaxInstallments"
            inputMode="numeric"
            min={PASS_INSTALLMENTS_MIN}
            max={PASS_INSTALLMENTS_MAX}
            defaultValue={pass?.maxInstallments ?? PASS_INSTALLMENTS_MAX}
            className="bg-campo h-11 rounded-campo px-3 text-[14px] font-bold"
          />
        </label>
      </div>
    </fieldset>
  );
}
