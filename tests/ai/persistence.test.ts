import { describe, expect, it } from "vitest";
import { createRpcRecorder } from "@/supabase/functions/_shared/ai/recorder.ts";
import { createSettingsProvider, type RpcClient } from "@/supabase/functions/_shared/ai/settings.ts";
import { createPromptRegistry } from "@/supabase/functions/_shared/ai/prompts.ts";
import { FakeClock } from "./helpers.ts";

const row = {
  id: "x",
  scope: "default",
  confidence_threshold: "0.800",
  item_confidence_threshold: 0.6,
  critical_alerts: ["handwritten"],
  routes: {
    cheap: { provider: "openrouter", timeout_ms: 20000 },
    strong: { provider: "openrouter", timeout_ms: 40000 },
    vision: { provider: "fake", timeout_ms: 40000 },
  },
  max_escalations: 1,
  pipeline_version: "s08.1",
};
function rpcOf(fn: (name: string, args?: Record<string, unknown>) => { data: unknown; error: unknown }) {
  const calls: { name: string; args?: Record<string, unknown> }[] = [];
  const rpc: RpcClient = {
    async rpc(name, args) {
      calls.push({ name, args });
      return fn(name, args);
    },
  };
  return { rpc, calls };
}

describe("SettingsProvider", () => {
  it("valida a linha, converte numeric e camelCase; cache curto pelo relógio", async () => {
    const clock = new FakeClock();
    const { rpc, calls } = rpcOf(() => ({ data: row, error: null }));
    const p = createSettingsProvider({ rpc, clock, cacheMs: 30000 });
    const s = await p.load();
    expect(s).toEqual({
      confidenceThreshold: 0.8,
      itemConfidenceThreshold: 0.6,
      criticalAlerts: ["handwritten"],
      routes: {
        cheap: { provider: "openrouter", timeoutMs: 20000 },
        strong: { provider: "openrouter", timeoutMs: 40000 },
        vision: { provider: "fake", timeoutMs: 40000 },
      },
      maxEscalations: 1,
      pipelineVersion: "s08.1",
    });
    await p.load();
    expect(calls).toHaveLength(1);
    clock.advance(30001);
    await p.load();
    expect(calls).toHaveLength(2);
    expect(calls[0]?.name).toBe("ai_get_settings");
  });
  const bad: [string, unknown, unknown][] = [
    ["P0002 (sem linha)", null, { code: "P0002", message: "boom postgres://u:p@h" }],
    ["sem dados", null, null],
    ["limiar fora de [0,1]", { ...row, confidence_threshold: 1.5 }, null],
    ["limiar NaN", { ...row, confidence_threshold: "abc" }, null],
    ["provedor desconhecido", { ...row, routes: { ...row.routes, cheap: { provider: "x", timeout_ms: 5000 } } }, null],
    ["timeout fora da faixa", { ...row, routes: { ...row.routes, cheap: { provider: "fake", timeout_ms: 5 } } }, null],
    ["max_escalations negativo", { ...row, max_escalations: -1 }, null],
  ];
  it.each(bad)("falha fechada: %s", async (_n, data, error) => {
    const { rpc } = rpcOf(() => ({ data, error }));
    const err = await createSettingsProvider({ rpc, clock: new FakeClock() }).load().catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "ai_not_configured" });
    expect(String((err as Error).message)).not.toContain("postgres");
  });
  it("falha não é guardada em cache", async () => {
    let n = 0;
    const { rpc } = rpcOf(() => (n++ === 0 ? { data: null, error: { message: "x" } } : { data: row, error: null }));
    const p = createSettingsProvider({ rpc, clock: new FakeClock() });
    await expect(p.load()).rejects.toMatchObject({ code: "provider_error", transient: true });
    await expect(p.load()).resolves.toMatchObject({ pipelineVersion: "s08.1" });
  });
});

