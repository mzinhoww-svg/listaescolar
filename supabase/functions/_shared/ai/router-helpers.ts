// Utilitários pequenos do roteador (corrida com abort, blindagem de exceção, resolução da rota), extraídos de
// router.ts (D-057, S18) — comportamento idêntico ao original.
import { AiError } from "./errors.ts";
import type { AiSettings, LlmProvider, ProviderFactories, Route } from "./types.ts";

export function raceAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new AiError("aborted"));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

export type RouteCfg = AiSettings["routes"][Route];

export async function closed<V>(fn: () => Promise<V>, detail: string): Promise<V> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AiError) throw e;
    throw new AiError("provider_error", { transient: true, detail }); // exceção inesperada de infraestrutura: repete
  }
}

/** Resolve o provedor da rota (falha fechada, sem rede). */
export function resolveRoute(
  providers: ProviderFactories,
  fakeAllowed: () => boolean,
  settings: AiSettings,
  route: Route,
): { provider: LlmProvider; cfg: RouteCfg } {
  const cfg = settings.routes[route];
  if (cfg.provider === "fake" && !fakeAllowed()) throw new AiError("ai_not_configured", { detail: "fake_not_allowed" });
  const factory = providers[cfg.provider];
  if (!factory) throw new AiError("ai_not_configured", { detail: "provider_unregistered" });
  try {
    return { provider: factory(route), cfg };
  } catch (e) {
    if (e instanceof AiError) throw e;
    throw new AiError("ai_not_configured", { detail: "provider_unavailable" }); // nunca repassa e.message
  }
}
