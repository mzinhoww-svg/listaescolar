import { getAnalyticsClient } from "./instance";
import type { EVENTS, EventName } from "./schema";
import type { z } from "zod";

export type EventProps<N extends EventName> = z.input<(typeof EVENTS)[N]>;

/** Registra um evento de produto no navegador. Sem chave, sem consentimento ou com erro: não faz nada e nunca lança. */
export function track<N extends EventName>(name: N, props: EventProps<N>): void {
  try {
    getAnalyticsClient()?.track(name, props as Record<string, unknown>);
  } catch {
    // Medição nunca quebra a página.
  }
}

/** `identify` só com o uuid do perfil (o cliente ignora qualquer outra coisa). */
export function identify(uuid: string): void {
  try {
    getAnalyticsClient()?.identify(uuid);
  } catch {
    // idem
  }
}
