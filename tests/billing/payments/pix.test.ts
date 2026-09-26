import { describe, expect, it, vi } from "vitest";

import { PixPaymentProvider } from "@/features/billing/payments/pix";
import { PixHttpError, type HttpClient, type HttpRequestInit } from "@/features/billing/payments/pix-http";
import type { PixConfig } from "@/features/billing/schemas";

const CONFIG: PixConfig = {
  apiBaseUrl: "https://pix.example.invalid",
  oauthTokenUrl: "https://pix.example.invalid/oauth/token",
  clientId: "client-id",
  clientSecret: "super-secret-value",
  certPem: "-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----",
  keyPem: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
  receiverKey: "chave-pix-fake",
  webhookToken: "0123456789abcdef",
  chargeTtlSeconds: 3600,
};

const PAYER = { cnpj: "00000000000000", name: "Papelaria Teste" };

function tokenResponse() {
  return { status: 200, body: JSON.stringify({ access_token: "tok-123", expires_in: 3600 }) };
}

function cobResponse(over: Record<string, unknown> = {}) {
  return {
    status: 200,
    body: JSON.stringify({
      txid: "a".repeat(32),
      status: "ATIVA",
      valor: { original: "10.00" },
      chave: CONFIG.receiverKey,
      pixCopiaECola: "00020126copiaecola",
      calendario: { criacao: "2026-06-10T12:00:00Z", expiracao: 3600 },
      ...over,
    }),
  };
}

/** O PSP de verdade ecoa o `txid` pedido; o fake precisa fazer o mesmo (o provider agora confere isso). */
function txidFromUrl(url: string): string {
  return url.split("/").pop()!;
}

function respond(url: string, over: Record<string, unknown> = {}) {
  return url === CONFIG.oauthTokenUrl ? tokenResponse() : cobResponse({ txid: txidFromUrl(url), ...over });
}

describe("PixPaymentProvider · createCharge", () => {
  it("faz OAuth2 com mTLS e PUT /v2/cob/{txid} com o corpo esperado (valor em reais, 2 casas, a partir de centavos)", async () => {
    const calls: { url: string; init: HttpRequestInit }[] = [];
    const http: HttpClient = vi.fn(async (url, init) => {
      calls.push({ url, init });
      return respond(url);
    });
    const provider = new PixPaymentProvider(CONFIG, http);
    const charge = await provider.createCharge({ invoiceId: "inv-1", amountCents: 12345, description: "Pacote", expiresInSeconds: 900, payer: PAYER });

    expect(charge.chargeId).toMatch(/^[a-zA-Z0-9]{26,35}$/);
    expect(charge.copyPaste).toBe("00020126copiaecola");

    expect(calls[0]!.url).toBe(CONFIG.oauthTokenUrl);
    expect(calls[0]!.init.cert).toBe(CONFIG.certPem);
    expect(calls[0]!.init.key).toBe(CONFIG.keyPem);
    expect(calls[0]!.init.headers?.authorization).toMatch(/^Basic /);

    const cobCall = calls[1]!;
    expect(cobCall.url).toMatch(/^https:\/\/pix\.example\.invalid\/v2\/cob\/[a-zA-Z0-9]{26,35}$/);
    expect(cobCall.init.method).toBe("PUT");
    expect(cobCall.init.headers?.authorization).toBe("Bearer tok-123");
    const body = JSON.parse(cobCall.init.body!);
    expect(body.valor.original).toBe("123.45"); // 12345 centavos
    expect(body.calendario.expiracao).toBe(CONFIG.chargeTtlSeconds); // vem do ambiente, não do chamador
    expect(body.chave).toBe(CONFIG.receiverKey);
    expect(body.devedor).toEqual({ cnpj: PAYER.cnpj, nome: PAYER.name });
  });

  it("reusa o token OAuth2 em chamadas seguintes (não pede de novo antes de expirar)", async () => {
    let tokenCalls = 0;
    const http: HttpClient = vi.fn(async (url) => {
      if (url === CONFIG.oauthTokenUrl) tokenCalls++;
      return respond(url);
    });
    const provider = new PixPaymentProvider(CONFIG, http, () => new Date("2026-06-10T12:00:00Z"));
    await provider.createCharge({ invoiceId: "inv-1", amountCents: 100, description: "x", expiresInSeconds: 60, payer: PAYER });
    await provider.getCharge("a".repeat(32));
    expect(tokenCalls).toBe(1);
  });

  it("txid gerado respeita o padrão [a-zA-Z0-9]{26,35}", async () => {
    const http: HttpClient = vi.fn(async (url) => respond(url));
    const provider = new PixPaymentProvider(CONFIG, http);
    const charge = await provider.createCharge({ invoiceId: "inv-1", amountCents: 100, description: "x", expiresInSeconds: 60, payer: PAYER });
    expect(charge.chargeId).toMatch(/^[a-zA-Z0-9]{26,35}$/);
  });

  it("4xx é permanente; 5xx é transitório", async () => {
    const http4xx: HttpClient = vi.fn(async (url) => (url === CONFIG.oauthTokenUrl ? tokenResponse() : { status: 400, body: "{}" }));
    const provider4xx = new PixPaymentProvider(CONFIG, http4xx);
    await expect(provider4xx.createCharge({ invoiceId: "i", amountCents: 100, description: "x", expiresInSeconds: 60, payer: PAYER })).rejects.toMatchObject({
      transient: false,
    });

    const http5xx: HttpClient = vi.fn(async (url) => (url === CONFIG.oauthTokenUrl ? tokenResponse() : { status: 500, body: "{}" }));
    const provider5xx = new PixPaymentProvider(CONFIG, http5xx);
    await expect(provider5xx.createCharge({ invoiceId: "i", amountCents: 100, description: "x", expiresInSeconds: 60, payer: PAYER })).rejects.toMatchObject({
      transient: true,
    });
  });

  it("resposta do PSP fora do formato esperado falha (Zod)", async () => {
    const http: HttpClient = vi.fn(async (url) => (url === CONFIG.oauthTokenUrl ? tokenResponse() : { status: 200, body: JSON.stringify({ txid: "curto" }) }));
    const provider = new PixPaymentProvider(CONFIG, http);
    await expect(provider.createCharge({ invoiceId: "i", amountCents: 100, description: "x", expiresInSeconds: 60, payer: PAYER })).rejects.toThrow();
  });

  it("nunca loga segredo, certificado ou BR Code", async () => {
    const spies = [vi.spyOn(console, "log").mockImplementation(() => {}), vi.spyOn(console, "error").mockImplementation(() => {}), vi.spyOn(console, "warn").mockImplementation(() => {})];
    const http: HttpClient = vi.fn(async (url) => respond(url));
    const provider = new PixPaymentProvider(CONFIG, http);
    await provider.createCharge({ invoiceId: "i", amountCents: 100, description: "x", expiresInSeconds: 60, payer: PAYER });
    for (const spy of spies) {
      for (const call of spy.mock.calls) {
        const text = JSON.stringify(call);
        expect(text).not.toContain(CONFIG.clientSecret);
        expect(text).not.toContain(CONFIG.certPem);
        expect(text).not.toContain(CONFIG.keyPem);
        expect(text).not.toContain("00020126copiaecola");
      }
      spy.mockRestore();
    }
  });
});

