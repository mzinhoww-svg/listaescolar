import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createRpcListPublisher, type PortsRpc } from "../../supabase/functions/_shared/publication/rpc-ports";
import type { ListPublisher } from "../../supabase/functions/_shared/publication/ports";

/** ListPublisher real (service role): só chama `list_publish_from_pipeline`; nenhuma escrita direta em school_lists/list_versions/list_items. */
export function createRealListPublisher(client: Pick<SupabaseClient, "rpc">): ListPublisher {
  return createRpcListPublisher(client as unknown as PortsRpc);
}
