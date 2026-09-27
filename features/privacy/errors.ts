/** Códigos estáveis de erro do domínio de privacidade (LGPD, S17). */
export const PRIVACY_ERROR_CODES = [
  "not_found",
  "forbidden",
  "invalid_input",
  "database",
  // Revisão de segurança/privacidade: bloqueios explícitos e claros da exclusão de conta, nunca erro genérico.
  "storage_failed", // falha ao remover documento do Storage: exclusão interrompida, pode tentar de novo
  "stationery_owner_active", // dono único de papelaria ATIVA: transfira ou encerre antes
  "b2b_partner_owner", // dono de parceiro B2B: transfira ou encerre antes
  "review_history", // histórico de curadoria administrativa (review_versions): fale com o suporte
  "reauth_required", // sessão não é recente o bastante para uma ação irreversível
] as const;
export type PrivacyErrorCode = (typeof PRIVACY_ERROR_CODES)[number];

export class PrivacyError extends Error {
  constructor(
    message: string,
    readonly code: PrivacyErrorCode,
  ) {
    super(message);
    this.name = "PrivacyError";
  }
}
