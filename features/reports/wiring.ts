import "server-only";

import { createClient } from "@/lib/supabase/server";

import { createReportsRepository } from "./repository";
import { ReportsService } from "./service";

/** Composição do serviço de denúncias sobre o cliente de SESSÃO do processo (RLS decide o acesso). */
export async function getReportsService(): Promise<ReportsService> {
  const client = await createClient();
  return new ReportsService({ store: createReportsRepository(client) });
}
