import "server-only";

import { isDemoEnabled } from "@/lib/pipeline-env";

import { DemoExtractionPipeline } from "./demo-pipeline";
import type { ExtractionPipeline } from "./ports";
import { parseSlowMs } from "../../supabase/functions/_shared/demo-lock";

/**
 * Pipeline configurado, ou `null` (o envio só grava e enfileira). Demonstração só com DEMO_PIPELINE=1 E
 * APP_ENV explícito em {local, development, preview, staging}; ausente = desligado. A S08 troca aqui.
 */
export function getExtractionPipeline(): ExtractionPipeline | null {
  if (isDemoEnabled()) return new DemoExtractionPipeline({ slowMs: parseSlowMs(process.env.DEMO_SLOW_MS) });
  return null;
}
