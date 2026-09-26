// Selos "Em breve" do portal B2B (B2B00/B2B01/B2B02). Cada recurso prometido no design mas fora desta fatia
// (widget/webhooks/atribuição = S25; campanhas/insights/faturamento = S26) fica atrás de uma flag aqui — nunca
// promessa sem fonte na tela. As fatias futuras viram estas flags para `true` (Ruling S24 · Task 2).

export const B2B_FEATURE_FLAGS = ["widget", "webhooks", "campaigns", "insights", "billing"] as const;
export type B2bFeatureFlag = (typeof B2B_FEATURE_FLAGS)[number];

export const B2B_FEATURES: Readonly<Record<B2bFeatureFlag, boolean>> = {
  widget: false,
  webhooks: false,
  campaigns: false,
  insights: false,
  billing: false,
};

export function isB2bFeatureEnabled(flag: B2bFeatureFlag): boolean {
  return B2B_FEATURES[flag];
}
