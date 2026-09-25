import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Erro de leitura das portas reais: só código (sem mensagem do banco, sem dado do envio). */
export class IntegrationReadError extends Error {
  constructor(readonly code: "unavailable" | "invalid_response") {
    super(code);
    this.name = "IntegrationReadError";
  }
}

/** Chama uma função SQL (service role) e devolve o dado bruto; falha vira IntegrationReadError('unavailable'). */
export async function callRpc(client: Pick<SupabaseClient, "rpc">, fn: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  const builder = client.rpc(fn, args);
  const { data, error } = await (signal ? builder.abortSignal(signal) : builder);
  if (error) throw new IntegrationReadError("unavailable");
  return data;
}
