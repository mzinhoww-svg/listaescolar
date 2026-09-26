import { buyPassAction } from "@/features/billing/actions";
import { splitInstallments } from "@/features/billing/installments";
import { formatBrl } from "@/features/billing/money";
import type { ActivePlan, PassConfig } from "@/features/billing/ports";
import type { SeasonWindow } from "@/features/billing/season";

import { TermsCheckbox } from "./TermsCheckbox";

type Props = {
  plan: ActivePlan;
  pass: PassConfig;
  season: SeasonWindow;
  stationeryId: string;
  paymentAvailable: boolean;
  isDemo: boolean;
  maxInstallments: number | null;
  now: Date;
  /** Gerada uma vez pela página (revisão de segurança: duplo clique não cria 2 passes/faturas). */
  idempotencyKey: string;
};

/** Só a 1ª letra maiúscula (o rótulo vem de `Intl`, minúsculo): "capitalize" do CSS deixaria "a"/"de" errados. */
function sentenceCase(text: string): string {
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}

/** Cartão do passe de temporada (Pap06): meses da temporada, leads incluídos, preço cheio ou parcelado. */
export function PassCard({ plan, pass, season, stationeryId, paymentAvailable, isDemo, maxInstallments, now, idempotencyKey }: Props) {
  const options = Array.from({ length: maxInstallments ?? 0 }, (_, i) => i + 1);
  return (
    <section aria-labelledby="passe" className="rounded-card bg-white p-6">
      <h2 id="passe" className="mb-1 text-[17px] font-extrabold">Passe de temporada</h2>
      <p className="text-texto-2 mb-4 text-[14px] font-semibold">
        {sentenceCase(season.label)} · {pass.includedLeads} leads incluídos
      </p>
      {options.length === 0 ? (
        <p className="text-texto-2 text-[14px] font-semibold">Não é possível assinar o passe agora (as parcelas não cabem até o fim da temporada).</p>
      ) : (
        <form action={buyPassAction} className="flex flex-col gap-3">
          <input type="hidden" name="stationeryId" value={stationeryId} />
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <p className="text-[24px] font-extrabold">{formatBrl(pass.priceCents)}</p>
          <label className="flex flex-col gap-1 text-[13px] font-extrabold">
            Parcelas
            <select name="installments" defaultValue={String(Math.max(...options))} className="bg-campo h-11 rounded-campo px-3 text-[14px] font-bold">
              {options.map((n) => {
                const rows = splitInstallments(pass.priceCents, n, now);
                return (
                  <option key={n} value={n}>
                    {n === 1 ? `R$ total ou 1x de ${formatBrl(rows[0]!.amountCents)}` : `${n}x de ${formatBrl(rows[0]!.amountCents)}`}
                  </option>
                );
              })}
            </select>
          </label>
          <TermsCheckbox plan={plan} />
          <button type="submit" disabled={!paymentAvailable} className="bg-tinta text-papel h-12 rounded-botao text-[14px] font-extrabold disabled:opacity-50">
            {isDemo ? "Assinar (demonstração)" : "Assinar o passe"}
          </button>
        </form>
      )}
      {!paymentAvailable ? <p className="text-texto-2 mt-3 text-[14px] font-semibold">Pagamento via Pix indisponível no momento.</p> : null}
    </section>
  );
}
