import { buyPackageAction } from "@/features/billing/actions";
import { formatBrl } from "@/features/billing/money";
import type { ActivePlan, PlanPackage } from "@/features/billing/ports";

import { TermsCheckbox } from "./TermsCheckbox";

type Props = {
  plan: ActivePlan;
  packages: readonly PlanPackage[];
  stationeryId: string;
  paymentAvailable: boolean;
  isDemo: boolean;
  /** Uma chave por pacote, gerada uma vez pela página (revisão de segurança: duplo clique não cria 2 faturas). */
  idempotencyKeys: Record<string, string>;
};

/** Cartões de pacote de crédito (Pap06): valor do pacote e "Pagar com Pix" — sem "Mais usado" nem preço por lead. */
export function PackageCards({ plan, packages, stationeryId, paymentAvailable, isDemo, idempotencyKeys }: Props) {
  if (packages.length === 0) return null;
  return (
    <section aria-labelledby="pacotes" className="rounded-card bg-white p-6">
      <h2 id="pacotes" className="mb-4 text-[17px] font-extrabold">Pacotes de crédito</h2>
      {!paymentAvailable ? <p className="text-texto-2 mb-4 text-[14px] font-semibold">Pagamento via Pix indisponível no momento.</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((pkg) => (
          <form key={pkg.id} action={buyPackageAction} className="border-tinta/10 flex flex-col gap-3 rounded-card border p-5">
            <input type="hidden" name="stationeryId" value={stationeryId} />
            <input type="hidden" name="packageId" value={pkg.id} />
            <input type="hidden" name="idempotencyKey" value={idempotencyKeys[pkg.id]} />
            <p className="text-[24px] font-extrabold">{formatBrl(pkg.amountCents)}</p>
            <TermsCheckbox plan={plan} />
            <button type="submit" disabled={!paymentAvailable} className="bg-tinta text-papel mt-auto h-12 rounded-botao text-[14px] font-extrabold disabled:opacity-50">
              {isDemo ? "Comprar (demonstração)" : "Pagar com Pix"}
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}
