import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

const lookupMock = vi.fn();
vi.mock("node:dns/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:dns/promises")>();
  const lookup = (...a: unknown[]) => lookupMock(...a);
  return { ...actual, lookup, default: { ...actual, lookup } };
});

const { validateWebhookUrl, resolvePublicAddress, postWebhookSafely } = await import("@/lib/net/safe-fetch");

describe("validateWebhookUrl", () => {
  it("aceita https qualquer host", () => {
    const r = validateWebhookUrl("https://parceiro.example.com/webhook", undefined);
    expect(r).toMatchObject({ ok: true, protocol: "https:", hostname: "parceiro.example.com" });
  });

  it("recusa http fora da exceção de loopback local", () => {
    expect(validateWebhookUrl("http://parceiro.example.com/webhook", undefined)).toEqual({ ok: false, reason: "scheme_not_allowed" });
    expect(validateWebhookUrl("http://parceiro.example.com/webhook", "local")).toEqual({ ok: false, reason: "scheme_not_allowed" });
  });

  it("aceita http://127.0.0.1 SÓ com appEnv local (E2E)", () => {
    expect(validateWebhookUrl("http://127.0.0.1:4000/hook", "local")).toMatchObject({ ok: true, hostname: "127.0.0.1" });
    expect(validateWebhookUrl("http://127.0.0.1:4000/hook", "production")).toEqual({ ok: false, reason: "scheme_not_allowed" });
    expect(validateWebhookUrl("http://127.0.0.1:4000/hook", undefined)).toEqual({ ok: false, reason: "scheme_not_allowed" });
  });

  it("recusa IP literal no host (mesmo https)", () => {
    expect(validateWebhookUrl("https://93.184.216.34/hook", undefined)).toEqual({ ok: false, reason: "literal_ip_not_allowed" });
    expect(validateWebhookUrl("https://[2001:db8::1]/hook", undefined)).toEqual({ ok: false, reason: "literal_ip_not_allowed" });
  });

  it("recusa credenciais na URL e URL malformada", () => {
    expect(validateWebhookUrl("https://user:pass@parceiro.example.com/hook", undefined)).toEqual({ ok: false, reason: "invalid_url" });
    expect(validateWebhookUrl("not a url", undefined)).toEqual({ ok: false, reason: "invalid_url" });
  });
});

