import "server-only";

import type { RpcClient } from "../../supabase/functions/_shared/ai/settings";
import { createValidatedRpc, type RawRpc } from "../../supabase/functions/_shared/ai/rpc";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * RpcClient das funções de IA (`ai_get_settings`, `ai_get_active_prompt`, `ai_record_decision`) com a chave de
 * serviço, criado sob demanda (sem chave no ambiente = erro na chamada = o núcleo falha fechado). Só servidor.
 */
export function createServiceAiRpc(): RpcClient {
  let client: ReturnType<typeof createAdminClient> | null = null;
  return createValidatedRpc(() => {
    client ??= createAdminClient();
    return client as unknown as RawRpc;
  });
}