describe("RPC falhou (transitório) x linha ausente (configuração)", () => {
  const boom = { rpc: async () => { throw new Error("rede"); } };
  const pgErr = rpcOf(() => ({ data: null, error: { message: "boom" } })).rpc;
  it.each([
    ["settings: rpc rejeita", () => createSettingsProvider({ rpc: boom, clock: new FakeClock() }).load(), "settings_unavailable"],
    ["settings: erro PostgREST", () => createSettingsProvider({ rpc: pgErr, clock: new FakeClock() }).load(), "settings_unavailable"],
    ["prompt: rpc rejeita", () => createPromptRegistry({ rpc: boom, clock: new FakeClock() }).get("extract_list"), "prompt_unavailable"],
    ["prompt: erro PostgREST", () => createPromptRegistry({ rpc: pgErr, clock: new FakeClock() }).get("extract_list"), "prompt_unavailable"],
  ])("%s: transitório com código estável", async (_n, run, detail) => {
    const err = await run().catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "provider_error", transient: true, detail });
  });
  it("gravação da decisão: falha da RPC é transitória; P0002 é permanente", async () => {
    const d = { entityType: "x", entityId: "i", kind: "extraction", provider: "fake", model: "m", promptKey: "k", promptVersion: 1, pipelineVersion: "v", overallScore: 1, itemScores: [], alerts: [], decision: "accepted", justification: "accepted", attempt: 1, startedAt: "a", finishedAt: "b", latencyMs: 1 } as never;
    await expect(createRpcRecorder(boom).record(d)).rejects.toMatchObject({ transient: true, detail: "decision_record_failed" });
    await expect(createRpcRecorder(pgErr).record(d)).rejects.toMatchObject({ transient: true, detail: "decision_record_failed" });
    const p0002 = rpcOf(() => ({ data: null, error: { code: "P0002", message: "x" } })).rpc;
    await expect(createRpcRecorder(p0002).record(d)).rejects.toMatchObject({ transient: false, detail: "decision_record_failed" });
  });
});

describe("PromptRegistry", () => {
  const prow = { id: "p", key: "extract_list", version: 3, text: "texto", schema: { a: 1 }, is_active: true };
  it("lê o prompt ativo por key e valida", async () => {
    const { rpc, calls } = rpcOf(() => ({ data: prow, error: null }));
    const reg = createPromptRegistry({ rpc, clock: new FakeClock() });
    expect(await reg.get("extract_list")).toEqual({ key: "extract_list", version: 3, text: "texto", schema: { a: 1 } });
    expect(calls[0]).toEqual({ name: "ai_get_active_prompt", args: { p_key: "extract_list" } });
  });
  it.each([
    ["key inválida", "Extract List!", prow, null],
    ["erro P0002", "extract_list", null, { code: "P0002", message: "prompt ativo inexistente" }],
    ["texto vazio", "extract_list", { ...prow, text: "" }, null],
    ["versão inválida", "extract_list", { ...prow, version: 0 }, null],
  ])("falha fechada: %s", async (_n, key, data, error) => {
    const { rpc, calls } = rpcOf(() => ({ data, error }));
    await expect(createPromptRegistry({ rpc, clock: new FakeClock() }).get(key)).rejects.toMatchObject({ code: "ai_not_configured" });
    if (key.includes("!")) expect(calls).toHaveLength(0);
  });
});

describe("DecisionRecorder", () => {
  const decision = {
    entityType: "list_submission",
    entityId: "11111111-1111-4111-8111-111111111111",
    kind: "extraction" as const,
    provider: "fake" as const,
    model: "m",
    promptKey: "extract_list",
    promptVersion: 1,
    pipelineVersion: "s08.1",
    overallScore: 0.9,
    itemScores: [0.9],
    alerts: ["low_confidence_item"],
    decision: "accepted" as const,
    justification: "accepted",
    attempt: 1,
    startedAt: "2026-09-25T10:00:00.000Z",
    finishedAt: "2026-09-25T10:00:01.000Z",
    latencyMs: 1000,
  };
  it("chama ai_record_decision só com os campos da whitelist, em snake_case", async () => {
    const { rpc, calls } = rpcOf(() => ({ data: "uuid", error: null }));
    await createRpcRecorder(rpc).record(decision);
    expect(calls[0]?.name).toBe("ai_record_decision");
    expect(Object.keys(calls[0]?.args?.p_decision as object).sort()).toEqual(
      ["alerts", "attempt", "decision", "entity_id", "entity_type", "finished_at", "item_scores", "justification", "kind", "latency_ms", "model", "overall_score", "pipeline_version", "prompt_key", "prompt_version", "provider", "started_at"].sort(),
    );
  });
  it("erro do banco vira AiError sem eco", async () => {
    const { rpc } = rpcOf(() => ({ data: null, error: { message: "secret detail" } }));
    const err = await createRpcRecorder(rpc).record(decision).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "provider_error" });
    expect(String((err as Error).message)).not.toContain("secret");
  });
});
