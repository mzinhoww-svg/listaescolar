import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { getExtractionPipeline } from "./pipeline-factory";
import type { SubmitDeps } from "./ports";
import { createJobQueue } from "./supabase-queue";
import { createSupabaseStore } from "./supabase-store";
import { systemClock } from "./system-clock";

/**
 * Dependências reais do envio. O cliente de serviço (chave secreta) só existe aqui, no servidor, e só é usado
 * DEPOIS de a Server Action validar sessão e papel. O worker é acionado pelo pg_cron (uma vez por minuto).
 */
export function buildSubmitDeps(): SubmitDeps {
  const admin = createAdminClient();
  return {
    pipeline: getExtractionPipeline(),
    store: createSupabaseStore(admin),
    queue: createJobQueue(admin),
    clock: systemClock,
  };
}