describe("PixPaymentProvider · getCharge", () => {
  const provider = () => {
    const http: HttpClient = vi.fn(async (url) => respond(url));
    return new PixPaymentProvider(CONFIG, http);
  };

  it("CONCLUIDA com valor -> paid", async () => {
    const http: HttpClient = vi.fn(async (url) => respond(url, { status: "CONCLUIDA", pix: [{ horario: "2026-06-10T13:00:00Z" }] }));
    const p = new PixPaymentProvider(CONFIG, http);
    const status = await p.getCharge("a".repeat(32));
    expect(status).toEqual({ status: "paid", paidAmountCents: 1000, paidAt: new Date("2026-06-10T13:00:00Z") });
  });

  it("ATIVA -> pending", async () => {
    await expect(provider().getCharge("a".repeat(32))).resolves.toEqual({ status: "pending", paidAmountCents: null, paidAt: null });
  });

  it("REMOVIDA_* -> expired", async () => {
    const http: HttpClient = vi.fn(async (url) => respond(url, { status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" }));
    const p = new PixPaymentProvider(CONFIG, http);
    await expect(p.getCharge("a".repeat(32))).resolves.toEqual({ status: "expired", paidAmountCents: null, paidAt: null });
  });

  it("revisão de segurança: resposta com txid DIFERENTE do pedido é recusada (nunca aceita cegamente)", async () => {
    const http: HttpClient = vi.fn(async (url) => (url === CONFIG.oauthTokenUrl ? tokenResponse() : cobResponse({ txid: "b".repeat(32) })));
    const p = new PixPaymentProvider(CONFIG, http);
    await expect(p.getCharge("a".repeat(32))).rejects.toThrow(/não bate com o txid/);
  });

  it("revisão de segurança: resposta com chave recebedora DIFERENTE da configurada é recusada", async () => {
    const http: HttpClient = vi.fn(async (url) => respond(url, { chave: "outra-chave-que-nao-e-a-nossa" }));
    const p = new PixPaymentProvider(CONFIG, http);
    await expect(p.getCharge("a".repeat(32))).rejects.toThrow(/não bate com a chave recebedora/);
  });

  it("resposta sem o campo chave (alguns PSPs não devolvem) ainda funciona — só confere quando presente", async () => {
    const http: HttpClient = vi.fn(async (url) => (url === CONFIG.oauthTokenUrl ? tokenResponse() : cobResponse({ txid: "a".repeat(32), chave: undefined })));
    const p = new PixPaymentProvider(CONFIG, http);
    await expect(p.getCharge("a".repeat(32))).resolves.toEqual({ status: "pending", paidAmountCents: null, paidAt: null });
  });

  it("revisão de segurança: usa pix[].valor (valor EFETIVAMENTE recebido) em vez de valor.original quando presente", async () => {
    const http: HttpClient = vi.fn(async (url) =>
      respond(url, { status: "CONCLUIDA", valor: { original: "10.00" }, pix: [{ horario: "2026-06-10T13:00:00Z", valor: "9.50" }] }),
    );
    const p = new PixPaymentProvider(CONFIG, http);
    const status = await p.getCharge("a".repeat(32));
    expect(status.paidAmountCents).toBe(950); // não 1000: o valor recebido (troco/saque) prevalece sobre o nominal
  });
});

describe("PixHttpError", () => {
  it("expõe transient e status", () => {
    const e = new PixHttpError("falhou", true, 503);
    expect(e.transient).toBe(true);
    expect(e.status).toBe(503);
  });
});
