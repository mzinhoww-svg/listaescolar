import { formatBpsAsPercent } from "@/features/payouts/bps";
import { publishPayoutSettingsAction } from "@/features/payouts/actions";
import type { PayoutSettingsView } from "@/features/payouts/ports";

/** Comissão vigente + prazos de inadimplência (Admin13/Admin14): publica uma versão nova (a anterior é arquivada). */
export function CommissionSettingsForm({ settings }: { settings: PayoutSettingsView | null }) {
  return (
    <form action={publishPayoutSettingsAction} className="rounded-card flex flex-col gap-4 bg-white p-6">
      <h2 className="text-[16px] font-extrabold">Comissão e prazos de inadimplência</h2>
      <p className="text-texto-2 text-[13px] font-semibold">
        Comissão só se aplica quando a venda é confirmada como paga por Pix pela plataforma. O repasse a escolas/APM
        sai desta comissão, nunca da papelaria.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-[12px] font-extrabold uppercase">
          Comissão (%)
          <input
            name="commissionPercent"
            inputMode="decimal"
            defaultValue={settings ? formatBpsAsPercent(settings.commissionBps) : ""}
            placeholder="10,00"
            className="bg-campo h-11 rounded-campo px-3 text-[14px] font-bold normal-case"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-extrabold uppercase">
          Atraso leve até (dias)
          <input
            name="graceDays"
            inputMode="numeric"
            defaultValue={settings?.graceDays ?? ""}
            placeholder="7"
            className="bg-campo h-11 rounded-campo px-3 text-[14px] font-bold normal-case"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-extrabold uppercase">
          Pausa leads após (dias)
          <input
            name="blockDays"
            inputMode="numeric"
            defaultValue={settings?.blockDays ?? ""}
            placeholder="20"
            className="bg-campo h-11 rounded-campo px-3 text-[14px] font-bold normal-case"
          />
        </label>
      </div>
      <button type="submit" className="bg-tinta text-papel rounded-botao h-11 w-fit px-5 text-[14px] font-extrabold">
        Publicar configuração
      </button>
    </form>
  );
}
