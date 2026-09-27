import { publishPlanAction } from "@/features/billing/admin-actions";
import { FREE_LEADS_MAX, FREE_LEADS_MIN, SEASON_MONTH_MAX, SEASON_MONTH_MIN } from "@/features/billing/limits";
import type { ActivePlan } from "@/features/billing/ports";

import { PackageFields } from "./PackageFields";
import { PassFields } from "./PassFields";
import { TierFields } from "./TierFields";

const MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });
const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: MONTH_FORMATTER.format(new Date(Date.UTC(2000, i, 1))) }));

/** Formulário de publicação de plano (Admin10). Sem comissão nem repasse (S23); publica uma nova VERSÃO (imutável). */
export function PlanForm({ plan }: { plan: ActivePlan | null }) {
  return (
    <form action={publishPlanAction} className="flex flex-col gap-6 rounded-card bg-white p-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[15px] font-extrabold">Leads grátis por papelaria nova</legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[12px] font-extrabold uppercase">
            Quantidade
            <input
              name="freeLeads"
              inputMode="numeric"
              min={FREE_LEADS_MIN}
              max={FREE_LEADS_MAX}
              defaultValue={plan?.freeLeads ?? 0}
              className="bg-campo h-11 rounded-campo px-3 text-[14px] font-bold normal-case"
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-extrabold uppercase">
            Validade (dias, vazio = sem validade)
            <input
              name="freeLeadsValidityDays"
              inputMode="numeric"
              defaultValue={plan?.freeLeadsValidityDays ?? ""}
              placeholder="sem validade"
              className="bg-campo h-11 rounded-campo px-3 text-[14px] font-bold normal-case"
            />
          </label>
        </div>
      </fieldset>

      <TierFields tiers={plan?.tiers ?? []} />
      <PackageFields packages={plan?.packages ?? []} />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[15px] font-extrabold">Temporada</legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[12px] font-extrabold uppercase">
            Mês de início
            <select name="seasonStartMonth" defaultValue={plan?.seasonStartMonth ?? SEASON_MONTH_MIN} className="bg-campo h-11 rounded-campo px-3 text-[14px] font-bold normal-case capitalize">
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-extrabold uppercase">
            Mês de fim
            <select name="seasonEndMonth" defaultValue={plan?.seasonEndMonth ?? SEASON_MONTH_MAX} className="bg-campo h-11 rounded-campo px-3 text-[14px] font-bold normal-case capitalize">
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      <PassFields pass={plan?.pass ?? null} />

      <p className="text-texto-3 text-[12px] font-semibold">
        Mudanças de preço valem para leads novos. Saldos já comprados mantêm o valor pago.
      </p>
      <button type="submit" className="bg-tinta text-papel h-12 w-fit rounded-botao px-8 text-[14px] font-extrabold">
        Salvar alterações
      </button>
    </form>
  );
}
