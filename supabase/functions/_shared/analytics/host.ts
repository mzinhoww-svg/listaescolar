// Regra única do destino da medição (Node e Deno): https sempre; http só em loopback (receptor local de E2E).
// Usada por `lib/analytics/config.ts` (app, proxy `/ingest`) e pelo `ocr-worker` (secret `POSTHOG_HOST`).
export function isAllowedHost(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

export type WorkerAppEnv = "production" | "preview" | "staging" | "local";

/**
 * Configuração de captura do worker a partir dos secrets. Sem chave, ou com host fora da regra, devolve `null`
 * (nada é enviado, e a chave nunca vai para um destino não confiável).
 */
export function workerCaptureConfig(env: {
  key?: string | undefined;
  host?: string | undefined;
  appEnv?: string | undefined;
}): { key: string; host: string; appEnv: WorkerAppEnv } | null {
  const key = env.key?.trim();
  if (!key) return null;
  const host = (env.host?.trim() || DEFAULT_POSTHOG_HOST).replace(/\/+$/, "");
  if (!isAllowedHost(host)) return null;
  const a = env.appEnv;
  return { key, host, appEnv: a === "production" || a === "preview" || a === "staging" ? a : "local" };
}
