// Adaptador de RpcClient para o supabase-js (service role) com validação Zod das respostas.
// `ai_get_settings`/`ai_get_active_prompt` devolvem UM objeto JSON (P0002 sem linha = erro = falha fechada);
// `ai_record_decision` devolve o uuid da decisão.
import { z } from "zod";
import type { RpcClient } from "./settings.ts";

const objectRow = z.union([
  z.record(z.string(), z.unknown()),
  z.array(z.record(z.string(), z.unknown())).length(1),
]);
const RESPONSES: Record<string, z.ZodType> = {
  ai_get_settings: objectRow,
  ai_get_active_prompt: objectRow,
  ai_record_decision: z.string().uuid(),
};

export type RawRpc = {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

/** Só as três funções de IA passam; resposta fora do formato vira erro (o núcleo falha fechado, sem eco). */
export function createValidatedRpc(client: RawRpc | (() => RawRpc)): RpcClient {
  return {
    async rpc(fn, args) {
      const schema = RESPONSES[fn];
      if (!schema) return { data: null, error: { message: "rpc_not_allowed" } };
      let res: { data: unknown; error: unknown };
      try {
        res = await (typeof client === "function" ? client() : client).rpc(fn, args);
      } catch {
        return { data: null, error: { message: "rpc_failed" } };
      }
      if (res.error) return { data: null, error: { message: "rpc_failed" } };
      const parsed = schema.safeParse(res.data);
      return parsed.success
        ? { data: parsed.data, error: null }
        : { data: null, error: { message: "rpc_invalid_response" } };
    },
  };
}
