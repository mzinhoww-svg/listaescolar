// Envio de eventos de SERVIDOR ao PostHog (fatos gravados no banco). Compartilhado: app (lib/analytics/server.ts) e
// Edge Function. Sem SDK. Nunca lança. `distinct_id` é um uuid de entidade ou aleatório, sempre com
// `$process_person_profile: false`: fato de negócio não é ligado a uma pessoa nem ao comportamento no navegador.
import { buildEvent } from "./sanitize.ts";
import type { EventName } from "./schema.ts";

export type CaptureConfig = { key: string; host: string; appEnv: "production" | "preview" | "staging" | "local" };
export type Emit = (name: EventName, props: Record<string, unknown>) => void;

const TIMEOUT_MS = 3_000;

/** Chama o gancho de medição sem nunca deixar a exceção subir (medição não altera o resultado do fluxo). */
export function safeEmit(emit: Emit | undefined, name: EventName, props: Record<string, unknown>): void {
  try {
    emit?.(name, props);
  } catch {
    // ignorado de propósito
  }
}

export async function capture(
  cfg: CaptureConfig,
  name: EventName,
  props: Record<string, unknown>,
  opts: { distinctId?: string; fetchImpl?: typeof fetch } = {},
): Promise<boolean> {
  try {
    const built = buildEvent(name, props, { is_internal: cfg.appEnv !== "production", app_env: cfg.appEnv });
    if (!built.ok) return false;
    const doFetch = opts.fetchImpl ?? fetch;
    const res = await doFetch(`${cfg.host}/i/v0/e`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        api_key: cfg.key,
        event: name,
        distinct_id: opts.distinctId ?? crypto.randomUUID(),
        properties: { ...built.properties, token: cfg.key, $process_person_profile: false, $lib: "listacerta-server" },
        timestamp: new Date().toISOString(),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Emissor para a Edge Function: guarda os envios em andamento e `flush()` os espera (com o teto de cada um) antes de
 * a função responder. Sem configuração devolve um emissor que não faz nada.
 */
export function createEmitter(cfg: CaptureConfig | null, fetchImpl?: typeof fetch): { emit: Emit; flush(): Promise<void> } {
  const pending = new Set<Promise<unknown>>();
  const emit: Emit = (name, props) => {
    if (!cfg) return;
    const p = capture(cfg, name, props, { ...(fetchImpl ? { fetchImpl } : {}) }).finally(() => pending.delete(p));
    pending.add(p);
  };
  return { emit, flush: async () => void (await Promise.allSettled([...pending])) };
}
