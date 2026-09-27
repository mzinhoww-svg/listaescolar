import { beforeEach, describe, expect, it, vi } from "vitest";

const countDeadJobs = vi.fn();
const aiDecisionStats = vi.fn();
const notifyAdmins = vi.fn();
vi.mock("@/features/health/repository", () => ({
  countDeadJobs: (...a: unknown[]) => countDeadJobs(...a),
  aiDecisionStats: (...a: unknown[]) => aiDecisionStats(...a),
  notifyAdmins: (...a: unknown[]) => notifyAdmins(...a),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { runHealthCheck } from "@/features/health/service";

beforeEach(() => {
  countDeadJobs.mockReset();
  aiDecisionStats.mockReset();
  notifyAdmins.mockReset();
});

describe("runHealthCheck", () => {
  it("sem fila morta e sem taxa de erro alta: nenhum alerta, nenhuma notificação", async () => {
    countDeadJobs.mockResolvedValue(0);
    aiDecisionStats.mockResolvedValue({ total: 10, failed: 1 });
    const r = await runHealthCheck();
    expect(r).toEqual({ deadJobs: { count: 0, alerted: false }, aiErrorRate: { total: 10, failed: 1, alerted: false } });
    expect(notifyAdmins).not.toHaveBeenCalled();
  });

  it("fila morta: notifica com o kind e a contagem certos", async () => {
    countDeadJobs.mockResolvedValue(3);
    aiDecisionStats.mockResolvedValue({ total: 0, failed: 0 });
    const r = await runHealthCheck();
    expect(r.deadJobs).toEqual({ count: 3, alerted: true });
    expect(notifyAdmins).toHaveBeenCalledWith(expect.anything(), "dead_jobs", 3);
  });

  it("taxa de erro de IA acima do limiar: notifica com o kind e a contagem de falhas", async () => {
    countDeadJobs.mockResolvedValue(0);
    aiDecisionStats.mockResolvedValue({ total: 10, failed: 5 });
    const r = await runHealthCheck();
    expect(r.aiErrorRate).toEqual({ total: 10, failed: 5, alerted: true });
    expect(notifyAdmins).toHaveBeenCalledWith(expect.anything(), "ai_error_rate", 5);
  });

  it("os dois ao mesmo tempo: duas notificações", async () => {
    countDeadJobs.mockResolvedValue(2);
    aiDecisionStats.mockResolvedValue({ total: 10, failed: 6 });
    await runHealthCheck();
    expect(notifyAdmins).toHaveBeenCalledTimes(2);
  });
});
