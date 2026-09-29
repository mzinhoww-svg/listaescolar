import { describe, expect, it } from "vitest";

import { summarizeListCost, usdMicrosToBrlCents } from "@/features/ai-settings/cost";
import { OpenRouterAdapter, type FetchLike } from "@/supabase/functions/_shared/ai/openrouter.ts";
import { createRpcRecorder } from "@/supabase/functions/_shared/ai/recorder.ts";
import { FakeProvider, type FakeStep } from "@/supabase/functions/_shared/ai/fake.ts";
import { createRouter } from "@/supabase/functions/_shared/ai/router.ts";
import type { RpcClient } from "@/supabase/functions/_shared/ai/settings.ts";
import type { Route } from "@/supabase/functions/_shared/ai/types.ts";
import { FakeClock, good, makeRecorder, makeSettings, makeTask, promptsOf, settingsOf } from "./helpers.ts";

describe("usdMicrosToBrlCents", () => {
  it("US$ 1,00 a 5,00 = R$ 5,00 = 500 centavos", () => {
    expect(usdMicrosToBrlCents(1_000_000, 5)).toBe(500);
  });
  it("arredonda para o centavo", () => {
    expect(usdMicrosToBrlCents(4_200, 5.4321)).toBe(2); // 0,004200 US$ * 5,4321 = R$ 0,0228 = 2,28 centavos
    expect(usdMicrosToBrlCents(0, 5)).toBe(0); // custo zero informado é zero de verdade
  });
  it("sem taxa válida nunca inventa: devolve null", () => {
    for (const rate of [null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(usdMicrosToBrlCents(1_000_000, rate as number | null), String(rate)).toBeNull();
    }
  });
});

describe("summarizeListCost", () => {
  it("soma o custo conhecido e converte com a taxa", () => {
    const s = summarizeListCost([{ provider_cost_usd_micros: 400_000 }, { provider_cost_usd_micros: 600_000 }], 5);
    expect(s).toEqual({ usdMicros: 1_000_000, unknownRows: 0, brlCents: 500 });
  });
  it("uma linha sem custo: custo parcial nunca vira total em reais", () => {
    const s = summarizeListCost([{ provider_cost_usd_micros: 400_000 }, { provider_cost_usd_micros: null }], 5);
    expect(s).toEqual({ usdMicros: 400_000, unknownRows: 1, brlCents: null });
  });
  it("sem taxa: dólar conhecido, reais indisponíveis", () => {
    expect(summarizeListCost([{ provider_cost_usd_micros: 1_000_000 }], null)).toEqual({ usdMicros: 1_000_000, unknownRows: 0, brlCents: null });
  });
  it("sem linhas: nada a dizer sobre reais (não é zero)", () => {
    expect(summarizeListCost([], 5)).toMatchObject({ unknownRows: 0, usdMicros: 0 });
  });
});

describe("OpenRouter: uso e custo devolvidos pelo provedor", () => {
  const KEY = ["k", "test", "SECRET", "0123456789"].join("-");
  const reply = (body: unknown, calls: Parameters<FetchLike>[1][] = []): FetchLike =>
    async (_url, init) => {
      calls.push(init);
      return { ok: true, status: 200, text: async () => JSON.stringify(body) };
    };
  const base = { choices: [{ message: { role: "assistant", content: '{"items":[]}' } }] };
  const req = { messages: [{ role: "user" as const, content: "oi" }] };
  const mk = (f: FetchLike) => new OpenRouterAdapter({ apiKey: KEY, model: "m-x", fetchImpl: f, baseUrl: "https://or.test/api/v1" });

  it("pede o uso na resposta (usage.include) sem fixar modelo nem preço", async () => {
    const calls: Parameters<FetchLike>[1][] = [];
    await mk(reply({ ...base, usage: { prompt_tokens: 1 } }, calls)).complete(req, {});
    expect(JSON.parse(calls[0]!.body)).toMatchObject({ model: "m-x", usage: { include: true } });
  });

  it("lê tokens e o custo em dólar informado, em micros", async () => {
    const r = await mk(reply({ ...base, usage: { prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500, cost: 0.0042 } })).complete(req, {});
    expect(r.usage).toEqual({ promptTokens: 1200, completionTokens: 300, totalTokens: 1500, costUsdMicros: 4200 });
  });

  it("sem custo na resposta: nenhum custo (nunca zero fictício)", async () => {
    const r = await mk(reply({ ...base, usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 } })).complete(req, {});
    expect(r.usage).toEqual({ promptTokens: 12, completionTokens: 3, totalTokens: 15 });
    expect(r.usage).not.toHaveProperty("costUsdMicros");
  });

  it("custo inválido (negativo, NaN, texto) é ignorado", async () => {
    for (const cost of [-1, "x", null]) {
      const r = await mk(reply({ ...base, usage: { prompt_tokens: 1, cost } })).complete(req, {});
      expect(r.usage, String(cost)).not.toHaveProperty("costUsdMicros");
    }
  });
});

