/**
 * Limiares de operação (S19) — nunca preço/prazo de produto, ajustáveis por Ruling futuro. Puro: sem I/O, sem
 * `server-only`, testável sem mocks.
 */

/** Fila morta: qualquer job em `dead` já é um alerta (S07/S09 tratam isso como falha definitiva do pipeline). */
export function shouldAlertDeadJobs(count: number): boolean {
  return count > 0;
}

export const AI_ERROR_RATE_THRESHOLD = 0.2;
export const AI_ERROR_RATE_MIN_SAMPLE = 5;

/** Taxa de erro do provedor de IA acima de 20% nas últimas 24h, com amostra mínima de 5 decisões (evita alerta por acaso). */
export function shouldAlertAiErrorRate(total: number, failed: number): boolean {
  if (total < AI_ERROR_RATE_MIN_SAMPLE) return false;
  return failed / total > AI_ERROR_RATE_THRESHOLD;
}
