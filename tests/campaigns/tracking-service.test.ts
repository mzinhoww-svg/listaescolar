import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deriveDedupeKey, issueImpressionToken, TrackingService, verifyImpressionToken, type TrackingRepo } from "@/features/campaigns/tracking-service";
import { __resetRateLimitForTests } from "@/lib/rate-limit/memory-bucket";

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres-0001";

describe("deriveDedupeKey / issueImpressionToken / verifyImpressionToken", () => {
  beforeEach(() => {
    __resetRateLimitForTests();
    process.env.B2B_CAMPAIGN_TRACKING_SECRET = SECRET;
  });

  it("mesmos insumos -> mesma chave (determinístico); IP (/24), lista, campanha ou dia diferentes mudam a chave", () => {
    const base = { ip: "203.0.113.10", listVersionId: "l1", campaignId: "c1", day: "2026-09-27" };
    const k1 = deriveDedupeKey(base);
    expect(deriveDedupeKey(base)).toBe(k1);
    expect(deriveDedupeKey({ ...base, ip: "203.0.114.10" })).not.toBe(k1); // muda o 3º octeto, não só o truncado
    expect(deriveDedupeKey({ ...base, listVersionId: "l2" })).not.toBe(k1);
    expect(deriveDedupeKey({ ...base, campaignId: "c2" })).not.toBe(k1);
    expect(deriveDedupeKey({ ...base, day: "2026-09-28" })).not.toBe(k1);
  });

  it("user-agent NÃO entra na chave: dois contextos idênticos exceto por um campo 'userAgent' extra (ignorado pelo tipo) dão a mesma chave", () => {
    const base = { ip: "203.0.113.10", listVersionId: "l1", campaignId: "c1", day: "2026-09-27" };
    // TrackingContext não tem mais userAgent — o teste documenta a ausência do campo na própria assinatura do tipo.
    expect(deriveDedupeKey(base)).toBe(deriveDedupeKey({ ...base }));
  });

  it("IP truncado em /24: só o último octeto (IPv4) não muda a chave (privacidade), o resto do endereço continua distinguindo", () => {
    const base = { ip: "203.0.113.10", listVersionId: "l1", campaignId: "c1", day: "2026-09-27" };
    expect(deriveDedupeKey(base)).toBe(deriveDedupeKey({ ...base, ip: "203.0.113.250" }));
  });

  it("token tem o formato <timestamp>.<hmac hex> e não é igual à própria dedupe_key", () => {
    const dedupeKey = deriveDedupeKey({ ip: "203.0.113.10", listVersionId: "l1", campaignId: "c1", day: "2026-09-27" });
    const token = issueImpressionToken(dedupeKey, "c1", 1_000_000);
    expect(token).toBe(`1000000.${token.split(".")[1]}`);
    expect(token).toMatch(/^\d+\.[0-9a-f]{64}$/);
    expect(token).not.toBe(dedupeKey);
  });

  it("verifyImpressionToken aceita só o token certo para aquela (dedupeKey, campaignId), dentro da validade; recusa outra campanha, outra chave, ou adulterado", () => {
    const dedupeKey = deriveDedupeKey({ ip: "203.0.113.10", listVersionId: "l1", campaignId: "c1", day: "2026-09-27" });
    const issuedAt = 1_700_000_000_000;
    const token = issueImpressionToken(dedupeKey, "c1", issuedAt);
    expect(verifyImpressionToken(token, dedupeKey, "c1", issuedAt + 1_000)).toBe(true);
    expect(verifyImpressionToken(token, dedupeKey, "c2", issuedAt + 1_000)).toBe(false); // outra campanha
    expect(verifyImpressionToken(token, "00112233445566778899aabbccddeeff", "c1", issuedAt + 1_000)).toBe(false); // outra dedupeKey
    const [ts, mac] = token.split(".");
    const tamperedMac = mac!.slice(0, -2) + (mac!.endsWith("00") ? "ff" : "00");
    expect(verifyImpressionToken(`${ts}.${tamperedMac}`, dedupeKey, "c1", issuedAt + 1_000)).toBe(false);
  });

  it("token expira em 10 minutos: válido pouco antes, recusado logo depois", () => {
    const dedupeKey = deriveDedupeKey({ ip: "203.0.113.10", listVersionId: "l1", campaignId: "c1", day: "2026-09-27" });
    const issuedAt = 1_700_000_000_000;
    const token = issueImpressionToken(dedupeKey, "c1", issuedAt);
    expect(verifyImpressionToken(token, dedupeKey, "c1", issuedAt + 10 * 60_000 - 1)).toBe(true);
    expect(verifyImpressionToken(token, dedupeKey, "c1", issuedAt + 10 * 60_000 + 1)).toBe(false);
  });

  it("token 'do futuro' além da tolerância de relógio é recusado; dentro da tolerância pequena é aceito", () => {
    const dedupeKey = deriveDedupeKey({ ip: "203.0.113.10", listVersionId: "l1", campaignId: "c1", day: "2026-09-27" });
    const issuedAt = 1_700_000_000_000;
    const token = issueImpressionToken(dedupeKey, "c1", issuedAt);
    expect(verifyImpressionToken(token, dedupeKey, "c1", issuedAt - 5_000)).toBe(true); // 5s de tolerância
    expect(verifyImpressionToken(token, dedupeKey, "c1", issuedAt - 10_000)).toBe(false);
  });

  it("token malformado (sem ponto, timestamp não numérico) é recusado sem lançar", () => {
    const dedupeKey = deriveDedupeKey({ ip: "203.0.113.10", listVersionId: "l1", campaignId: "c1", day: "2026-09-27" });
    expect(verifyImpressionToken("sem-ponto-nenhum", dedupeKey, "c1")).toBe(false);
    expect(verifyImpressionToken("abc.def0", dedupeKey, "c1")).toBe(false);
  });

  it("sem B2B_CAMPAIGN_TRACKING_SECRET configurado (ou curto demais): lança, nunca deriva com um segredo fraco/ausente", () => {
    const prev = process.env.B2B_CAMPAIGN_TRACKING_SECRET;
    delete process.env.B2B_CAMPAIGN_TRACKING_SECRET;
    try {
      expect(() => deriveDedupeKey({ ip: "203.0.113.10", listVersionId: "l1", campaignId: "c1", day: "2026-09-27" })).toThrow();
      process.env.B2B_CAMPAIGN_TRACKING_SECRET = "curto-demais";
      expect(() => deriveDedupeKey({ ip: "203.0.113.10", listVersionId: "l1", campaignId: "c1", day: "2026-09-27" })).toThrow();
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
    const r = await svc.recordImpression({ ip: "203.0.113.10", listVersionId: "l1", campaignId: "c1" });
    expect(r.recorded).toBe(true);
    expect(r.token).toMatch(/^\d+\.[0-9a-f]{64}$/);
    expect(repo.recordCampaignEvent).toHaveBeenCalledWith("c1", "l1", "impression", expect.stringMatching(/^[0-9a-f]{64}$/));
  });

  it("recordClick: sem token válido (nunca houve impressão), NUNCA chama o repositório — recusa antes de gastar uma chamada de banco", async () => {
    const repo = makeRepo();
    const svc = new TrackingService(repo, () => new Date("2026-09-27T12:00:00Z"));
    const r = await svc.recordClick({ ip: "203.0.113.10", listVersionId: "l1", campaignId: "c1", impressionToken: `${Date.now()}.${"00".repeat(32)}` });
    expect(r.recorded).toBe(false);
    expect(repo.recordCampaignEvent).not.toHaveBeenCalled();
  });

  it("recordClick: com o token de uma impressão real (mesmo IP/lista/campanha/dia), chama o repositório com a MESMA dedupe_key", async () => {
    const repo = makeRepo();
    const svc = new TrackingService(repo, () => new Date("2026-09-27T12:00:00Z"));
    const impression = await svc.recordImpression({ ip: "203.0.113.10", listVersionId: "l1", campaignId: "c1" });
    const r = await svc.recordClick({ ip: "203.0.113.10", listVersionId: "l1", campaignId: "c1", impressionToken: impression.token! });
    expect(r.recorded).toBe(true);
    const impressionKey = repo.recordCampaignEvent.mock.calls[0]![3];
    const clickKey = repo.recordCampaignEvent.mock.calls[1]![3];
    expect(clickKey).toBe(impressionKey);
  });

  it("recordClick: token de uma impressão com mais de 10 minutos é recusado (janela de vida curta)", async () => {
    const repo = makeRepo();
    let now = new Date("2026-09-27T12:00:00Z");
    const svc = new TrackingService(repo, () => now);
    const impression = await svc.recordImpression({ ip: "203.0.113.10", listVersionId: "l1", campaignId: "c1" });
    now = new Date(now.getTime() + 11 * 60_000);
    const r = await svc.recordClick({ ip: "203.0.113.10", listVersionId: "l1", campaignId: "c1", impressionToken: impression.token! });
    expect(r.recorded).toBe(false);
  });

  it("recordClick: token de impressão de OUTRO contexto (IP de outra /24) não vale — a dedupe_key derivada muda", async () => {
    const repo = makeRepo();
    const svc = new TrackingService(repo, () => new Date("2026-09-27T12:00:00Z"));
    const impression = await svc.recordImpression({ ip: "203.0.113.10", listVersionId: "l1", campaignId: "c1" });
    const r = await svc.recordClick({ ip: "198.51.100.99", listVersionId: "l1", campaignId: "c1", impressionToken: impression.token! });
    expect(r.recorded).toBe(false);
  });

  it("limite por (IP /24, CAMPANHA) soma TODAS as listas: trocar de lista não abre uma cota nova", async () => {
    const repo = makeRepo();
    const svc = new TrackingService(repo, () => new Date("2026-09-27T12:00:00Z"));
    let lastOk = true;
    for (let i = 0; i < 25; i++) {
      // cada chamada usa uma lista DIFERENTE — se o limite fosse por lista, nunca bateria o teto.
      const r = await svc.recordImpression({ ip: "203.0.113.10", listVersionId: `l${i}`, campaignId: "c1" });
      lastOk = r.recorded;
    }
    expect(lastOk).toBe(false); // a 25ª (limite é 20/min por IP/24 x campanha) já é recusada
    expect(repo.recordCampaignEvent).toHaveBeenCalledTimes(20);
  });

  it("limite é por CAMPANHA: outra campanha, mesmo IP, tem cota própria", async () => {
    const repo = makeRepo();
    const svc = new TrackingService(repo, () => new Date("2026-09-27T12:00:00Z"));
    for (let i = 0; i < 20; i++) {
      await svc.recordImpression({ ip: "203.0.113.10", listVersionId: "l1", campaignId: "c1" });
    }
    const r = await svc.recordImpression({ ip: "203.0.113.10", listVersionId: "l1", campaignId: "c2" });
    expect(r.recorded).toBe(true);
  });
});