describe("resolvePublicAddress (DNS mockado: sem rede de verdade)", () => {
  afterEach(() => lookupMock.mockReset());

  it("recusa quando TODOS os endereços resolvidos são privados/loopback/metadata", async () => {
    lookupMock.mockResolvedValue([
      { address: "10.0.0.5", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ]);
    expect(await resolvePublicAddress("interno.example.com")).toEqual({ ok: false, reason: "no_public_address" });
  });

  it("aceita e usa o primeiro endereço público quando a lista mistura privado e público", async () => {
    lookupMock.mockResolvedValue([
      { address: "10.0.0.5", family: 4 },
      { address: "203.0.113.9", family: 4 }, // TEST-NET, propositalmente também bloqueado
      { address: "93.184.216.34", family: 4 },
    ]);
    expect(await resolvePublicAddress("misto.example.com")).toEqual({ ok: true, address: "93.184.216.34", family: 4 });
  });

  it("erro de DNS vira falha, nunca lança", async () => {
    lookupMock.mockRejectedValue(new Error("ENOTFOUND"));
    expect(await resolvePublicAddress("inexistente.invalid")).toEqual({ ok: false, reason: "dns_error" });
  });

  it("loopback local não usa DNS (não chama lookup)", async () => {
    expect(await resolvePublicAddress("127.0.0.1")).toEqual({ ok: true, address: "127.0.0.1", family: 4 });
    expect(await resolvePublicAddress("localhost")).toEqual({ ok: true, address: "127.0.0.1", family: 4 });
    expect(lookupMock).not.toHaveBeenCalled();
  });
});

describe("postWebhookSafely: recusa antes de qualquer rede", () => {
  it("URL inválida/IP literal/esquema errado nunca chega a resolver DNS nem a conectar", async () => {
    const r1 = await postWebhookSafely("http://parceiro.example.com/hook", { headers: {}, body: "{}" });
    expect(r1).toEqual({ kind: "permanent", code: "invalid_url_scheme_not_allowed" });
    expect(lookupMock).not.toHaveBeenCalled();

    const r2 = await postWebhookSafely("https://93.184.216.34/hook", { headers: {}, body: "{}" });
    expect(r2).toEqual({ kind: "permanent", code: "invalid_url_literal_ip_not_allowed" });
  });

  it("DNS só resolve para IP privado: permanente, sem tentar conectar", async () => {
    lookupMock.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const r = await postWebhookSafely("https://interno.example.com/hook", { headers: {}, body: "{}" });
    expect(r).toEqual({ kind: "permanent", code: "no_public_address" });
  });
});

describe("postWebhookSafely: caminho feliz e classificação (servidor local, appEnv=local)", () => {
  async function withServer(handler: http.RequestListener, fn: (port: number) => Promise<void>): Promise<void> {
    const server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      await fn((server.address() as AddressInfo).port);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  it("2xx: sent, com o corpo e cabeçalhos assinados chegando intactos", async () => {
    let received: { body: string; signature: string | undefined; host: string | undefined } | null = null;
    await withServer(
      (req, res) => {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          received = { body, signature: req.headers["x-listacerta-signature"] as string | undefined, host: req.headers.host };
          res.writeHead(200);
          res.end("ok");
        });
      },
      async (port) => {
        const out = await postWebhookSafely(`http://127.0.0.1:${port}/hook`, {
          headers: { "content-type": "application/json", "x-listacerta-signature": "t=1,v1=abc" },
          body: '{"event":"list.published"}',
          appEnv: "local",
        });
        expect(out).toEqual({ kind: "sent", status: 200 });
      },
    );
    expect(received).toEqual({ body: '{"event":"list.published"}', signature: "t=1,v1=abc", host: expect.stringContaining("127.0.0.1") });
  });

  it("429 e 5xx: transient", async () => {
    await withServer(
      (_req, res) => res.writeHead(503).end(),
      async (port) => {
        const out = await postWebhookSafely(`http://127.0.0.1:${port}/hook`, { headers: {}, body: "{}", appEnv: "local" });
        expect(out).toEqual({ kind: "transient", code: "upstream_5xx", status: 503 });
      },
    );
    await withServer(
      (_req, res) => res.writeHead(429).end(),
      async (port) => {
        const out = await postWebhookSafely(`http://127.0.0.1:${port}/hook`, { headers: {}, body: "{}", appEnv: "local" });
        expect(out).toEqual({ kind: "transient", code: "rate_limited", status: 429 });
      },
    );
  });

  it("4xx (exceto 429): permanent", async () => {
    await withServer(
      (_req, res) => res.writeHead(400).end(),
      async (port) => {
        const out = await postWebhookSafely(`http://127.0.0.1:${port}/hook`, { headers: {}, body: "{}", appEnv: "local" });
        expect(out).toEqual({ kind: "permanent", code: "upstream_4xx", status: 400 });
      },
    );
  });

  it("redirecionamento NUNCA é seguido: permanent", async () => {
    await withServer(
      (_req, res) => {
        res.writeHead(302, { location: "http://outro-host.invalid/" });
        res.end();
      },
      async (port) => {
        const out = await postWebhookSafely(`http://127.0.0.1:${port}/hook`, { headers: {}, body: "{}", appEnv: "local" });
        expect(out).toEqual({ kind: "permanent", code: "redirect_blocked", status: 302 });
      },
    );
  });

  it("timeout: transient, nunca lança", async () => {
    await withServer(
      (_req, res) => {
        setTimeout(() => res.writeHead(200).end("tarde"), 500);
      },
      async (port) => {
        const out = await postWebhookSafely(`http://127.0.0.1:${port}/hook`, { headers: {}, body: "{}", appEnv: "local", timeoutMs: 50 });
        expect(out).toEqual({ kind: "transient", code: "timeout" });
      },
    );
  });

  it("resposta gigante é cortada (nunca acumulada) e ainda classifica pelo status", async () => {
    await withServer(
      (_req, res) => {
        res.writeHead(200);
        const chunk = "x".repeat(4096);
        for (let i = 0; i < 20; i++) res.write(chunk);
        res.end();
      },
      async (port) => {
        const out = await postWebhookSafely(`http://127.0.0.1:${port}/hook`, { headers: {}, body: "{}", appEnv: "local", maxResponseBytes: 1024 });
        expect(out).toEqual({ kind: "sent", status: 200 });
      },
    );
  });

  it("conexão recusada (porta fechada): transient", async () => {
    const out = await postWebhookSafely("http://127.0.0.1:1/hook", { headers: {}, body: "{}", appEnv: "local" });
    expect(out.kind).toBe("transient");
  });
});
