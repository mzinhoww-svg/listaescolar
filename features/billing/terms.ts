import { formatBrl } from "./money";
import type { ActivePlan } from "./ports";

/** Versão do texto de condições de cobrança gravada em `consents.text_version` (billing_ensure_consent). */
export const BILLING_TERMS_TEXT_VERSION = "billing-terms-v1";

/**
 * Texto do checkbox "Li e aceito as condições de cobrança", gerado a partir do plano ATIVO (nunca valor fixo):
 * débito só na entrega do lead, preço por faixa de itens, créditos sem validade, contestação ainda sem prazo.
 */
export function billingTermsText(plan: ActivePlan): string {
  const tiers = plan.tiers
    .map((t) => (t.maxItems === null ? `a partir de ${t.minItems} itens: ${formatBrl(t.priceCents)}` : `${t.minItems} a ${t.maxItems} itens: ${formatBrl(t.priceCents)}`))
    .join("; ");
  const passLine = plan.pass ? ` O passe de temporada custa ${formatBrl(plan.pass.priceCents)} e não tem pró-rata.` : "";
  return (
    `O débito acontece só quando o lead é entregue à sua papelaria, nunca antes. O preço depende da faixa de itens da lista: ${tiers}. ` +
    `Créditos comprados não têm validade.${passLine} Contestação de um lead entregue por erro ainda não tem prazo definido nesta versão do produto.`
  );
}
