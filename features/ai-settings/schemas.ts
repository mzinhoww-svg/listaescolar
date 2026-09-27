import { z } from "zod";

import { CRITICAL_ALERT_CODES } from "./ports";

/**
 * Espelha os CHECKs de `ai_settings` (0202): limiar 0–1, `max_escalations` 0–3, `pipeline_version` 1–40 chars.
 * `auto_publish_enabled` e `routes` NUNCA entram aqui (Ruling S16: ficam só leitura na UI; ligar
 * `auto_publish_enabled` sozinho violaria a regra de autonomia do repositório) — mesmo que alguém injete esses campos no
 * formulário, o schema não os aceita e eles nunca chegam ao update.
 */
export const updateAiSettingsSchema = z.object({
  confidenceThreshold: z.coerce.number().min(0).max(1),
  itemConfidenceThreshold: z.coerce.number().min(0).max(1),
  criticalAlerts: z.array(z.enum(CRITICAL_ALERT_CODES)).default([]),
  maxEscalations: z.coerce.number().int().min(0).max(3),
  pipelineVersion: z.string().trim().min(1).max(40),
});
export type UpdateAiSettingsForm = z.infer<typeof updateAiSettingsSchema>;
