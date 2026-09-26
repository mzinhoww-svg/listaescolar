import { beforeEach, describe, expect, it, vi } from "vitest";

const reconcileInvoiceByChargeId = vi.fn();
const reconcileOpenInvoices = vi.fn();
vi.mock("@/features/billing/wiring", () => ({ getBillingService: () => ({ reconcileInvoiceByChargeId, reconcileOpenInvoices }) }));

import { POST as webhookPOST } from "@/app/api/billing/pix/webhook/[...path]/route";
import { GET as cronGET } from "@/app/api/cron/billing-reconcile/route";

const TOKEN = "0123456789abcdef";

function webhookReq(body: unknown, path: string[] = [TOKEN]): { req: Request; params: Promise<{ path: string[] }> } {
  return {
    req: new Request("https://x.example/api/billing/pix/webhook/x", { method: "POST", body: JSON.stringify(body) }),
    params: Promise.resolve({ path }),
  };
}

beforeEach(() => {
  reconcileInvoiceByChargeId.mockReset();
  reconcileOpenInvoices.mockReset();
  delete process.env.PAYMENTS_PIX_ENABLED;
  delete process.env.PIX_WEBHOOK_TOKEN;
  delete process.env.CRON_SECRET;
});

describe("POST /api/billing/pix/webhook/[token]", () => {
  it("flag desligada: 404, nada é chamado", async () => {
    const { req, params } = webhookReq({ txid: "a".repeat(30) });
    const res = await webhookPOST(req as never, { params });
    expect(res.status).toBe(404);
    expect(reconcileInvoiceByChargeId).not.toHaveBeenCalled();
  });

  it("flag ligada sem PIX_WEBHOOK_TOKEN: 503", async () => {
    process.env.PAYMENTS_PIX_ENABLED = "1";
    const { req, params } = webhookReq({ txid: "a".repeat(30) });
    const res = await webhookPOST(req as never, { params });
    expect(res.status).toBe(503);
    expect(reconcileInvoiceByChargeId).not.toHaveBeenCalled();
  });

  it("token do path errado: 401 sem eco", async () => {
    process.env.PAYMENTS_PIX_ENABLED = "1";
    process.env.PIX_WEBHOOK_TOKEN = TOKEN;
    const req = new Request("https://x.example/api/billing/pix/webhook/x", { method: "POST", body: JSON.stringify({ txid: "a".repeat(30) }) });
    const res = await webhookPOST(req as never, { params: Promise.resolve({ path: ["errado-errado-errado"] }) });
    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body).not.toContain(TOKEN);
    expect(reconcileInvoiceByChargeId).not.toHaveBeenCalled();
  });

  it("token certo: reconsulta cada txid do corpo (nunca confia no valor do corpo, só reconsulta)", async () => {
    process.env.PAYMENTS_PIX_ENABLED = "1";
    process.env.PIX_WEBHOOK_TOKEN = TOKEN;
    reconcileInvoiceByChargeId.mockResolvedValue({ invoiceId: "inv-1", confirmed: true });
    const { req, params } = webhookReq({ pix: [{ txid: "a".repeat(30) }, { txid: "b".repeat(30) }] });
    const res = await webhookPOST(req as never, { params });
    expect(res.status).toBe(200);
    expect(reconcileInvoiceByChargeId).toHaveBeenCalledTimes(2);
    expect(reconcileInvoiceByChargeId).toHaveBeenCalledWith("a".repeat(30));
    expect(reconcileInvoiceByChargeId).toHaveBeenCalledWith("b".repeat(30));
  });

  it("revisão de segurança: aceita o sufixo /pix que o BACEN acrescenta à URL cadastrada", async () => {
    process.env.PAYMENTS_PIX_ENABLED = "1";
    process.env.PIX_WEBHOOK_TOKEN = TOKEN;
    reconcileInvoiceByChargeId.mockResolvedValue({ invoiceId: "inv-1", confirmed: true });
    const { req, params } = webhookReq({ txid: "a".repeat(30) }, [TOKEN, "pix"]);
    const res = await webhookPOST(req as never, { params });
    expect(res.status).toBe(200);
    expect(reconcileInvoiceByChargeId).toHaveBeenCalledWith("a".repeat(30));
  });

  it("corpo malformado: ainda responde 200 (idempotente), sem chamar nada", async () => {
    process.env.PAYMENTS_PIX_ENABLED = "1";
    process.env.PIX_WEBHOOK_TOKEN = TOKEN;
    const req = new Request("https://x.example/api/billing/pix/webhook/x", { method: "POST", body: "não é json" });
    const res = await webhookPOST(req as never, { params: Promise.resolve({ path: [TOKEN] }) });
    expect(res.status).toBe(200);
    expect(reconcileInvoiceByChargeId).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/billing-reconcile", () => {
  const req = (auth?: string) => new Request("https://x.example/api/cron/billing-reconcile", { headers: auth === undefined ? {} : { authorization: auth } });

  it("sem CRON_SECRET: 503", async () => {
    const res = await cronGET(req(`Bearer ${TOKEN}long-enough-secret`));
    expect(res.status).toBe(503);
    expect(reconcileOpenInvoices).not.toHaveBeenCalled();
  });

  it("segredo errado: 401", async () => {
    process.env.CRON_SECRET = "segredo-de-cron-com-mais-de-16-caracteres";
    const res = await cronGET(req("Bearer errado"));
    expect(res.status).toBe(401);
    expect(reconcileOpenInvoices).not.toHaveBeenCalled();
  });

  it("segredo certo: reconcilia e devolve a contagem", async () => {
    process.env.CRON_SECRET = "segredo-de-cron-com-mais-de-16-caracteres";
    reconcileOpenInvoices.mockResolvedValue({ checked: 2, confirmed: 1 });
    const res = await cronGET(req(`Bearer segredo-de-cron-com-mais-de-16-caracteres`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checked: 2, confirmed: 1 });
  });
});
