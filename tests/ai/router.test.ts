import { describe, expect, it } from "vitest";
import { AiError, isAiError } from "@/supabase/functions/_shared/ai/errors.ts";
import { FakeProvider, type FakeStep } from "@/supabase/functions/_shared/ai/fake.ts";
import { createRouter } from "@/supabase/functions/_shared/ai/router.ts";
import type { Route } from "@/supabase/functions/_shared/ai/types.ts";
import {
  FakeClock,
  flush,
  good,
  makeRecorder,
  makeSettings,
  makeTask,
  promptsOf,
  settingsOf,
} from "./helpers.ts";

function setup(script: Partial<Record<Route, FakeStep[]>>, settings = makeSettings()) {
  const clock = new FakeClock();
  const fakes = {
    cheap: new FakeProvider(script.cheap ?? [], { model: "m-cheap", clock }),
    strong: new FakeProvider(script.strong ?? [], { model: "m-strong", clock }),
    vision: new FakeProvider(script.vision ?? [], { model: "m-vision", clock }),
  };
  const recorder = makeRecorder();
  const router = createRouter({
    allowFake: true,
    providers: { fake: (route) => fakes[route] },
    settings: settingsOf(settings),
    prompts: promptsOf(),
    recorder,
    clock,
  });
  return { clock, fakes, recorder, router };
}

const decisions = (r: ReturnType<typeof makeRecorder>) => r.rows.map((d) => `${d.decision}:${d.attempt}`);

