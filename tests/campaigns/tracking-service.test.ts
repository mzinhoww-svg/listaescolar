import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deriveDedupeKey, issueImpressionToken, TrackingService, verifyImpressionToken, type TrackingRepo } from "@/features/campaigns/tracking-service";
import { __resetRateLimitForTests } from "@/lib/rate-limit/memory-bucket";

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres-0001";

describe("deriveDedupeKey / issueImpressionToken / verifyImpressionToken", () => {
  beforeEach(() => {
    __resetRateLimitForTests();
    process.env.B2B_CAMPAIGN_TRACKING_SECRET = SECRET;
  });

  it("mesmos insumos -> mesma chave (determinístico); qualquer insumo diferente muda a chave (IP, UA, lista, campanha ou dia)", () => {
    const base = { ip: "203.0.113.10", userAgent: "agente-teste", listVersionId: "l1", campaignId: "c1", day: "2026-09-27" };
    const k1 = deriveDedupeKey(base);
    expect(deriveDedupeKey(base)).toBe(k1);
    expect(deriveDedupeKey({ ...base, ip: "203.0.114.10" })).not.toBe(k1); // muda o 3º octeto, não só o truncado
    expect(deriveDedupeKey({ ...base, userAgent: "outro" })).not.toBe(k1);
    expect(deriveDedupeKey({ ...base, listVersionId: "l2" })).not.toBe(k1);
    expect(deriveDedupeKey({ ...base, campaignId: "c2" })).not.toBe(k1);
    expect(deriveDedupeKey({ ...base, day: "2026-09-28" })).not.toBe(k1);
  });

  it("IP truncado: só o último octeto (IPv4) não muda a chave (privacidade), o resto do endereço continua distinguindo", () => {
    const base = { ip: "203.0.113.10", userAgent: "agente-teste", listVersionId: "l1", campaignId: "c1", day: "2026-09-27" };
    expect(deriveDedupeKey(base)).toBe(deriveDedupeKey({ ...base, ip: "203.0.113.250" }));
  });

  it("token não é igual à própria dedupe_key nem previsível sem o segredo do servidor", () => {
    const dedupeKey = deriveDedupeKey({ ip: "203.0.113.10", userAgent: "a", listVersionId: "l1", campaignId: "c1", day: "2026-09-27" });
    const token = issueImpressionToken(dedupeKey, "c1");
    expect(token).not.toBe(dedupeKey);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifyImpressionToken aceita só o token certo para aquela (dedupeKey, campaignId); recusa token de outra campanha, de outra chave, ou adulterado", () => {
    const dedupeKey = deriveDedupeKey({ ip: "203.0.113.10", userAgent: "a", listVersionId: "l1", campaignId: "c1", day: "2026-09-27" });
    const token = issueImpressionToken(dedupeKey, "c1");
    expect(verifyImpressionToken(token, dedupeKey, "c1")).toBe(true);
    expect(verifyImpressionToken(token, dedupeKey, "c2")).toBe(false); // outra campanha
    expect(verifyImpressionToken(token, "00112233445566778899aabbccddeeff", "c1")).toBe(false); // outra dedupeKey
    const tampered = token.slice(0, -2) + (token.endsWith("00") ? "ff" : "00");
    expect(verifyImpressionToken(tampered, dedupeKey, "c1")).toBe(false); // 1 byte adulterado
  });

  it("sem B2B_CAMPAIGN_TRACKING_SECRET configurado (ou curto demais): lança, nunca deriva com um segredo fraco/ausente", () => {
    const prev = process.env.B2B_CAMPAIGN_TRACKING_SECRET;
    delete process.env.B2B_CAMPAIGN_TRACKING_SECRET;
    try {
      expect(() => deriveDedupeKey({ ip: "203.0.113.10", userAgent: "a", listVersionId: "l1", campaignId: "c1", day: "2026-09-27" })).toThrow();
      process.env.B2B_CAMPAIGN_TRACKING_SECRET = "curto-demais";
      expect(() => deriveDedupeKey({ ip: "203.0.113.10", userAgent: "a", listVersionId: "l1", campaignId: "c1", day: "2026-09-27" })).toThrow();
    } finally {
      if (prev === undefined) delete process.env.B2B_CAMPAIGN_TRACKING_SECRET;
      else process.env.B2B_CAMPAIGN_TRACKING_SECRET = prev;
    }
  });
});

