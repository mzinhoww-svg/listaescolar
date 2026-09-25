import { describe, expect, it } from "vitest";
import { AI_ERROR_CODES, AiError, isAiError, redactSecrets } from "@/supabase/functions/_shared/ai/errors.ts";
import { FakeProvider } from "@/supabase/functions/_shared/ai/fake.ts";
import { FakeClock, flush } from "./helpers.ts";

const req = { messages: [{ role: "user" as const, content: "x" }], responseFormat: "json" as const };

describe("FakeProvider", () => {
  it("responde em sequência (json e texto) e registra as chamadas", async () => {
    const f = new FakeProvider([{ json: { a: 1 } }, { text: "cru" }], { model: "m" });
    expect((await f.complete(req, {})).text).toBe('{"a":1}');
    const r = await f.complete(req, {});
    expect(r).toMatchObject({ text: "cru", model: "m" });
    expect(f.calls).toHaveLength(2);
  });
  it("script como função e fim do script é erro permanente", async () => {
    const f = new FakeProvider((n) => ({ text: `#${n}` }));
    expect((await f.complete(req, {})).text).toBe("#0");
    const g = new FakeProvider([]);
    const err = await g.complete(req, {}).catch((e: unknown) => e);
    expect(isAiError(err) && [err.code, err.transient]).toEqual(["provider_error", false]);
  });
  it("falha scriptada vira AiError", async () => {
    const f = new FakeProvider([{ fail: { code: "provider_error", transient: true, status: 429 } }]);
    await expect(f.complete(req, {})).rejects.toMatchObject({ code: "provider_error", transient: true, status: 429 });
  });
  it("atraso usa o relógio injetado e hang termina no abort", async () => {
    const clock = new FakeClock();
    const f = new FakeProvider([{ delayMs: 500, text: "ok" }, { hang: true }], { clock });
    const p = f.complete(req, {});
    await flush();
    clock.advance(500);
    expect((await p).text).toBe("ok");
    const ac = new AbortController();
    const q = f.complete(req, { signal: ac.signal });
    await flush();
    ac.abort();
    await expect(q).rejects.toMatchObject({ code: "aborted" });
    expect(f.calls[1]?.aborted()).toBe(true);
  });
  it("extractText devolve o texto do script", async () => {
    const f = new FakeProvider([{ text: "lista" }], { model: "m" });
    expect(await f.extractText({ bytes: new Uint8Array(1), mime: "image/png" }, {})).toMatchObject({ text: "lista", model: "m" });
  });
});

describe("AiError e sanitização", () => {
  it("todos os códigos existem e têm mensagem fixa", () => {
    expect([...AI_ERROR_CODES].sort()).toEqual(
      ["ai_not_configured", "aborted", "invalid_output", "low_confidence", "provider_error", "provider_timeout", "vision_model_missing"].sort(),
    );
    for (const c of AI_ERROR_CODES) expect(new AiError(c).message.length).toBeGreaterThan(3);
  });
  it("transitoriedade padrão por código, com override", () => {
    const t = (c: (typeof AI_ERROR_CODES)[number]) => new AiError(c).transient;
    expect([t("provider_timeout"), t("invalid_output"), t("low_confidence")]).toEqual([true, true, true]);
    expect([t("ai_not_configured"), t("vision_model_missing"), t("aborted"), t("provider_error")]).toEqual([false, false, false, false]);
    expect(new AiError("provider_error", { transient: true }).transient).toBe(true);
  });
  it("detail só aceita código curto; texto livre é descartado", () => {
    expect(new AiError("provider_error", { detail: "http_503" }).message).toContain("http_503");
    const bad = new AiError("provider_error", { detail: "Bearer abc SECRET texto livre com espaços e \n" });
    expect(bad.message).not.toContain("SECRET");
  });
  it("redactSecrets remove segredos, inclusive repetidos", () => {
    expect(redactSecrets("a SEGREDO b SEGREDO", ["SEGREDO", ""])).toBe("a [redacted] b [redacted]");
  });
});
