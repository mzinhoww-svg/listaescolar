import { describe, expect, it } from "vitest";
import { isAiError } from "@/supabase/functions/_shared/ai/errors.ts";
import {
  OpenRouterAdapter,
  loadModelsFromEnv,
  openRouterProviderFactory,
  type FetchLike,
} from "@/supabase/functions/_shared/ai/openrouter.ts";

const KEY = ["k", "test", "SECRET", "0123456789"].join("-");
type Call = { url: string; init: Parameters<FetchLike>[1] };

function reply(status: number, body: unknown, calls: Call[] = []): FetchLike {
  return async (url, init) => {
    calls.push({ url, init });
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return { ok: status >= 200 && status < 300, status, text: async () => text };
  };
}
const ok = {
  id: "gen-1",
  model: "provider/served-model",
  choices: [{ message: { role: "assistant", content: '{"items":[]}' }, finish_reason: "stop" }],
  usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
};
const mk = (fetchImpl: FetchLike, model = "m-x") =>
  new OpenRouterAdapter({ apiKey: KEY, model, fetchImpl, baseUrl: "https://or.test/api/v1" });
const req = { messages: [{ role: "user" as const, content: "oi" }], responseFormat: "json" as const, temperature: 0, maxTokens: 500 };

describe("OpenRouterAdapter", () => {
  it("monta URL, cabeçalhos e corpo; a chave só vai no Authorization", async () => {
    const calls: Call[] = [];
    const ac = new AbortController();
    const res = await mk(reply(200, ok, calls)).complete(req, { signal: ac.signal });
    const c = calls[0]!;
    expect(c.url).toBe("https://or.test/api/v1/chat/completions");
    expect(c.init.method).toBe("POST");
    expect(c.init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(c.init.headers["Content-Type"]).toBe("application/json");
    expect(c.init.signal).toBe(ac.signal);
    expect(c.init.body).not.toContain(KEY);
    expect(JSON.parse(c.init.body)).toEqual({
      model: "m-x",
      messages: [{ role: "user", content: "oi" }],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 500,
    });
    expect(res.text).toBe('{"items":[]}');
    expect(res.model).toBe("m-x");
    expect(res.usage).toEqual({ promptTokens: 12, completionTokens: 3, totalTokens: 15 });
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("imagem vira data URL em image_url e PDF vira parte file com data URL", async () => {
    const calls: Call[] = [];
    const a = mk(reply(200, ok, calls));
    await a.complete(
      {
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "leia" },
              { type: "image", mime: "image/png", bytes: new Uint8Array([1, 2, 3]) },
              { type: "file", mime: "application/pdf", fileName: "lista.pdf", bytes: new Uint8Array([37, 80, 68, 70]) },
            ],
          },
        ],
        responseFormat: "json",
      },
      {},
    );
    const body = JSON.parse(calls[0]!.init.body) as { messages: { content: unknown[] }[] };
    expect(body.messages[0]!.content).toEqual([
      { type: "text", text: "leia" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AQID" } },
      { type: "file", file: { filename: "lista.pdf", file_data: "data:application/pdf;base64,JVBERg==" } },
    ]);
  });

  it("mime não suportado é erro permanente e não faz chamada", async () => {
    const calls: Call[] = [];
    const err = await mk(reply(200, ok, calls))
      .complete(
        { messages: [{ role: "user", content: [{ type: "image", mime: "image/heic", bytes: new Uint8Array(1) }] }], responseFormat: "json" },
        {},
      )
      .catch((e: unknown) => e);
    expect(isAiError(err) && [err.code, err.transient]).toEqual(["provider_error", false]);
    expect(calls).toHaveLength(0);
  });

  const statuses: [number, boolean][] = [[400, false], [401, false], [402, false], [403, false], [404, false], [408, true], [429, true], [500, true], [502, true], [503, true]];
  it.each(statuses)("HTTP %i vira provider_error (transitório=%s) sanitizado, sem eco de chave nem corpo", async (status, transient) => {
    const echo = `Authorization: Bearer ${KEY} secret-body-detail`;
    const err = await mk(reply(status, { error: { message: echo } }))
      .complete(req, {})
      .catch((e: unknown) => e);
    if (!isAiError(err)) throw new Error("esperava AiError");
    expect(err.code).toBe("provider_error");
    expect(err.transient).toBe(transient);
    expect(err.status).toBe(status);
    const shown = [err.message, String(err), JSON.stringify(err), err.stack ?? ""].join("|");
    expect(shown).not.toContain(KEY);
    expect(shown).not.toContain("secret-body-detail");
  });

  it("falha de rede vira provider_error transitório sem eco", async () => {
    const f: FetchLike = async () => {
      throw new TypeError(`fetch failed for Bearer ${KEY}`);
    };
    const err = await mk(f).complete(req, {}).catch((e: unknown) => e);
    if (!isAiError(err)) throw new Error("AiError esperado");
    expect([err.code, err.transient]).toEqual(["provider_error", true]);
    expect(`${err.message}${JSON.stringify(err)}`).not.toContain(KEY);
  });

  it("AbortSignal aborta a fetch e mapeia para aborted", async () => {
    const ac = new AbortController();
    const f: FetchLike = (_u, init) =>
      new Promise((_res, rej) => {
        init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("x"), { name: "AbortError" })));
      });
    const p = mk(f).complete(req, { signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toMatchObject({ code: "aborted" });
  });

  const strange: [string, unknown][] = [
    ["corpo não-JSON", "<html>oops</html>"],
    ["sem choices", { choices: [] }],
    ["content nulo", { choices: [{ message: { content: null } }] }],
    ["content que não é texto", { choices: [{ message: { content: { a: 1 } } }] }],
    ["erro dentro de 200", { error: { code: 500, message: `leak ${KEY}` } }],
    ["array", []],
  ];
  it.each(strange)("resposta estranha (%s) vira provider_error sanitizado", async (_n, body) => {
    const err = await mk(reply(200, body)).complete(req, {}).catch((e: unknown) => e);
    if (!isAiError(err)) throw new Error("AiError esperado");
    expect(err.code).toBe("provider_error");
    expect(`${err.message}${JSON.stringify(err)}`).not.toContain(KEY);
  });

  it("aceita content em partes de texto", async () => {
    const body = { choices: [{ message: { content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] } }] };
    expect((await mk(reply(200, body)).complete(req, {})).text).toBe("ab");
  });

  it("corpo gigante é recusado", async () => {
    const err = await mk(reply(200, "x".repeat(5_000_001))).complete(req, {}).catch((e: unknown) => e);
    expect(isAiError(err) && err.code).toBe("provider_error");
  });

  it("construtor exige chave e modelo (nenhuma rede)", () => {
    for (const cfg of [{ apiKey: "", model: "m" }, { apiKey: KEY, model: "  " }]) {
      try {
        new OpenRouterAdapter({ ...cfg, fetchImpl: reply(200, ok) });
        throw new Error("deveria falhar");
      } catch (e) {
        expect(isAiError(e) && e.code).toBe("ai_not_configured");
      }
    }
  });

  it("OcrProvider.extractText usa o modelo de visão com o arquivo e devolve o texto", async () => {
    const calls: Call[] = [];
    const body = { choices: [{ message: { content: "1 caderno" } }] };
    const out = await mk(reply(200, body, calls), "m-vis").extractText({ bytes: new Uint8Array([1, 2, 3]), mime: "image/jpeg" }, {});
    expect(out).toMatchObject({ text: "1 caderno", model: "m-vis" });
    expect(calls[0]!.init.body).toContain("data:image/jpeg;base64,AQID");
    expect(calls[0]!.init.body).not.toContain("response_format");
  });
});

describe("modelos e fábrica por ambiente", () => {
  it("loadModelsFromEnv só lê AI_MODEL_* e ignora vazios", () => {
    const models = loadModelsFromEnv({ AI_MODEL_CHEAP: " a ", AI_MODEL_STRONG: "b", AI_MODEL_VISION: "  ", OPENROUTER_KEY: KEY, OUTRA: "z" });
    expect(models).toEqual({ cheap: "a", strong: "b", vision: undefined });
  });

  it("fábrica: rota sem modelo/chave é erro claro; vision sem modelo = vision_model_missing", () => {
    const fetchImpl = reply(200, ok);
    const f = openRouterProviderFactory({ apiKey: KEY, models: { cheap: "a", strong: undefined, vision: undefined }, fetchImpl });
    expect(f("cheap").model).toBe("a");
    expect(() => f("strong")).toThrowError(expect.objectContaining({ code: "ai_not_configured" }));
    expect(() => f("vision")).toThrowError(expect.objectContaining({ code: "vision_model_missing" }));
    const g = openRouterProviderFactory({ apiKey: undefined, models: { cheap: "a" }, fetchImpl });
    expect(() => g("cheap")).toThrowError(expect.objectContaining({ code: "ai_not_configured" }));
  });
});
