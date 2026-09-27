import { describe, expect, it } from "vitest";

import { shouldAlertAiErrorRate, shouldAlertDeadJobs } from "@/features/health/thresholds";

describe("shouldAlertDeadJobs", () => {
  it("qualquer job morto já alerta", () => {
    expect(shouldAlertDeadJobs(0)).toBe(false);
    expect(shouldAlertDeadJobs(1)).toBe(true);
    expect(shouldAlertDeadJobs(9)).toBe(true);
  });
});

describe("shouldAlertAiErrorRate", () => {
  it("sem amostra mínima (5), nunca alerta mesmo com 100% de falha", () => {
    expect(shouldAlertAiErrorRate(4, 4)).toBe(false);
    expect(shouldAlertAiErrorRate(0, 0)).toBe(false);
  });
  it("com amostra mínima, alerta só acima de 20%", () => {
    expect(shouldAlertAiErrorRate(5, 1)).toBe(false); // 20% exato: não alerta (estritamente maior)
    expect(shouldAlertAiErrorRate(5, 2)).toBe(true); // 40%
    expect(shouldAlertAiErrorRate(100, 20)).toBe(false); // 20% exato
    expect(shouldAlertAiErrorRate(100, 21)).toBe(true);
  });
});
