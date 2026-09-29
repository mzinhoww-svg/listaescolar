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

describe("reverificação S19 (N2/N5): segredo no caminho e demais campos do evento", () => {
  const TOKEN = "s3gr3d0-do-webhook-pix-0123456789";

  it("N2: token do webhook Pix some de transaction, request.url, contexts, spans e migalhas", async () => {
    const path = `/api/billing/pix/webhook/${TOKEN}/pix`;
    const { redactEvent: redact, redactSpan } = await import("@/lib/observability/sentry-redact");
    const out = redact({
      transaction: `POST ${path}`,
      request: { url: `https://listacerta.example${path}` },
      contexts: { nextjs: { request_path: path } as Record<string, unknown> },
      spans: [{ data: { "url.path": path, "http.target": path, "url.full": `https://listacerta.example${path}` } }] as never,
      breadcrumbs: [{ message: `POST ${path}`, data: { url: path } }],
    });
    expect(JSON.stringify(out)).not.toContain(TOKEN);
    expect(out.transaction).toBe("POST /api/billing/pix/webhook/[token]/pix");
    expect(out.request?.url).toBe("https://listacerta.example/api/billing/pix/webhook/[token]/pix");
    const span = redactSpan({ name: `POST ${path}`, attributes: { "url.full": `https://x.example${path}?a=1` } });
    expect(JSON.stringify(span)).not.toContain(TOKEN);
  });

  it("N2: códigos de cotação/lead no caminho também são mascarados", () => {
    const out = redactEvent({ transaction: "GET /cotacao/ABC123XYZ", message: "GET /papelaria/leads/QWE987 falhou" });
    expect(out.transaction).toBe("GET /cotacao/[token]");
    expect(out.message).toBe("GET /papelaria/leads/[token] falhou");
    expect(redactEvent({ transaction: "GET /papelaria/leads" }).transaction).toBe("GET /papelaria/leads");
  });

  it("N5: tags, fingerprint, logentry e variáveis de stacktrace são redigidos", () => {
    const out = redactEvent({
      tags: { contato: "ana@escola.com", n: 3 },
      fingerprint: ["falha", "joao@x.com"],
      logentry: { message: "erro %s", params: ["maria@example.com"] },
      exception: {
        values: [{ type: "Error", value: "x", stacktrace: { frames: [{ vars: { email: "zé@abc.com", ip: "200.1.2.3" } }] } }],
      },
    });
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/ana@escola|joao@x|maria@example|zé@abc|200\.1\.2\.3/);
    expect(out.tags?.n).toBe(3);
  });

  it("N5: caminho relativo sem barra inicial perde a query, mas frase com '?' fica intacta", () => {
    expect(redactEvent({ message: "falhou em auth/confirm?token_hash=SEGREDO&type=x" }).message).toBe("falhou em auth/confirm");
    expect(redactEvent({ message: "funcionou mesmo assim?" }).message).toBe("funcionou mesmo assim?");
  });

  it("N5: redactSpan limpa name e attributes (url.path, query, e-mail)", async () => {
    const { redactSpan } = await import("@/lib/observability/sentry-redact");
    const span = redactSpan({
      name: "GET /x?email=a@b.com",
      attributes: { "url.query": "token=abc", "http.target": "/auth/confirm?token_hash=Z", nota: "fale com a@b.com" },
    });
    expect(span.name).toBe("GET /x");
    expect(span.attributes?.["url.query"]).toBe("[removido]");
    expect(JSON.stringify(span)).not.toMatch(/token_hash|a@b\.com/);
  });
});
