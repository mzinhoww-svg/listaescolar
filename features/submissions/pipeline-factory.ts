import "server-only";

import { getRealExtractionPipeline } from "@/features/extraction/real-pipeline";
import { isDemoEnabled } from "@/lib/pipeline-env";

import { DemoExtractionPipeline } from "./demo-pipeline";
import type { ExtractionPipeline } from "./ports";
import { parseSlowMs } from "../../supabase/functions/_shared/demo-lock";

/**
 * Pipeline configurado, ou `null` (o envio só grava e enfileira; a tela diz "leitura automática indisponível").
 * Demonstração só com DEMO_PIPELINE=1 E APP_ENV explícito em {local, development, preview, staging}. Sem demo, o
 * pipeline real (roteador + adapters da S08) só existe com chave e modelos (ou provedor fake de teste).
 */
export function getExtractionPipeline(): ExtractionPipeline | null {
  if (isDemoEnabled())
    return new DemoExtractionPipeline({ slowMs: parseSlowMs(process.env.DEMO_SLOW_MS) });
  return getRealExtractionPipeline();
}
