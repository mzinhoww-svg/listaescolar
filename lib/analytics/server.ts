import "server-only";

import { after } from "next/server";

import { capture, type CaptureConfig, type Emit } from "../../supabase/functions/_shared/analytics/capture";
import { getAnalyticsConfig } from "./config";
import type { EventName } from "./schema";

function serverConfig(): CaptureConfig | null {
  const c = getAnalyticsConfig(process.env);
  return c.enabled ? { key: c.key, host: c.host, appEnv: c.appEnv } : null;
}

/**
 * Evento de servidor (fato gravado no banco). Sem chave, não faz nada. Nunca lança nem atrasa a resposta: o envio
 * roda em `after()` (ou solto, fora de uma requisição). Falha do PostHog não altera o resultado de nenhuma ação.
 */
export function captureServer(name: EventName, props: Record<string, unknown>, opts: { distinctId?: string } = {}): void {
  try {
    const cfg = serverConfig();
    if (!cfg) return;
    const run = () => capture(cfg, name, props, opts).then(() => undefined);
    try {
      after(run);
    } catch {
      void run(); // fora de escopo de requisição (script, teste)
    }
  } catch {
    // Medição nunca quebra o produto.
  }
}

/** Gancho de medição (`Emit`) para os serviços compartilhados com a Edge Function. */
export const emitServer: Emit = (name, props) => captureServer(name, props);
