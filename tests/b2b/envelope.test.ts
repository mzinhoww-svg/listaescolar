import { describe, expect, it } from "vitest";

import { B2B_API_ERROR_CODES } from "@/features/b2b/errors";
import { apiError, apiSuccess } from "@/features/b2b/api/envelope";

function deepStringify(value: unknown): string {
  return JSON.stringify(value);
}

describe("apiSuccess", () => {
  it("monta o envelope de sucesso com meta fixo", () => {
    const env = apiSuccess({ inep: "12345678" }, { environment: "live", requestId: "req-1" });
    expect(env).toEqual({ data: { inep: "12345678" }, meta: { api_version: "v1", environment: "live", request_id: "req-1" } });
  });

  it("inclui next_cursor só quando há próxima página", () => {
    const withCursor = apiSuccess([], { environment: "test", requestId: "r", nextCursor: "abc" });
    expect(withCursor.next_cursor).toBe("abc");
    const withoutCursor = apiSuccess([], { environment: "test", requestId: "r", nextCursor: null });
    expect(withoutCursor.next_cursor).toBeUndefined();
    expect(Object.hasOwn(withoutCursor, "next_cursor")).toBe(false);
  });
});

describe("apiError", () => {
  for (const code of B2B_API_ERROR_CODES) {
    it(`código ${code} tem mensagem fixa em português`, () => {
      const env = apiError(code, "req-1");
      expect(env.error.code).toBe(code);
      expect(env.error.request_id).toBe("req-1");
      expect(typeof env.error.message).toBe("string");
      expect(env.error.message.length).toBeGreaterThan(0);
    });
  }

  it("details só leva path e code, nunca o valor recebido", () => {
    const env = apiError("invalid_request", "req-2", [{ path: "query.limit", code: "too_big" }]);
    expect(env.error.details).toEqual([{ path: "query.limit", code: "too_big" }]);
    expect(deepStringify(env)).not.toMatch(/received|input|value/i);
  });

  it("sem details quando a lista é vazia ou ausente", () => {
    expect(apiError("not_found", "req-3").error.details).toBeUndefined();
    expect(apiError("not_found", "req-3", []).error.details).toBeUndefined();
  });

  it("nunca leva stack, hint, SQL ou nome de tabela", () => {
    const env = apiError("internal_error", "req-4");
    const json = deepStringify(env);
    expect(json).not.toMatch(/stack|hint|postgres|pg_|relation|column|syntax error/i);
  });

  it("mesma mensagem para o mesmo código, sempre (mensagens fixas, não geradas)", () => {
    expect(apiError("rate_limited", "a").error.message).toBe(apiError("rate_limited", "b").error.message);
  });
});
