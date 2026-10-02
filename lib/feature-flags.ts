// Feature flags do go-live. Padrão SEGURO: tudo desligado. Só o valor exato "1" liga (nada de "true", "yes" ou espaços).
// Sem "server-only": roda também em testes e em código compartilhado.
export type FlagEnv = Readonly<Record<string, string | undefined>>;

export const FLAG_NAMES = {
  /** Cobrança Pix e passe pago. Desligada: só valem os 10 leads grátis. Nome já existente desde a S21. */
  paidBilling: "PAYMENTS_PIX_ENABLED",
  /** Tags de afiliado nos links de loja. Desligada: links saem sem tag. */
  affiliateTags: "AFFILIATE_TAGS_ENABLED",
  /** Publicação automática por IA. Desligada: toda lista vai à revisão humana. */
  autoPublish: "AUTO_PUBLISH_ENABLED",
  /** Campanhas B2B pagas. Desligada: telas e ações de campanha ficam indisponíveis. */
  b2bCampaigns: "B2B_CAMPAIGNS_ENABLED",
} as const;

export type FlagKey = keyof typeof FLAG_NAMES;

export function flagOn(env: FlagEnv, key: FlagKey): boolean {
  return env[FLAG_NAMES[key]] === "1";
}

/** PostHog liga só com a chave pública presente (não vazia). Sem chave, nenhuma instrumentação carrega. */
export function posthogKey(env: FlagEnv): string | null {
  const k = env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  return k ? k : null;
}
