import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { checkRateLimit } from "@/lib/rate-limit/memory-bucket";

import { CampaignServiceError } from "./errors";

// Rastreamento de impressão/clique (S26 — revisão de segurança independente): o `dedupe_key` do banco (0503) é só
// um hash; QUEM o deriva importa. Antes, o CHAMADOR escolhia livremente qualquer hex de 16-128 caracteres — um
// cliente malicioso podia forjar uma chave nova a cada chamada e inflar impressão/clique sem limite. Agora:
// * o `dedupe_key` é derivado AQUI, no servidor, por HMAC-SHA256 com um segredo que o cliente nunca vê, sobre
//   (IP truncado + user-agent + lista + campanha + dia) — o cliente não escolhe o valor, só os insumos, e o IP é
//   o único insumo que ele não controla totalmente;
// * a impressão emite um TOKEN assinado (HMAC do próprio dedupe_key); o clique só é aceito com esse token válido
//   — sem token, nem chega a chamar o banco (o banco também exige impressão prévia no mesmo dia/chave, defesa em
//   profundidade: dois lugares, duas checagens independentes);
// * limite de eventos por (IP, lista, campanha) por minuto, na mesma camada de balde em memória já usada pelo
//   widget/API B2B (S24/S25) — primeira camada; o Firewall da Vercel é a de verdade (mesma ressalva de sempre).
//
// Nada aqui é chamado por nenhuma tela ou rota ainda (Ruling do ledger): é a infraestrutura pronta para quando a
// página pública da lista ganhar o slot de campanha patrocinada, fora do escopo desta fatia.

const IMPRESSION_LIMIT_PER_MINUTE = 20;
const CLICK_LIMIT_PER_MINUTE = 10;
const WINDOW_MS = 60_000;

function secret(): string {
  const s = process.env.B2B_CAMPAIGN_TRACKING_SECRET;
  if (!s || s.length < 32) throw new CampaignServiceError("rastreamento de campanha indisponível", "database");
  return s;
}

/** Reduz a precisão do IP antes de usá-lo (privacidade): IPv4 zera o último octeto; IPv6 mantém só os 3
 * primeiros grupos (~/48). Nunca grava o IP bruto em lugar nenhum — só entra no HMAC, que é de mão única. */
export function truncateIp(ip: string): string {
  if (ip.includes(".")) {
    const parts = ip.split(".");
    return `${parts[0] ?? "0"}.${parts[1] ?? "0"}.${parts[2] ?? "0"}.0`;
  }
  const segments = ip.split(":").filter((s) => s.length > 0);
  return `${segments.slice(0, 3).join(":")}::`;
}

export type TrackingContext = { ip: string; userAgent: string; listVersionId: string; campaignId: string; day: string };

export function deriveDedupeKey(ctx: TrackingContext): string {
  return createHmac("sha256", secret())
    .update(`${truncateIp(ctx.ip)}|${ctx.userAgent.slice(0, 200)}|${ctx.listVersionId}|${ctx.campaignId}|${ctx.day}`)
    .digest("hex");
}

export function issueImpressionToken(dedupeKey: string, campaignId: string): string {
  return createHmac("sha256", secret()).update(`impression|${campaignId}|${dedupeKey}`).digest("hex");
}

/** Comparação em tempo constante — nunca `===`/`includes` num segredo. */
export function verifyImpressionToken(token: string, dedupeKey: string, campaignId: string): boolean {
  let expected: string;
  try {
    expected = issueImpressionToken(dedupeKey, campaignId);
  } catch {
    return false;
  }
  const a = Buffer.from(token, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type TrackingRepo = {
  recordCampaignEvent: (campaignId: string, listVersionId: string, eventType: "impression" | "click", dedupeKey: string) => Promise<boolean>;
};

export type ImpressionResult = { recorded: boolean; token: string | null };

export class TrackingService {
  constructor(
    private readonly repo: TrackingRepo,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private today(): string {
    // America/Cuiaba, mesmo fuso do banco (0503) — dedupe por dia tem que bater dos dois lados.
    return this.now().toLocaleDateString("en-CA", { timeZone: "America/Cuiaba" });
  }

  async recordImpression(ctx: Omit<TrackingContext, "day">): Promise<ImpressionResult> {
    const rateKey = `campaign-impression:${truncateIp(ctx.ip)}:${ctx.listVersionId}:${ctx.campaignId}`;
    if (!checkRateLimit(rateKey, IMPRESSION_LIMIT_PER_MINUTE, WINDOW_MS)) {
      return { recorded: false, token: null };
    }
    const day = this.today();
    const dedupeKey = deriveDedupeKey({ ...ctx, day });
    const recorded = await this.repo.recordCampaignEvent(ctx.campaignId, ctx.listVersionId, "impression", dedupeKey);
    return { recorded, token: recorded ? issueImpressionToken(dedupeKey, ctx.campaignId) : null };
  }

  async recordClick(ctx: Omit<TrackingContext, "day"> & { impressionToken: string }): Promise<{ recorded: boolean }> {
    const rateKey = `campaign-click:${truncateIp(ctx.ip)}:${ctx.listVersionId}:${ctx.campaignId}`;
    if (!checkRateLimit(rateKey, CLICK_LIMIT_PER_MINUTE, WINDOW_MS)) {
      return { recorded: false };
    }
    const day = this.today();
    const dedupeKey = deriveDedupeKey({ ...ctx, day });
    // sem token válido, nem chama o banco — o banco também recusaria (exige impressão prévia com o MESMO
    // dedupe_key), mas checar aqui evita gastar uma chamada de banco num clique óbvio de forjar.
    if (!verifyImpressionToken(ctx.impressionToken, dedupeKey, ctx.campaignId)) {
      return { recorded: false };
    }
    const recorded = await this.repo.recordCampaignEvent(ctx.campaignId, ctx.listVersionId, "click", dedupeKey);
    return { recorded };
  }
}
