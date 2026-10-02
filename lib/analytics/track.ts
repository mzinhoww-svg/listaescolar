import { getAnalyticsClient } from "./instance";
import { sizeBucket } from "./schema";
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
const KNOWN_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"] as const;

/** `list_upload_started`: só tipo, faixa de tamanho e se há escola. Nunca nome de arquivo nem conteúdo. */
export function trackUploadStarted(file: { type: string; size: number }, hasSchool: boolean): void {
  const mime = (KNOWN_MIME as readonly string[]).includes(file.type) ? file.type : "other";
  track("list_upload_started", { mime_type: mime as EventProps<"list_upload_started">["mime_type"], size_bucket: sizeBucket(file.size), has_school: hasSchool });
}

export function identify(uuid: string): void {
  try {
    getAnalyticsClient()?.identify(uuid);
  } catch {
    // idem
  }
}
