import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PublicationContextReader } from "../../supabase/functions/_shared/publication/ports";
import { createRpcPublicationContextReader, type PortsRpc } from "../../supabase/functions/_shared/publication/rpc-ports";

/** PublicationContextReader real: só chama `publication_context` (status, códigos e booleans; sem dado pessoal). */
export function createRealPublicationContextReader(client: Pick<SupabaseClient, "rpc">, opts: { now?: () => Date } = {}): PublicationContextReader {
  return createRpcPublicationContextReader(client as unknown as PortsRpc, opts);
}
