import { describe, expect, it } from "vitest";

import { redactBreadcrumb, redactEvent } from "@/lib/observability/sentry-redact";

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

  describe("URLs sem query string nem fragmento (revisão S19, I4)", () => {
    it("request.url e contexts.nextjs.request_path perdem ?query e #fragmento", () => {
      const out = redactEvent({
        request: { url: "https://listacerta.example/auth/confirm?token_hash=SEGREDO&type=magiclink#frag" },
        contexts: { nextjs: { request_path: "/auth/confirm?token_hash=SEGREDO", route_type: "page" } },
      });
      expect(out.request?.url).toBe("https://listacerta.example/auth/confirm");
      const ctx = out.contexts?.nextjs as Record<string, unknown>;
      expect(ctx.request_path).toBe("/auth/confirm");
      expect(ctx.route_type).toBe("page");
      expect(JSON.stringify(out)).not.toContain("SEGREDO");
    });

    it("breadcrumbs (fetch/navegação) e spans de transação perdem a query das URLs", () => {
      const out = redactEvent({
        breadcrumbs: [
          { category: "fetch", data: { url: "https://x.supabase.co/rest/v1/a?token=SEGREDO", status_code: 200 } },
          { category: "navigation", data: { from: "/entrar?next=%2Fx&t=SEGREDO", to: "/painel#SEGREDO" } },
        ],
        transaction: "GET /auth/confirm?token_hash=SEGREDO",
        spans: [
          { span_id: "a", trace_id: "b", start_timestamp: 1, status: "ok", description: "GET https://x.supabase.co/rest/v1/a?apikey=SEGREDO", data: { "http.url": "https://x.supabase.co/rest/v1/a?apikey=SEGREDO", "http.query": "apikey=SEGREDO" } },
        ],
      });
      expect(JSON.stringify(out)).not.toContain("SEGREDO");
      expect((out.breadcrumbs?.[0]?.data as Record<string, unknown>).url).toBe("https://x.supabase.co/rest/v1/a");
      expect((out.breadcrumbs?.[0]?.data as Record<string, unknown>).status_code).toBe(200);
      expect((out.breadcrumbs?.[1]?.data as Record<string, unknown>).to).toBe("/painel");
    });

    it("redactBreadcrumb (beforeBreadcrumb) também limpa a URL", () => {
      const b = redactBreadcrumb({ category: "xhr", data: { url: "https://a.b/c?d=SEGREDO" } });
      expect((b.data as Record<string, unknown>).url).toBe("https://a.b/c");
    });

    it("texto livre com URL na mensagem perde a query mas mantém o resto", () => {
      const out = redactEvent({ message: "falhou ao chamar https://a.b/c?token=SEGREDO agora e/ou depois" });
      expect(out.message).toBe("falhou ao chamar https://a.b/c agora e/ou depois");
    });
  });

  describe("CPF e CNPJ (revisão S19, M5)", () => {
    it.each(["123.456.789-09", "12345678909", "12.345.678/0001-95", "12345678000195"])("mascara %s em texto, extra e breadcrumbs", (doc) => {
      const out = redactEvent({
        message: `documento ${doc} inválido`,
        extra: { d: `cliente ${doc}` },
        breadcrumbs: [{ message: `busca ${doc}` }],
      });
      const all = JSON.stringify(out);
      expect(all).not.toContain(doc);
      expect(all).not.toContain(doc.replace(/\D/g, ""));
    });
    it("não mascara números curtos legítimos (ano, contagem, código LC-)", () => {
      const out = redactEvent({ message: "ano 2027, 4 tarefas, lead LC-5TJ1" });
      expect(out.message).toBe("ano 2027, 4 tarefas, lead LC-5TJ1");
    });
  });
});
