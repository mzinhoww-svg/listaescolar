import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { checkRateLimit } from "@/lib/rate-limit/memory-bucket";

import { CampaignServiceError } from "./errors";

// Rastreamento de impressão/clique (S26 — duas rodadas de revisão de segurança independente): o `dedupe_key` do
// banco (0503) é só um hash; QUEM o deriva importa. Antes, o CHAMADOR escolhia livremente qualquer hex de 16-128
// caracteres — um cliente malicioso podia forjar uma chave nova a cada chamada e inflar impressão/clique sem
// limite algum. Agora:
// * o `dedupe_key` é derivado AQUI, no servidor, por HMAC-SHA256 com um segredo que o cliente nunca vê, sobre
//   (IP truncado em /24 + lista + campanha + dia) — SEM user-agent (2ª rodada: o user-agent é escolhido pelo
//   próprio cliente, então incluí-lo só dava a ele um jeito barato de gerar chaves novas à vontade trocando o
//   cabeçalho, sem custo nenhum; IP é o único insumo que ele não controla livremente);
// * a impressão emite um TOKEN assinado com timestamp e vida curta (10 min); o clique só é aceito com um token
//   AINDA VÁLIDO — sem token (ou expirado), nem chega a chamar o banco (o banco também exige impressão prévia no
//   mesmo dia/chave, defesa em profundidade: duas checagens independentes, em lugares diferentes);
// * limite de eventos por (IP /24, CAMPANHA) por minuto — soma TODAS as listas daquela campanha, não por
//   lista/campanha (2ª rodada: chavear por lista deixava a rede /24 abrir uma cota nova só trocando de lista) —,
//   na mesma camada de balde em memória já usada pelo widget/API B2B (S24/S25); é só a PRIMEIRA camada (por
//   instância), nunca o limite de verdade — ver dívida abaixo.
// * o IP precisa vir de `lib/net/client-ip.ts::clientIp` (mesmo critério já usado pela API B2B/widget:
//   `x-vercel-forwarded-for` -> `x-real-ip` -> `x-forwarded-for`), nunca de um cabeçalho que o próprio cliente
//   controla sem passar pela borda da Vercel.
//
// Nada aqui é chamado por nenhuma tela ou rota ainda (Ruling do ledger): é a infraestrutura pronta para quando a
// página pública da lista ganhar o slot de campanha patrocinada, fora do escopo desta fatia. D-148 (média,
// registrada no DEBT): o balde em memória é por INSTÂNCIA — um invasor distribuindo requisições entre múltiplas
// instâncias/lambdas da Vercel contorna o limite por IP/24×campanha; um teto diário de verdade precisa de
// armazenamento COMPARTILHADO (ex.: uma tabela/contador no Postgres, ou Redis) — obrigatório resolver antes de
// ligar isto a uma rota pública de verdade, não é opcional para depois.

const IMPRESSION_LIMIT_PER_MINUTE = 20;
const CLICK_LIMIT_PER_MINUTE = 10;
const WINDOW_MS = 60_000;
const IMPRESSION_TOKEN_TTL_MS = 10 * 60_000; // 10 minutos
const CLOCK_SKEW_TOLERANCE_MS = 5_000; // token "do futuro" por até 5s (relógios levemente dessincronizados)

function secret(): string {
  const s = process.env.B2B_CAMPAIGN_TRACKING_SECRET;
  if (!s || s.length < 32) throw new CampaignServiceError("rastreamento de campanha indisponível", "database");
  return s;
}

/** Reduz a precisão do IP antes de usá-lo (privacidade e anti-forja): IPv4 vira /24 (zera o último octeto); IPv6
 * mantém só os 3 primeiros grupos (~/48, faixa equivalente). Nunca grava o IP bruto em lugar nenhum — só entra no
 * HMAC, que é de mão única. */
export function truncateIp(ip: string): string {
  if (ip.includes(".")) {
    const parts = ip.split(".");
    return `${parts[0] ?? "0"}.${parts[1] ?? "0"}.${parts[2] ?? "0"}.0`;
  }
  const segments = ip.split(":").filter((s) => s.length > 0);
  return `${segments.slice(0, 3).join(":")}::`;
}

export type TrackingContext = { ip: string; listVersionId: string; campaignId: string; day: string };

/** SEM user-agent de propósito (ver comentário de topo) — só insumos que o cliente não escolhe livremente. */
export function deriveDedupeKey(ctx: TrackingContext): string {
  return createHmac("sha256", secret())
    .update(`${truncateIp(ctx.ip)}|${ctx.listVersionId}|${ctx.campaignId}|${ctx.day}`)
    .digest("hex");
}

export function issueImpressionToken(dedupeKey: string, campaignId: string, now: number = Date.now()): string {
  const mac = createHmac("sha256", secret()).update(`impression|${campaignId}|${dedupeKey}|${now}`).digest("hex");
  return `${now}.${mac}`;
}

/** Comparação em tempo constante — nunca `===`/`includes` num segredo. Recusa token expirado (>10 min) ou
 * "do futuro" além de uma pequena tolerância de relógio. */
export function verifyImpressionToken(token: string, dedupeKey: string, campaignId: string, now: number = Date.now()): boolean {
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const tsPart = token.slice(0, dot);
  const macPart = token.slice(dot + 1);
  const ts = Number(tsPart);
  if (!Number.isFinite(ts) || ts > now + CLOCK_SKEW_TOLERANCE_MS || now - ts > IMPRESSION_TOKEN_TTL_MS) return false;
  let expectedMac: string;
  try {
    expectedMac = createHmac("sha256", secret()).update(`impression|${campaignId}|${dedupeKey}|${ts}`).digest("hex");
  } catch {
    return false;
  }
  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(macPart, "hex");
    b = Buffer.from(expectedMac, "hex");
  } catch {
    return false;
  }
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
    // chave de limite por (IP /24, CAMPANHA) só — soma todas as listas dessa campanha (2ª rodada).
    const rateKey = `campaign-impression:${truncateIp(ctx.ip)}:${ctx.campaignId}`;
    if (!checkRateLimit(rateKey, IMPRESSION_LIMIT_PER_MINUTE, WINDOW_MS)) {
      return { recorded: false, token: null };
    }
    const day = this.today();
    const dedupeKey = deriveDedupeKey({ ...ctx, day });
    const recorded = await this.repo.recordCampaignEvent(ctx.campaignId, ctx.listVersionId, "impression", dedupeKey);
    return { recorded, token: recorded ? issueImpressionToken(dedupeKey, ctx.campaignId, this.now().getTime()) : null };
  }

  async recordClick(ctx: Omit<TrackingContext, "day"> & { impressionToken: string }): Promise<{ recorded: boolean }> {
    const rateKey = `campaign-click:${truncateIp(ctx.ip)}:${ctx.campaignId}`;
    if (!checkRateLimit(rateKey, CLICK_LIMIT_PER_MINUTE, WINDOW_MS)) {
      return { recorded: false };
    }
    const day = this.today();
    const dedupeKey = deriveDedupeKey({ ...ctx, day });
    // sem token válido (ou expirado), nem chama o banco — o banco também recusaria (exige impressão prévia com o
    // MESMO dedupe_key), mas checar aqui evita gastar uma chamada de banco num clique óbvio de forjar/replay tardio.
    if (!verifyImpressionToken(ctx.impressionToken, dedupeKey, ctx.campaignId, this.now().getTime())) {
      return { recorded: false };
    }
    const recorded = await this.repo.recordCampaignEvent(ctx.campaignId, ctx.listVersionId, "click", dedupeKey);
    return { recorded };
  }
}
