import { AiError } from "./errors.ts";
import { type Clock, type AiSettings, type SettingsProvider, aiSettingsRowSchema } from "./types.ts";

/** Subconjunto do cliente Supabase (service role) usado pelo núcleo. */
export type RpcClient = {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

/**
 * Distingue 'linha ausente/inválida' (configuração: P0002, resposta fora do formato) de 'a RPC falhou'
 * (rede, PostgREST, soluço do banco). A primeira é permanente; a segunda é transitória e repete.
 */
export function isConfigError(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null;
  return !!e && (e.code === "P0002" || e.message === "rpc_not_found" || e.message === "rpc_invalid_response");
}

/** Falha da RPC (não da configuração): transitória, com código estável no `detail`. */
export const rpcUnavailable = (detail: "settings_unavailable" | "prompt_unavailable" | "decision_record_failed"): AiError =>
  new AiError("provider_error", { transient: true, detail });

export const unwrapRow = (data: unknown): unknown => (Array.isArray(data) ? data[0] : data);

/** Lê `ai_get_settings()`; cache curto só de sucesso; falha da RPC é transitória (settings_unavailable); linha ausente/inválida é ai_not_configured (sem adivinhar defaults). */
export function createSettingsProvider(deps: { rpc: RpcClient; clock: Clock; cacheMs?: number }): SettingsProvider {
  const ttl = deps.cacheMs ?? 30_000;
  let cached: { value: AiSettings; at: number } | null = null;
  return {
    async load() {
      if (cached && deps.clock.now() - cached.at < ttl) return cached.value;
      let res: { data: unknown; error: unknown };
      try {
        res = await deps.rpc.rpc("ai_get_settings");
      } catch {
        throw rpcUnavailable("settings_unavailable");
      }
      if (res.error && !isConfigError(res.error)) throw rpcUnavailable("settings_unavailable");
      const parsed = res.error ? null : aiSettingsRowSchema.safeParse(unwrapRow(res.data));
      if (!parsed?.success) throw new AiError("ai_not_configured", { detail: "settings_invalid" });
      cached = { value: parsed.data, at: deps.clock.now() };
      return parsed.data;
    },
  };
}
