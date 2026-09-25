import { AiError } from "./errors.ts";
import { type RpcClient, unwrapRow } from "./settings.ts";
import { type Clock, type Prompt, type PromptRegistry, promptRowSchema } from "./types.ts";

const KEY = /^[a-z][a-z0-9_]{0,63}$/;

/** Lê `ai_get_active_prompt(key)`; falha fechada; cache curto só de sucesso. */
export function createPromptRegistry(deps: { rpc: RpcClient; clock: Clock; cacheMs?: number }): PromptRegistry {
  const ttl = deps.cacheMs ?? 30_000;
  const cache = new Map<string, { value: Prompt; at: number }>();
  return {
    async get(key) {
      if (!KEY.test(key)) throw new AiError("ai_not_configured", { detail: "prompt_unavailable" });
      const hit = cache.get(key);
      if (hit && deps.clock.now() - hit.at < ttl) return hit.value;
      let res: { data: unknown; error: unknown };
      try {
        res = await deps.rpc.rpc("ai_get_active_prompt", { p_key: key });
      } catch {
        throw new AiError("ai_not_configured", { detail: "prompt_unavailable" });
      }
      const parsed = res.error ? null : promptRowSchema.safeParse(unwrapRow(res.data));
      if (!parsed?.success) throw new AiError("ai_not_configured", { detail: "prompt_unavailable" });
      cache.set(key, { value: parsed.data, at: deps.clock.now() });
      return parsed.data;
    },
  };
}
