import { AiError } from "./errors.ts";
import { type Clock, type AiSettings, type SettingsProvider, aiSettingsRowSchema } from "./types.ts";

/** Subconjunto do cliente Supabase (service role) usado pelo núcleo. */
export type RpcClient = {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

export const unwrapRow = (data: unknown): unknown => (Array.isArray(data) ? data[0] : data);

/** Lê `ai_get_settings()`; cache curto só de sucesso; qualquer falha vira ai_not_configured (sem adivinhar defaults). */
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
        throw new AiError("ai_not_configured", { detail: "settings_unavailable" });
      }
      const parsed = res.error ? null : aiSettingsRowSchema.safeParse(unwrapRow(res.data));
      if (!parsed?.success) throw new AiError("ai_not_configured", { detail: "settings_unavailable" });
      cached = { value: parsed.data, at: deps.clock.now() };
      return parsed.data;
    },
  };
}
