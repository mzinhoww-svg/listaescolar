import { describe, expect, it } from "vitest";

import { redactEvent } from "@/lib/observability/sentry-redact";

describe("redactEvent", () => {
  it("remove e-mail, telefone e IP de message e da mensagem da exceção", () => {
    const out = redactEvent({
      message: "falha para maria@example.com no ip 200.10.20.30",
      exception: { values: [{ type: "Error", value: "contato: (65) 99999-8888, e-mail joao@x.com.br" }] },
    });
    expect(out.message).not.toMatch(/maria@example\.com/);
    expect(out.message).not.toMatch(/200\.10\.20\.30/);
    expect(out.message).toContain("[e-mail]");
    expect(out.message).toContain("[ip]");
    expect(out.exception?.values?.[0]?.value).not.toMatch(/99999-8888/);
    expect(out.exception?.values?.[0]?.value).not.toMatch(/joao@x\.com\.br/);
  });

  it("remove e-mail/telefone de extra e de breadcrumbs, preservando outros campos", () => {
    const out = redactEvent({
      extra: { detalhe: "telefone 65999998888 do responsável", contagem: 3 },
      breadcrumbs: [{ message: "enviado para ana@escola.com", data: { tel: "65 3222-1111", ok: true } }],
    });
    expect(out.extra?.detalhe).not.toMatch(/65999998888/);
    expect(out.extra?.contagem).toBe(3);
    expect(out.breadcrumbs?.[0]?.message).not.toMatch(/ana@escola\.com/);
    expect((out.breadcrumbs?.[0]?.data as Record<string, unknown>).tel).not.toMatch(/3222-1111/);
    expect((out.breadcrumbs?.[0]?.data as Record<string, unknown>).ok).toBe(true);
  });

  it("remove por completo dados/cookies/headers/query string da requisição", () => {
    const out = redactEvent({
      request: {
        url: "https://listacerta.example/x",
        data: { email: "a@b.com" },
        query_string: "token=abc",
        cookies: { session: "s" },
        headers: { cookie: "session=s" },
      },
    });
    expect(out.request?.url).toBe("https://listacerta.example/x");
    expect(out.request).not.toHaveProperty("data");
    expect(out.request).not.toHaveProperty("query_string");
    expect(out.request).not.toHaveProperty("cookies");
    expect(out.request).not.toHaveProperty("headers");
  });

  it("nunca lança mesmo com evento vazio", () => {
    expect(() => redactEvent({})).not.toThrow();
  });

  it("zera qualquer `user` (defesa em profundidade; nunca usamos setUser)", () => {
    const out = redactEvent({ user: { id: "u1", email: "a@b.com" } });
    expect(out.user).toEqual({});
  });
});
