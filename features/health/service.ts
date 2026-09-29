import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { aiDecisionStats, countDeadJobs, notifyAdmins } from "./repository";
import { shouldAlertAiErrorRate, shouldAlertDeadJobs } from "./thresholds";

export type HealthCheckResult = {
  deadJobs: { count: number; alerted: boolean };
  aiErrorRate: { total: number; failed: number; alerted: boolean };
};

/**
 * Verificação de saúde (S19): fila morta (`jobs.status = 'dead'`) e taxa de erro do provedor de IA
 * (`ai_decisions.decision = 'failed'` nas últimas 24h). Acima do limiar, notifica todo admin pela central (S11),
 * sem nenhum dado pessoal (`system_alert_notify`, migration 0606). Chamada só por
 * `app/api/cron/health-check/route.ts` (segredo, mesmo padrão dos outros crons).
 */
export async function runHealthCheck(): Promise<HealthCheckResult> {
  const client = createAdminClient();

  const deadCount = await countDeadJobs(client);
  const deadAlert = shouldAlertDeadJobs(deadCount);
  if (deadAlert) await notifyAdmins(client, "dead_jobs", deadCount);

  const { total, failed } = await aiDecisionStats(client);
  const aiAlert = shouldAlertAiErrorRate(total, failed);
  if (aiAlert) await notifyAdmins(client, "ai_error_rate", failed);

  return {
    deadJobs: { count: deadCount, alerted: deadAlert },
    aiErrorRate: { total, failed, alerted: aiAlert },
  };
}
