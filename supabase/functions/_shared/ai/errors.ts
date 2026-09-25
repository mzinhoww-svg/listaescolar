// Erros do núcleo de IA. Mensagens FIXAS por código: nunca ecoam corpo, cabeçalho ou chave do provedor.

export const AI_ERROR_CODES = [
  "ai_not_configured",
  "vision_model_missing",
  "provider_timeout",
  "provider_error",
  "invalid_output",
  "low_confidence",
  "aborted",
] as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

const MESSAGES: Record<AiErrorCode, string> = {
  ai_not_configured: "IA não configurada",
  vision_model_missing: "modelo de visão não configurado",
  provider_timeout: "o provedor de IA excedeu o tempo",
  provider_error: "o provedor de IA falhou",
  invalid_output: "a saída da IA é inválida",
  low_confidence: "confiança da IA abaixo do limiar",
  aborted: "chamada de IA cancelada",
};

/** Erros que a escalada barato→forte pode tentar de novo. Configuração ausente e cancelamento nunca. */
const DEFAULT_TRANSIENT: Record<AiErrorCode, boolean> = {
  ai_not_configured: false,
  vision_model_missing: false,
  provider_timeout: true,
  provider_error: false,
  invalid_output: true,
  low_confidence: true,
  aborted: false,
};

const SAFE_DETAIL = /^[a-z0-9_:.-]{1,60}$/;

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly transient: boolean;
  readonly status?: number;
  /** Código estável e seguro (`settings_unavailable`, `decision_record_failed`...), nunca eco do provedor. */
  readonly detail?: string;

  constructor(code: AiErrorCode, opts: { transient?: boolean; status?: number; detail?: string } = {}) {
    const detail = opts.detail !== undefined && SAFE_DETAIL.test(opts.detail) ? opts.detail : undefined;
    super(detail ? `${MESSAGES[code]} (${detail})` : MESSAGES[code]);
    this.name = "AiError";
    this.code = code;
    this.transient = opts.transient ?? DEFAULT_TRANSIENT[code];
    if (detail) this.detail = detail;
    if (opts.status !== undefined && Number.isInteger(opts.status)) this.status = opts.status;
  }

  toJSON(): { name: string; code: AiErrorCode; transient: boolean; status?: number; detail?: string; message: string } {
    return { name: this.name, code: this.code, transient: this.transient, status: this.status, detail: this.detail, message: this.message };
  }
}

export function isAiError(e: unknown): e is AiError {
  return e instanceof AiError;
}

/** Remove segredos conhecidos de um texto (defesa em profundidade; as mensagens já são fixas). */
export function redactSecrets(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const s of secrets) if (s) out = out.split(s).join("[redacted]");
  return out;
}