describe("roteador: o uso de cada tentativa vai para a decisão", () => {
  function setup(script: Partial<Record<Route, FakeStep[]>>) {
    const clock = new FakeClock();
    const fakes = {
      cheap: new FakeProvider(script.cheap ?? [], { model: "m-cheap", clock }),
      strong: new FakeProvider(script.strong ?? [], { model: "m-strong", clock }),
      vision: new FakeProvider(script.vision ?? [], { model: "m-vision", clock }),
    };
    const recorder = makeRecorder();
    const router = createRouter({ allowFake: true, providers: { fake: (r) => fakes[r] }, settings: settingsOf(makeSettings()), prompts: promptsOf(), recorder, clock });
    return { recorder, router };
  }

  it("grava o uso quando o provedor informa, por tentativa (a escalada também foi paga)", async () => {
    const { recorder, router } = setup({
      cheap: [{ ...good(0.1), usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12, costUsdMicros: 300 } }],
      strong: [{ ...good(), usage: { promptTokens: 20, completionTokens: 5, totalTokens: 25, costUsdMicros: 900 } }],
    });
    const out = await router.run(makeTask(), { budgetMs: 1000 });
    expect(recorder.rows.map((d) => d.usage)).toEqual([
      { promptTokens: 10, completionTokens: 2, totalTokens: 12, costUsdMicros: 300 },
      { promptTokens: 20, completionTokens: 5, totalTokens: 25, costUsdMicros: 900 },
    ]);
    expect(out.usage).toMatchObject({ totalTokens: 37, costUsdMicros: 1200 });
  });

  it("grava nulo (sem uso) quando o provedor não informa", async () => {
    const { recorder, router } = setup({ cheap: [good()] });
    await router.run(makeTask(), { budgetMs: 1000 });
    expect(recorder.rows[0]!.usage).toBeUndefined();
  });
});

describe("gravador RPC: uso opcional no JSON", () => {
  const record = async (usage?: Parameters<ReturnType<typeof createRpcRecorder>["record"]>[0]["usage"]) => {
    const calls: Record<string, unknown>[] = [];
    const rpc: RpcClient = { async rpc(_n, args) { calls.push(args as Record<string, unknown>); return { data: "id", error: null }; } };
    await createRpcRecorder(rpc).record({
      entityType: "list_submission", entityId: "11111111-1111-4111-8111-111111111111", kind: "extraction", provider: "fake", model: "m",
      promptKey: "extract_list", promptVersion: 1, pipelineVersion: "s08.1", overallScore: 0.9, itemScores: [0.9], alerts: [],
      decision: "accepted", justification: "accepted", attempt: 1, startedAt: "2026-09-29T10:00:00.000Z", finishedAt: "2026-09-29T10:00:01.000Z", latencyMs: 1000,
      ...(usage ? { usage } : {}),
    });
    return calls[0]!.p_decision as Record<string, unknown>;
  };

  it("com uso: chaves snake_case só para o que veio", async () => {
    const d = await record({ promptTokens: 10, completionTokens: 2, totalTokens: 12, costUsdMicros: 300 });
    expect(d).toMatchObject({ prompt_tokens: 10, completion_tokens: 2, total_tokens: 12, provider_cost_usd_micros: 300 });
    const partial = await record({ totalTokens: 7 });
    expect(partial).toMatchObject({ total_tokens: 7 });
    expect(partial).not.toHaveProperty("provider_cost_usd_micros");
  });

  it("sem uso: nenhuma das quatro chaves (o banco grava nulo)", async () => {
    const d = await record();
    for (const k of ["prompt_tokens", "completion_tokens", "total_tokens", "provider_cost_usd_micros"]) expect(d).not.toHaveProperty(k);
  });

  it("valores não inteiros ou negativos não vão ao banco", async () => {
    const d = await record({ promptTokens: -1, completionTokens: 1.5, totalTokens: Number.NaN, costUsdMicros: -5 });
    for (const k of ["prompt_tokens", "completion_tokens", "total_tokens", "provider_cost_usd_micros"]) expect(d).not.toHaveProperty(k);
  });
});
