import { billingTermsText } from "@/features/billing/terms";
import type { ActivePlan } from "@/features/billing/ports";

/** Checkbox de consentimento de cobrança, com texto gerado do plano ATIVO (nunca um prazo ou preço inventado). */
export function TermsCheckbox({ plan, name = "termsAccepted" }: { plan: ActivePlan; name?: string }) {
  return (
    <label className="text-texto-2 flex items-start gap-2 text-[13px] font-semibold">
      <input type="checkbox" name={name} required className="mt-0.5" />
      <span>
        Li e aceito as condições de cobrança. <span className="text-texto-3">{billingTermsText(plan)}</span>
      </span>
    </label>
  );
}
