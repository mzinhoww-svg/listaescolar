import { EVENT_CATALOG, type NotificationEvent } from "./catalog";
import { isSafeLinkPath, notificationParamsSchema } from "./params";

/** Texto da central (título e corpo em texto puro). Params com campo fora da lista fechada são recusados (lança). */
export function renderNotification(event: NotificationEvent, params: unknown): { title: string; body: string } {
  const p = notificationParamsSchema.parse(params);
  const e = EVENT_CATALOG[event];
  return { title: e.title(p), body: e.body(p) };
}

/** Payload de push: título genérico + caminho relativo. Sem escola, código, status nem params. */
export function pushPayload(event: NotificationEvent, linkPath: string): { title: string; url: string } {
  if (!isSafeLinkPath(linkPath)) throw new Error("link_path inválido");
  return { title: EVENT_CATALOG[event].pushTitle, url: linkPath };
}
