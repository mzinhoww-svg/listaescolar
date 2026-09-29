import "server-only";

import { cookies } from "next/headers";
import { after } from "next/server";

import { capture, type CaptureConfig, type Emit } from "../../supabase/functions/_shared/analytics/capture";
import { CONSENT_COOKIE, getAnalyticsConfig, USER_ACTION_EVENTS } from "./config";
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
  // Ação do usuário (login, clique de compra) só pelo caminho com consentimento: `captureUserAction`.
  if (USER_ACTION_EVENTS.includes(name)) return;
  send(name, props, opts);
}

function send(name: EventName, props: Record<string, unknown>, opts: { distinctId?: string }): void {
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

/**
 * Evento de servidor que nasce de AÇÃO do usuário (`login_completed`, `purchase_clicked`): só sai se o navegador
 * mandou o cookie de estado `lc_analytics_consent=granted` (o aceite da medição). Sem ele, ou se o cookie não puder
 * ser lido, não emite. Sempre com `await`, para o cookie ser lido dentro do escopo da requisição.
 */
export async function captureUserAction(name: EventName, props: Record<string, unknown>, opts: { distinctId?: string } = {}): Promise<void> {
  try {
    if (!USER_ACTION_EVENTS.includes(name)) return send(name, props, opts);
    const jar = await cookies();
    if (jar.get(CONSENT_COOKIE)?.value !== "granted") return;
    send(name, props, opts);
  } catch {
    // Sem escopo de requisição ou erro de leitura: sem consentimento comprovado, não emite.
  }
}

/**
 * Gancho de medição (`Emit`) para os serviços compartilhados com a Edge Function. Eventos de ação do usuário passam
 * pelo consentimento (devolve a promessa para o serviço poder esperar); fatos de negócio saem direto.
 */
export const emitServer: Emit = (name, props) =>
  USER_ACTION_EVENTS.includes(name) ? captureUserAction(name, props) : captureServer(name, props);