describe("TrackingService", () => {
  beforeEach(() => {
    __resetRateLimitForTests();
    process.env.B2B_CAMPAIGN_TRACKING_SECRET = SECRET;
  });
  afterEach(() => {
    __resetRateLimitForTests();
  });

  function makeRepo(): TrackingRepo & { recordCampaignEvent: ReturnType<typeof vi.fn<TrackingRepo["recordCampaignEvent"]>> } {
    return { recordCampaignEvent: vi.fn<TrackingRepo["recordCampaignEvent"]>(async () => true) };
  }

  it("recordImpression: grava e devolve um token assinado quando o repositório aceita o evento", async () => {
    const repo = makeRepo();
    const svc = new TrackingService(repo, () => new Date("2026-09-27T12:00:00Z"));
    const r = await svc.recordImpression({ ip: "203.0.113.10", userAgent: "a", listVersionId: "l1", campaignId: "c1" });
    expect(r.recorded).toBe(true);
    expect(r.token).toMatch(/^[0-9a-f]{64}$/);
    expect(repo.recordCampaignEvent).toHaveBeenCalledWith("c1", "l1", "impression", expect.stringMatching(/^[0-9a-f]{64}$/));
  });

  it("recordClick: sem token válido (nunca houve impressão), NUNCA chama o repositório — recusa antes de gastar uma chamada de banco", async () => {
    const repo = makeRepo();
    const svc = new TrackingService(repo, () => new Date("2026-09-27T12:00:00Z"));
    const r = await svc.recordClick({ ip: "203.0.113.10", userAgent: "a", listVersionId: "l1", campaignId: "c1", impressionToken: "00".repeat(32) });
    expect(r.recorded).toBe(false);
    expect(repo.recordCampaignEvent).not.toHaveBeenCalled();
  });

  it("recordClick: com o token de uma impressão real (mesmo IP/UA/lista/campanha/dia), chama o repositório com a MESMA dedupe_key", async () => {
    const repo = makeRepo();
    const svc = new TrackingService(repo, () => new Date("2026-09-27T12:00:00Z"));
    const impression = await svc.recordImpression({ ip: "203.0.113.10", userAgent: "a", listVersionId: "l1", campaignId: "c1" });
    const r = await svc.recordClick({ ip: "203.0.113.10", userAgent: "a", listVersionId: "l1", campaignId: "c1", impressionToken: impression.token! });
    expect(r.recorded).toBe(true);
    const impressionKey = repo.recordCampaignEvent.mock.calls[0]![3];
    const clickKey = repo.recordCampaignEvent.mock.calls[1]![3];
    expect(clickKey).toBe(impressionKey);
  });

  it("recordClick: token de impressão de OUTRO contexto (IP bem diferente) não vale — a dedupe_key derivada muda", async () => {
    const repo = makeRepo();
    const svc = new TrackingService(repo, () => new Date("2026-09-27T12:00:00Z"));
    const impression = await svc.recordImpression({ ip: "203.0.113.10", userAgent: "a", listVersionId: "l1", campaignId: "c1" });
    const r = await svc.recordClick({ ip: "198.51.100.99", userAgent: "a", listVersionId: "l1", campaignId: "c1", impressionToken: impression.token! });
    expect(r.recorded).toBe(false);
  });

  it("limite por (IP, lista, campanha): impressão além do limite por minuto é recusada sem chamar o repositório", async () => {
    const repo = makeRepo();
    const svc = new TrackingService(repo, () => new Date("2026-09-27T12:00:00Z"));
    let lastOk = true;
    for (let i = 0; i < 25; i++) {
      const r = await svc.recordImpression({ ip: "203.0.113.10", userAgent: `a${i}`, listVersionId: "l1", campaignId: "c1" });
      lastOk = r.recorded;
    }
    expect(lastOk).toBe(false); // a 25ª (limite é 20/min) já é recusada pelo balde, mesmo com user-agent diferente
    expect(repo.recordCampaignEvent).toHaveBeenCalledTimes(20);
  });
});
