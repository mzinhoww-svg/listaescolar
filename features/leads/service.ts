import type { SessionActor } from "@/features/stationeries/actor";

import { LEAD_CONSENT_TEXT_VERSION } from "./consent";
import { normalizeLeadCode } from "./code";
import { LeadError } from "./errors";
import { buildLeadWhatsappUrl, leadListUrl } from "./message";
import { parseBrlToCents } from "./money";
import type { LeadCartReader, LeadListContextReader, LeadNotifier, LeadStore } from "./ports";
import { CloseLostInputSchema, CreateLeadInputSchema, DeclareSaleInputSchema, UpdateStatusInputSchema } from "./schemas";
import { isTerminal, type LeadStatus } from "./state";

export type LeadServiceDeps = {
  store: LeadStore;
  carts: LeadCartReader;
  /** `null` = nenhum leitor disponível (a tela diz "cotação indisponível para esta lista"). */
  contexts: LeadListContextReader | null;
  notifier: LeadNotifier;
  now: () => Date;
  siteOrigin: () => string;
};

const STATIONERY_SIDE_ROLES: readonly string[] = ["stationery_member", "parent", "admin"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Casos de uso do lead. Autorização final é do banco (membro, solicitante, admin); aqui vão as regras de produto. */
export class LeadService {
  constructor(private readonly deps: LeadServiceDeps) {}

  /** Cria (ou devolve) o lead do solicitante. Itens vêm do carrinho no servidor; snapshot da lista, do leitor de contexto. */
  async createLead(actor: SessionActor, raw: unknown): Promise<{ leadId: string; code: string; created: boolean }> {
    if (actor.role !== "parent") throw new LeadError("só responsável pede cotação", "forbidden");
    if (isRecord(raw) && raw.consent !== true) throw new LeadError("consentimento obrigatório", "consent_required");
    const parsed = CreateLeadInputSchema.safeParse(raw);
    if (!parsed.success) throw new LeadError("pedido inválido", "invalid_input");
    const input = parsed.data;

    const cart = await this.deps.carts.getOwnedCart(actor, input.cartId);
    if (!cart || cart.ownerId !== actor.userId) throw new LeadError("carrinho não encontrado", "not_found");
    if (cart.listId === null || this.deps.contexts === null) throw new LeadError("lista indisponível", "list_unavailable");
    const context = await this.deps.contexts.getContext(cart.listId);
    if (!context) throw new LeadError("lista indisponível", "list_unavailable");
    const stationery = await this.deps.store.getStationeryPublic(input.stationeryId);
    if (!stationery) throw new LeadError("papelaria indisponível", "stationery_unavailable");

    // is_demo: mesma regra do banco (papelaria OU carrinho); contexto de demonstração num pedido real é recusado.
    const isDemo = cart.isDemo || stationery.isDemo;
    if (context.isDemo && !isDemo) throw new LeadError("lista de demonstração em pedido real", "invalid_input");
    if (cart.items.length === 0) throw new LeadError("carrinho sem itens", "invalid_input");

    const created = await this.deps.store.createLead(actor, {
      cartId: cart.id,
      listId: cart.listId,
      stationeryId: stationery.id,
      schoolName: context.schoolName,
      gradeLabel: context.gradeLabel,
      schoolYear: context.schoolYear,
      municipalityId: context.municipalityId ?? stationery.municipalityId,
      neighborhood: input.neighborhood ?? null,
      items: cart.items.map((i) => ({ name: i.name, itemKey: i.itemKey, quantity: i.quantity })),
      consentTextVersion: LEAD_CONSENT_TEXT_VERSION,
      idempotencyKey: input.idempotencyKey,
      isDemo,
    });
    if (created.created) await this.notify(stationery.id, created.leadId, created.code);
    return created;
  }

  private async notify(stationeryId: string, leadId: string, code: string): Promise<void> {
    try {
      await this.deps.notifier.notifyNewLead({ stationeryId, leadId, code });
    } catch (error) {
      // A notificação é acessória: nunca desfaz o lead.
      console.error("notificar novo lead", error instanceof Error ? error.name : "erro");
    }
  }

  /** Link do wa.me para o solicitante enviar a mensagem; registra `whatsapp_opened` só depois de montar o link. */
  async openWhatsapp(actor: SessionActor, rawCode: unknown): Promise<{ url: string }> {
    if (actor.role !== "parent") throw new LeadError("só o solicitante abre o WhatsApp", "forbidden");
    const code = normalizeLeadCode(rawCode);
    if (code === null) throw new LeadError("pedido não encontrado", "not_found");
    const lead = await this.deps.store.getForRequester(actor, code);
    if (!lead) throw new LeadError("pedido não encontrado", "not_found");
    if (isTerminal(lead.status)) throw new LeadError("pedido encerrado", "invalid_state");
    if (lead.expiresAt.getTime() <= this.deps.now().getTime()) throw new LeadError("pedido vencido", "expired");
    const stationery = await this.deps.store.getStationeryPublic(lead.stationeryId);
    if (!stationery) throw new LeadError("papelaria indisponível", "stationery_unavailable");

    let url: string | null = null;
    try {
      const siteOrigin = this.deps.siteOrigin();
      url = buildLeadWhatsappUrl(
        stationery.whatsapp ?? "",
        { code: lead.code, schoolName: lead.schoolName, gradeLabel: lead.gradeLabel, schoolYear: lead.schoolYear, listUrl: leadListUrl(siteOrigin, lead.code) },
        { siteOrigin },
      );
    } catch {
      url = null;
    }
    if (url === null) throw new LeadError("WhatsApp indisponível", "whatsapp_unavailable");
    await this.deps.store.recordWhatsappOpen(actor, lead.id);
    return { url };
  }

  async cancelLead(actor: SessionActor, raw: unknown): Promise<LeadStatus> {
    if (actor.role !== "parent") throw new LeadError("só o solicitante cancela", "forbidden");
    const code = this.codeOf(raw);
    return this.apply(actor, { code, to: "cancelled", as: "parent" });
  }

  /** Papelaria: em atendimento, cotação enviada (valor opcional) ou aguardando o responsável. */
  async updateStatus(actor: SessionActor, raw: unknown): Promise<LeadStatus> {
    this.requireStationerySide(actor);
    const code = this.codeOf(raw);
    const parsed = UpdateStatusInputSchema.safeParse(this.rest(raw));
    if (!parsed.success) throw new LeadError("status inválido", "invalid_input");
    const { to, amount } = parsed.data;
    const text = amount?.trim() ?? "";
    if (text !== "" && to !== "quote_sent") throw new LeadError("valor só na cotação enviada", "invalid_input");
    const amountCents = this.amountOf(text);
    return this.apply(actor, { code, to, as: "stationery", ...(amountCents !== undefined ? { amountCents } : {}) });
  }

  /** "Vendi": venda DECLARADA pela papelaria, valor opcional. */
  async declareSale(actor: SessionActor, raw: unknown): Promise<LeadStatus> {
    this.requireStationerySide(actor);
    const code = this.codeOf(raw);
    const parsed = DeclareSaleInputSchema.safeParse(this.rest(raw));
    if (!parsed.success) throw new LeadError("valor inválido", "amount_invalid");
    const amountCents = this.amountOf(parsed.data.amount?.trim() ?? "");
    return this.apply(actor, { code, to: "converted", as: "stationery", ...(amountCents !== undefined ? { amountCents } : {}) });
  }

  /** "Não fechou": motivo obrigatório do conjunto fechado. */
  async closeLost(actor: SessionActor, raw: unknown): Promise<LeadStatus> {
    this.requireStationerySide(actor);
    const code = this.codeOf(raw);
    const parsed = CloseLostInputSchema.safeParse(this.rest(raw));
    if (!parsed.success) throw new LeadError("motivo obrigatório", "reason_required");
    return this.apply(actor, { code, to: "declined", as: "stationery", reason: parsed.data.reason });
  }

  /** A papelaria abriu o lead (`received -> viewed`, idempotente). Devolve o status atual. */
  async markViewed(actor: SessionActor, rawCode: unknown): Promise<LeadStatus> {
    this.requireStationerySide(actor);
    const code = normalizeLeadCode(rawCode);
    if (code === null) throw new LeadError("pedido não encontrado", "not_found");
    return this.deps.store.markViewed(actor, code);
  }

  private requireStationerySide(actor: SessionActor): void {
    if (!STATIONERY_SIDE_ROLES.includes(actor.role)) throw new LeadError("sem acesso à papelaria", "forbidden");
  }

  private codeOf(raw: unknown): string {
    const value = isRecord(raw) ? raw.code : raw;
    const code = normalizeLeadCode(value);
    if (code === null) throw new LeadError("pedido não encontrado", "not_found");
    return code;
  }

  private rest(raw: unknown): Record<string, unknown> {
    if (!isRecord(raw)) return {};
    const { code: _code, ...others } = raw;
    void _code;
    return others;
  }

  /** Texto em reais para centavos; vazio = sem valor; inválido = `amount_invalid`. */
  private amountOf(text: string): number | undefined {
    if (text === "") return undefined;
    const cents = parseBrlToCents(text);
    if (cents === null) throw new LeadError("valor inválido", "amount_invalid");
    return cents;
  }

  /** Aplica a transição; lead que expirou no meio devolve `expired` do banco, que aqui vira erro (nada de sucesso falso). */
  private async apply(actor: SessionActor, request: Parameters<LeadStore["transitionLead"]>[1]): Promise<LeadStatus> {
    const status = await this.deps.store.transitionLead(actor, request);
    if (status === "expired" && request.to !== "expired") throw new LeadError("pedido expirou", "expired");
    return status;
  }
}
