import "server-only";

import { getPipelineFlags } from "@/lib/env";
import { getPublicEnv } from "@/lib/env.public";
import { createAdminClient } from "@/lib/supabase/admin";

import { getExtractionPipeline } from "./pipeline-factory";
import type { SubmitDeps } from "./ports";
import { createJobQueue } from "./supabase-queue";
import { createSupabaseStore } from "./supabase-store";
import { systemClock } from "./system-clock";

/**
 * Dependências reais do envio. O cliente de serviço (chave secreta) só existe aqui, no servidor, e só é usado
 * DEPOIS de a Server Action validar sessão e papel. Com WORKER_SHARED_SECRET, o enfileiramento acorda o worker.
 */
export function buildSubmitDeps(): SubmitDeps {
  const admin = createAdminClient();
  const secret = getPipelineFlags().WORKER_SHARED_SECRET;
  const kick = secret
    ? { url: `${getPublicEnv().NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ocr-worker`, secret }
    : undefined;
  return {
    pipeline: getExtractionPipeline(),
    store: createSupabaseStore(admin),
    queue: createJobQueue(admin, { kick }),
    clock: systemClock,
  };
}
