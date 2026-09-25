import "server-only";

import { getPipelineFlags } from "@/lib/env";

import { DemoExtractionPipeline } from "./demo-pipeline";
import type { ExtractionPipeline } from "./ports";

/**
 * Pipeline configurado, ou `null` (o envio só grava e enfileira). Demonstração só com DEMO_PIPELINE=1 e
 * nunca em produção: `getPipelineFlags` lança em produção sem ALLOW_DEMO_IN_PRODUCTION. A S08 troca aqui.
 */
export function getExtractionPipeline(): ExtractionPipeline | null {
  const flags = getPipelineFlags();
  if (flags.DEMO_PIPELINE === "1") return new DemoExtractionPipeline();
  return null;
}
