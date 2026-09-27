import { describe, expect, it } from "vitest";

import { updateAiSettingsSchema } from "@/features/ai-settings/schemas";

const ok = { confidenceThreshold: "0.8", itemConfidenceThreshold: "0.7", maxEscalations: "1", pipelineVersion: "v1" };

describe("updateAiSettingsSchema", () => {
  it("aceita o caso comum e coage string -> número", () => {
    const r = updateAiSettingsSchema.parse(ok);
    expect(r.confidenceThreshold).toBe(0.8);
    expect(r.maxEscalations).toBe(1);
    expect(r.criticalAlerts).toEqual([]);
  });
  it.each([
    ["limiar negativo", { confidenceThreshold: "-0.1" }],
    ["limiar > 1", { itemConfidenceThreshold: "1.1" }],
    ["max_escalations > 3", { maxEscalations: "4" }],
    ["max_escalations negativo", { maxEscalations: "-1" }],
    ["pipeline_version vazio", { pipelineVersion: "" }],
    ["pipeline_version longo", { pipelineVersion: "x".repeat(41) }],
    ["alerta crítico desconhecido", { criticalAlerts: ["nao_existe"] }],
  ])("recusa %s", (_n, patch) => {
    expect(updateAiSettingsSchema.safeParse({ ...ok, ...patch }).success).toBe(false);
  });
  it("NUNCA aceita auto_publish_enabled nem routes (mesmo se alguém injetar no payload)", () => {
    const r = updateAiSettingsSchema.parse({ ...ok, autoPublishEnabled: true, routes: { anything: true } } as unknown as typeof ok);
    expect(r).not.toHaveProperty("autoPublishEnabled");
    expect(r).not.toHaveProperty("routes");
  });
});