describe("roteador barato-primeiro", () => {
  it("aceita a rota barata sem chamar a forte", async () => {
    const { fakes, recorder, router } = setup({ cheap: [good()] });
    const out = await router.run(makeTask(), { budgetMs: 60000 });
    expect(out.route).toBe("cheap");
    expect(out.lowConfidence).toBe(false);
    expect(fakes.strong.calls).toHaveLength(0);
    expect(decisions(recorder)).toEqual(["accepted:1"]);
    expect(recorder.rows[0]).toMatchObject({
      kind: "extraction",
      provider: "fake",
      model: "m-cheap",
      promptKey: "extract_list",
      promptVersion: 1,
      pipelineVersion: "s08.1",
      entityType: "list_submission",
    });
  });

  const escalations: [string, FakeStep, string][] = [
    ["JSON que falha o Zod", { json: { items: [{ name: "", confidence: 2 }] } }, "invalid_output"],
    ["texto que não é JSON", { text: "desculpe, não consigo" }, "invalid_output"],
    ["confiança abaixo do limiar", good(0.3), "low_confidence"],
    ["erro transitório do provedor", { fail: { code: "provider_error", transient: true, status: 503 } }, "provider_error"],
  ];
  it.each(escalations)("escala barato→forte: %s", async (_n, step, code) => {
    const { fakes, recorder, router } = setup({ cheap: [step], strong: [good()] });
    const out = await router.run(makeTask(), { budgetMs: 60000 });
    expect(out.route).toBe("strong");
    expect(out.attempts).toBe(2);
    expect(fakes.strong.calls).toHaveLength(1);
    expect(decisions(recorder)).toEqual(["escalated:1", "accepted:2"]);
    expect(recorder.rows[0]?.justification).toBe(code);
    expect(recorder.rows[0]?.model).toBe("m-cheap");
    expect(recorder.rows[1]?.model).toBe("m-strong");
  });

  it("escala no timeout da rota barata e cancela a chamada pendente", async () => {
    const { clock, fakes, recorder, router } = setup({ cheap: [{ hang: true }], strong: [good()] });
    const p = router.run(makeTask(), { budgetMs: 90000 });
    await flush();
    clock.advance(20000);
    const out = await p;
    expect(out.route).toBe("strong");
    expect(fakes.cheap.calls[0]?.aborted()).toBe(true);
    expect(decisions(recorder)).toEqual(["escalated:1", "accepted:2"]);
    expect(recorder.rows[0]?.justification).toBe("provider_timeout");
  });

  it("não escala por erro permanente e nem chama a rede seguinte", async () => {
    const { fakes, recorder, router } = setup({
      cheap: [{ fail: { code: "provider_error", transient: false, status: 401 } }],
      strong: [good()],
    });
    await expect(router.run(makeTask(), { budgetMs: 60000 })).rejects.toMatchObject({ code: "provider_error" });
    expect(fakes.strong.calls).toHaveLength(0);
    expect(decisions(recorder)).toEqual(["failed:1"]);
  });

  it("max_escalations = 0 nunca escala", async () => {
    const { fakes, recorder, router } = setup({ cheap: [{ text: "nada" }], strong: [good()] }, makeSettings({ maxEscalations: 0 }));
    await expect(router.run(makeTask(), { budgetMs: 60000 })).rejects.toMatchObject({ code: "invalid_output" });
    expect(fakes.strong.calls).toHaveLength(0);
    expect(decisions(recorder)).toEqual(["failed:1"]);
  });

  it("no máximo uma escalada mesmo com max_escalations alto; esgotou = failed", async () => {
    const { fakes, recorder, router } = setup(
      { cheap: [{ text: "x" }], strong: [{ text: "y" }, good()] },
      makeSettings({ maxEscalations: 3 }),
    );
    const err = await router.run(makeTask(), { budgetMs: 60000 }).catch((e: unknown) => e);
    expect(isAiError(err) && err.code).toBe("invalid_output");
    expect(fakes.cheap.calls).toHaveLength(1);
    expect(fakes.strong.calls).toHaveLength(1);
    expect(decisions(recorder)).toEqual(["escalated:1", "failed:2"]);
  });

  it("confiança baixa na última tentativa: aceita com lowConfidence, nunca inválido", async () => {
    const { recorder, router } = setup({ cheap: [good(0.2)], strong: [good(0.4)] });
    const out = await router.run(makeTask(), { budgetMs: 60000 });
    expect(out.lowConfidence).toBe(true);
    expect(out.route).toBe("strong");
    expect(recorder.rows.map((d) => d.decision)).toEqual(["escalated", "accepted"]);
    expect(recorder.rows[1]?.justification).toBe("low_confidence");
  });

  it("respeita o AbortSignal: cancela a chamada pendente e não grava decisão", async () => {
    const { fakes, recorder, router } = setup({ cheap: [{ hang: true }], strong: [good()] });
    const ac = new AbortController();
    const p = router.run(makeTask(), { budgetMs: 60000, signal: ac.signal });
    await flush();
    ac.abort();
    await expect(p).rejects.toMatchObject({ code: "aborted" });
    expect(fakes.cheap.calls[0]?.aborted()).toBe(true);
    expect(fakes.strong.calls).toHaveLength(0);
    expect(recorder.rows).toHaveLength(0);
  });

  it("signal já abortado ou orçamento zero: nenhuma chamada", async () => {
    const { fakes, recorder, router } = setup({ cheap: [good()] });
    const ac = new AbortController();
    ac.abort();
    await expect(router.run(makeTask(), { budgetMs: 1000, signal: ac.signal })).rejects.toMatchObject({ code: "aborted" });
    await expect(router.run(makeTask(), { budgetMs: 0 })).rejects.toMatchObject({ code: "aborted" });
    expect(fakes.cheap.calls).toHaveLength(0);
    expect(recorder.rows).toHaveLength(0);
  });

  it("orçamento limita o timeout da tentativa e impede escalar sem prazo", async () => {
    const a = setup({ cheap: [{ hang: true }], strong: [good()] });
    const p1 = a.router.run(makeTask(), { budgetMs: 20000 });
    await flush();
    a.clock.advance(20000);
    await expect(p1).rejects.toMatchObject({ code: "provider_timeout" });
    expect(a.fakes.strong.calls).toHaveLength(0);
    expect(decisions(a.recorder)).toEqual(["failed:1"]);

    const b = setup({ cheap: [{ hang: true }], strong: [{ hang: true }] });
    const p2 = b.router.run(makeTask(), { budgetMs: 25000 });
    await flush();
    b.clock.advance(20000);
    await flush();
    b.clock.advance(5000); // restam 5 s para a forte, não 40 s
    await expect(p2).rejects.toMatchObject({ code: "provider_timeout" });
    expect(decisions(b.recorder)).toEqual(["escalated:1", "failed:2"]);
    expect(b.clock.pending()).toBe(0);
  });

  it("settings indisponíveis: falha fechada, sem chamada nem decisão", async () => {
    const clock = new FakeClock();
    const fake = new FakeProvider([good()], { clock });
    const recorder = makeRecorder();
    const router = createRouter({
      allowFake: true,
      providers: { fake: () => fake },
      settings: settingsOf(async () => {
        throw new Error("connection refused postgres://user:pw@host");
      }),
      prompts: promptsOf(),
      recorder,
      clock,
    });
    const err = await router.run(makeTask(), { budgetMs: 1000 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).code).toBe("ai_not_configured");
    expect(String((err as AiError).message)).not.toContain("postgres");
    expect(fake.calls).toHaveLength(0);
    expect(recorder.rows).toHaveLength(0);
  });

  it("prompt indisponível: falha fechada", async () => {
    const clock = new FakeClock();
    const fake = new FakeProvider([good()], { clock });
    const router = createRouter({
      allowFake: true,
      providers: { fake: () => fake },
      settings: settingsOf(makeSettings()),
      prompts: promptsOf(async () => {
        throw new Error("boom");
      }),
      recorder: makeRecorder(),
      clock,
    });
    await expect(router.run(makeTask(), { budgetMs: 1000 })).rejects.toMatchObject({ code: "ai_not_configured" });
    expect(fake.calls).toHaveLength(0);
  });

  it("provedor não configurado (chave/modelo ausente): erro permanente, sem decisão e sem escalar", async () => {
    const clock = new FakeClock();
    const recorder = makeRecorder();
    const strongCalls: string[] = [];
    const router = createRouter({
      allowFake: true,
      providers: {
        fake: (route) => {
          strongCalls.push(route);
          throw new AiError("ai_not_configured", { detail: "missing_model" });
        },
      },
      settings: settingsOf(makeSettings()),
      prompts: promptsOf(),
      recorder,
      clock,
    });
    await expect(router.run(makeTask(), { budgetMs: 1000 })).rejects.toMatchObject({ code: "ai_not_configured" });
    expect(strongCalls).toEqual(["cheap"]);
    expect(recorder.rows).toHaveLength(0);
  });

  it("provedor sem fábrica registrada: ai_not_configured", async () => {
    const clock = new FakeClock();
    const router = createRouter({
      allowFake: true,
      providers: {},
      settings: settingsOf(makeSettings()),
      prompts: promptsOf(),
      recorder: makeRecorder(),
      clock,
    });
    await expect(router.run(makeTask(), { budgetMs: 1000 })).rejects.toMatchObject({ code: "ai_not_configured" });
  });

  it("trocar o provedor por ai_settings muda a rota sem alterar o domínio (aceite do PLAN)", async () => {
    const clock = new FakeClock();
    const fakeA = new FakeProvider([good()], { model: "m-fake", clock });
    const fakeB = new FakeProvider([good()], { model: "m-router", clock });
    const recorder = makeRecorder();
    let settings = makeSettings();
    const router = createRouter({
      allowFake: true,
      providers: { fake: () => fakeA, openrouter: () => fakeB },
      settings: { load: async () => settings },
      prompts: promptsOf(),
      recorder,
      clock,
    });
    const task = makeTask();
    await router.run(task, { budgetMs: 1000 });
    settings = makeSettings({ routes: { ...settings.routes, cheap: { provider: "openrouter", timeoutMs: 20000 } } });
    await router.run(task, { budgetMs: 1000 });
    expect(recorder.rows.map((d) => [d.provider, d.model])).toEqual([
      ["fake", "m-fake"],
      ["openrouter", "m-router"],
    ]);
  });

  it("entrada visual começa pela rota vision", async () => {
    const { fakes, recorder, router } = setup({ vision: [good()], cheap: [good()] });
    const out = await router.run(makeTask({ needsVision: true }), { budgetMs: 1000 });
    expect(out.route).toBe("vision");
    expect(fakes.cheap.calls).toHaveLength(0);
    expect(recorder.rows[0]?.model).toBe("m-vision");
  });

  it("vision_model_missing é permanente", async () => {
    const clock = new FakeClock();
    const router = createRouter({
      allowFake: true,
      providers: {
        fake: () => {
          throw new AiError("vision_model_missing");
        },
      },
      settings: settingsOf(makeSettings()),
      prompts: promptsOf(),
      recorder: makeRecorder(),
      clock,
    });
    await expect(router.run(makeTask({ needsVision: true }), { budgetMs: 1000 })).rejects.toMatchObject({
      code: "vision_model_missing",
    });
  });

  it("a decisão só leva códigos, scores em [0,1] e arredondados, sem conteúdo do documento", async () => {
    const { recorder, router } = setup({ cheap: [good(0.87654)] });
    const task = makeTask({
      evaluate: () => ({
        overall: 0.87654,
        items: [0.87654, 7, -1, Number.NaN],
        alerts: ["low_confidence_item", "Texto Livre do Documento!", "ambiguous_item"],
      }),
    });
    await router.run(task, { budgetMs: 1000 });
    const d = recorder.rows[0];
    expect(d?.overallScore).toBe(0.877);
    expect(d?.itemScores).toEqual([0.877, 1, 0, 0]);
    expect(d?.alerts).toEqual(["low_confidence_item", "ambiguous_item"]);
    expect(JSON.stringify(d)).not.toContain("Caderno");
  });

  it("uma decisão por tentativa, sem duplicar", async () => {
    const { recorder, router } = setup({ cheap: [good(0.1)], strong: [good()] });
    await router.run(makeTask(), { budgetMs: 1000 });
    expect(recorder.rows.map((d) => d.attempt)).toEqual([1, 2]);
  });
  it("cadeia inteira resolvida antes da 1ª tentativa: strong sem modelo + cheap barato falha fechado, sem rede nem decisão", async () => {
    const clock = new FakeClock();
    const cheap = new FakeProvider([good(0.3)], { clock });
    const recorder = makeRecorder();
    const router = createRouter({
      allowFake: true,
      providers: {
        fake: (route) => {
          if (route === "strong") throw new AiError("ai_not_configured", { detail: "model_strong" });
          return cheap;
        },
      },
      settings: settingsOf(makeSettings()),
      prompts: promptsOf(),
      recorder,
      clock,
    });
    await expect(router.run(makeTask(), { budgetMs: 1000 })).rejects.toMatchObject({ code: "ai_not_configured" });
    expect(cheap.calls).toHaveLength(0);
    expect(recorder.rows).toHaveLength(0);
  });

  it("strong só é exigido quando max_escalations >= 1", async () => {
    const clock = new FakeClock();
    const cheap = new FakeProvider([good()], { clock });
    const router = createRouter({
      allowFake: true,
      providers: {
        fake: (route) => {
          if (route === "strong") throw new AiError("ai_not_configured", { detail: "model_strong" });
          return cheap;
        },
      },
      settings: settingsOf(makeSettings({ maxEscalations: 0 })),
      prompts: promptsOf(),
      recorder: makeRecorder(),
      clock,
    });
    await expect(router.run(makeTask(), { budgetMs: 1000 })).resolves.toMatchObject({ route: "cheap" });
  });

  it("fábrica que lança erro qualquer (não AiError) também falha fechado", async () => {
    const clock = new FakeClock();
    const router = createRouter({
      allowFake: true,
      providers: { fake: () => { throw new Error("boom postgres://u:p@h"); } },
      settings: settingsOf(makeSettings()),
      prompts: promptsOf(),
      recorder: makeRecorder(),
      clock,
    });
    const err = await router.run(makeTask(), { budgetMs: 1000 }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "ai_not_configured" });
    expect(String((err as Error).message)).not.toContain("postgres");
  });

  describe("provedor fake só com allowFake explícito", () => {
    const mkRouter = (extra: { allowFake?: boolean; env?: { NODE_ENV?: string } }) => {
      const clock = new FakeClock();
      const fake = new FakeProvider([good()], { clock });
      const recorder = makeRecorder();
      const router = createRouter({
        ...extra,
        providers: { fake: () => fake },
        settings: settingsOf(makeSettings()),
        prompts: promptsOf(),
        recorder,
        clock,
      });
      return { fake, recorder, router };
    };
    it("default (sem allowFake): ai_not_configured, sem rede nem decisão", async () => {
      const { fake, recorder, router } = mkRouter({});
      await expect(router.run(makeTask(), { budgetMs: 1000 })).rejects.toMatchObject({ code: "ai_not_configured" });
      expect(fake.calls).toHaveLength(0);
      expect(recorder.rows).toHaveLength(0);
    });
    it("allowFake false explícito também recusa", async () => {
      const { fake, router } = mkRouter({ allowFake: false });
      await expect(router.run(makeTask(), { budgetMs: 1000 })).rejects.toMatchObject({ code: "ai_not_configured" });
      expect(fake.calls).toHaveLength(0);
    });
    it("allowFake true funciona fora de produção", async () => {
      const { router } = mkRouter({ allowFake: true, env: { NODE_ENV: "test" } });
      await expect(router.run(makeTask(), { budgetMs: 1000 })).resolves.toMatchObject({ provider: "fake" });
    });
    it("NODE_ENV=production sempre recusa, mesmo com allowFake true", async () => {
      const { fake, router } = mkRouter({ allowFake: true, env: { NODE_ENV: "production" } });
      await expect(router.run(makeTask(), { budgetMs: 1000 })).rejects.toMatchObject({ code: "ai_not_configured" });
      expect(fake.calls).toHaveLength(0);
    });
  });

  it("alertas: só os códigos do spec passam (regex sozinha não basta)", async () => {
    const { recorder, router } = setup({ cheap: [good()] });
    const task = makeTask({
      evaluate: () => ({
        overall: 0.9,
        items: [0.9],
        alerts: ["low_confidence_item", "leite_ninho_400g", "critical", "handwritten", "invalid_school_grade_year", "possible_collective_item"],
      }),
    });
    await router.run(task, { budgetMs: 1000 });
    expect(recorder.rows[0]?.alerts).toEqual(["low_confidence_item", "handwritten", "invalid_school_grade_year", "possible_collective_item"]);
  });

  it("exceção comum em buildRequest ou evaluate é erro permanente: não escala, sem eco", async () => {
    for (const bad of [
      makeTask({ buildRequest: () => { throw new Error("segredo Caderno do João"); } }),
      makeTask({ evaluate: () => { throw new TypeError("segredo Caderno do João"); } }),
    ]) {
      const { fakes, recorder, router } = setup({ cheap: [good()], strong: [good()] });
      const err = await router.run(bad, { budgetMs: 1000 }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AiError);
      expect((err as AiError).transient).toBe(false);
      expect(String((err as AiError).message)).not.toContain("João");
      expect(fakes.strong.calls).toHaveLength(0);
      expect(recorder.rows.map((d) => d.decision)).toEqual(["failed"]);
    }
  });

  it("isAiError só por instanceof: objeto com name=AiError não vale", () => {
    expect(isAiError({ name: "AiError", code: "aborted" })).toBe(false);
    expect(isAiError(new AiError("aborted"))).toBe(true);
  });

  it("usage soma os tokens de todas as tentativas", async () => {
    const { router } = setup({
      cheap: [{ ...good(0.1), usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 } }],
      strong: [{ ...good(), usage: { promptTokens: 20, completionTokens: 5 } }],
    });
    const out = await router.run(makeTask(), { budgetMs: 1000 });
    expect(out.usage).toEqual({ promptTokens: 30, completionTokens: 7, totalTokens: 12 });
  });

  it("usage vazio quando o provedor não informa", async () => {
    const { router } = setup({ cheap: [good()] });
    expect((await router.run(makeTask(), { budgetMs: 1000 })).usage).toEqual({});
  });
});
