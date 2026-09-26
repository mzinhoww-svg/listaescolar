import { randomBytes } from "node:crypto";

import { PIX_EXPIRY_MARGIN_MS } from "../limits";
import { pixCobResponseSchema, type PixConfig } from "../schemas";
import type { Charge, ChargeInput, ChargeStatus, PaymentProvider } from "../ports";
import { httpsJsonClient, PixHttpError, type HttpClient } from "./pix-http";

const TXID_ALPHABET_LEN = 32; // dentro de [26, 35], só [a-zA-Z0-9] (aqui hex, subconjunto válido).

function newTxid(): string {
  return randomBytes(16).toString("hex");
}

type Token = { accessToken: string; expiresAt: number };

/**
 * Adapter Pix (API do BACEN v2, `cob`): OAuth2 client credentials + mTLS por `node:https`, `PUT/GET /v2/cob/{txid}`.
 * Nenhuma credencial fixa no código (tudo vem de `PixConfig`, montado só a partir do ambiente). Nunca loga segredo,
 * certificado ou BR Code. A confirmação de pagamento SEMPRE reconsulta esta classe (`getCharge`); nunca confia no
 * corpo do webhook.
 */
export class PixPaymentProvider implements PaymentProvider {
  readonly id = "pix" as const;
  private token: Token | null = null;

  constructor(
    private readonly config: PixConfig,
    private readonly http: HttpClient = httpsJsonClient,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.clock().getTime() + 5_000) return this.token.accessToken;
    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64");
    const res = await this.http(this.config.oauthTokenUrl, {
      method: "POST",
      headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
      cert: this.config.certPem,
      key: this.config.keyPem,
    });
    if (res.status < 200 || res.status >= 300) throw new PixHttpError("falha ao obter token OAuth2 do PSP", res.status >= 500, res.status);
    let parsed: unknown;
    try {
      parsed = JSON.parse(res.body);
    } catch {
      throw new PixHttpError("resposta inválida do token OAuth2", false);
    }
    const p = parsed as { access_token?: unknown; expires_in?: unknown };
    if (typeof p.access_token !== "string" || typeof p.expires_in !== "number") {
      throw new PixHttpError("resposta inválida do token OAuth2", false);
    }
    this.token = { accessToken: p.access_token, expiresAt: this.clock().getTime() + p.expires_in * 1000 };
    return this.token.accessToken;
  }

  /**
   * Revisão de segurança: confirma que a resposta é REALMENTE da cobrança pedida (`txid` bate) e da NOSSA chave
   * recebedora (quando o PSP a devolve) — nunca aceita cegamente o que veio na resposta.
   */
  private assertOwnCob(cob: { txid: string; chave?: string }, expectedTxid: string): void {
    if (cob.txid !== expectedTxid) throw new PixHttpError("resposta do PSP não bate com o txid pedido", false);
    if (cob.chave !== undefined && cob.chave !== this.config.receiverKey) {
      throw new PixHttpError("resposta do PSP não bate com a chave recebedora configurada", false);
    }
  }

  private async call(method: "PUT" | "GET", txid: string, body?: unknown): Promise<unknown> {
    const token = await this.accessToken();
    const res = await this.http(`${this.config.apiBaseUrl}/v2/cob/${txid}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cert: this.config.certPem,
      key: this.config.keyPem,
    });
    if (res.status < 200 || res.status >= 300) {
      throw new PixHttpError(`PSP respondeu ${res.status}`, res.status >= 500 || res.status === 0, res.status);
    }
    try {
      return JSON.parse(res.body);
    } catch {
      throw new PixHttpError("resposta inválida do PSP", false);
    }
  }

  async createCharge(input: ChargeInput): Promise<Charge> {
    const txid = newTxid();
    if (txid.length < 26 || txid.length > 35) throw new Error(`txid fora do padrão: ${TXID_ALPHABET_LEN}`);
    const raw = await this.call("PUT", txid, {
      // A validade da cobrança é do AMBIENTE (`PIX_CHARGE_TTL_SECONDS`), não do chamador: técnica, não é preço/prazo de negócio.
      calendario: { expiracao: this.config.chargeTtlSeconds },
      valor: { original: (input.amountCents / 100).toFixed(2) },
      chave: this.config.receiverKey,
      devedor: { cnpj: input.payer.cnpj, nome: input.payer.name },
      solicitacaoPagador: input.description.slice(0, 140),
    });
    const cob = pixCobResponseSchema.parse(raw);
    this.assertOwnCob(cob, txid);
    return {
      chargeId: cob.txid,
      copyPaste: cob.pixCopiaECola ?? null,
      expiresAt: new Date(new Date(cob.calendario.criacao).getTime() + cob.calendario.expiracao * 1000),
    };
  }

  async getCharge(chargeId: string): Promise<ChargeStatus> {
    const raw = await this.call("GET", chargeId);
    const cob = pixCobResponseSchema.parse(raw);
    this.assertOwnCob(cob, chargeId);
    if (cob.status === "CONCLUIDA") {
      // valor EFETIVAMENTE recebido (pix[].valor) tem prioridade sobre o valor nominal da cobrança (valor.original).
      const receivedValue = cob.pix?.[0]?.valor ?? cob.valor.original;
      return {
        status: "paid",
        paidAmountCents: Math.round(Number(receivedValue) * 100),
        paidAt: cob.pix?.[0]?.horario ? new Date(cob.pix[0].horario) : this.clock(),
      };
    }
    if (cob.status === "ATIVA") {
      // Revisão de segurança (BLOQUEANTE): no BACEN v2 a cob IMEDIATA continua "ATIVA" para sempre — expirar não é
      // um status, é `calendario.criacao + calendario.expiracao` no passado. Sem esta conta, uma cobrança vencida
      // ficava "pending" pra sempre e `payInvoice` nunca regenerava: fatura impagável por Pix. Margem
      // (`PIX_EXPIRY_MARGIN_MS`) a favor do pagador: só considera vencida um pouco DEPOIS do prazo (relógios do
      // nosso servidor e do PSP nunca são idênticos).
      const deadline = new Date(cob.calendario.criacao).getTime() + cob.calendario.expiracao * 1000;
      if (this.clock().getTime() > deadline + PIX_EXPIRY_MARGIN_MS) {
        return { status: "expired", paidAmountCents: null, paidAt: null };
      }
      return { status: "pending", paidAmountCents: null, paidAt: null };
    }
    if (cob.status === "REMOVIDA_PELO_USUARIO_RECEBEDOR" || cob.status === "REMOVIDA_PELO_PSP") {
      return { status: "expired", paidAmountCents: null, paidAt: null };
    }
    return { status: "unknown", paidAmountCents: null, paidAt: null };
  }
}
