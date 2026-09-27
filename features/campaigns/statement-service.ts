import type { SessionActor } from "@/features/auth/actor";

import { CampaignServiceError } from "./errors";
import { GenerateStatementInputSchema, type GenerateStatementInput } from "./schemas";
import type { Statement } from "./repository";

// Faturamento B2B (B2B09): extrato imutável por período. Uso de API sempre "indisponível" (nunca inventa preço);
// campanha sempre "priced" com o bid que o próprio parceiro declarou. Nunca gera cobrança automática — o extrato
// é só o registro + `paymentInstruction` (texto livre para o admin agir manualmente fora do sistema).

export type StatementRepo = {
  generateStatement: (actor: SessionActor, partnerId: string, periodStart: string, periodEnd: string, paymentInstruction?: string) => Promise<{ statementId: string }>;
  listStatementsForPartner: (partnerId: string) => Promise<Statement[]>;
  isPartnerMemberOrAdmin: (actor: SessionActor, partnerId: string) => Promise<boolean>;
};

export type DisplayLineItem = { label: string; quantity: number; unit: string; amountDisplay: string };
export type DisplayStatement = { id: string; periodStart: string; periodEnd: string; paymentInstruction: string | null; totalDisplay: string; lineItems: DisplayLineItem[] };

const CENTS_PER_REAL = 100;
const centsToDisplay = (cents: number) => `R$ ${(cents / CENTS_PER_REAL).toFixed(2).replace(".", ",")}`;

/** Formata para exibição sem NUNCA inventar valor: linha sem preço mostra "indisponível", nunca zero nem "—". */
export function formatStatementForDisplay(statement: Statement): DisplayStatement {
  const lineItems = statement.lineItems.map((li) => ({
    label: li.label,
    quantity: li.quantity,
    unit: li.unit,
    amountDisplay: li.pricingStatus === "priced" && li.amountCents !== null ? centsToDisplay(li.amountCents) : "indisponível",
  }));
  const pricedTotal = statement.lineItems.filter((li) => li.pricingStatus === "priced" && li.amountCents !== null).reduce((acc, li) => acc + (li.amountCents ?? 0), 0);
  const hasUnavailable = statement.lineItems.some((li) => li.pricingStatus === "unavailable");
  const totalDisplay = hasUnavailable ? `${centsToDisplay(pricedTotal)} + itens indisponíveis` : centsToDisplay(pricedTotal);
  return { id: statement.id, periodStart: statement.periodStart, periodEnd: statement.periodEnd, paymentInstruction: statement.paymentInstruction, totalDisplay, lineItems };
}

export class StatementService {
  constructor(private readonly repo: StatementRepo) {}

  /** Admin: gera o extrato do período (Admin/B2B09 do lado admin). */
  async generate(actor: SessionActor, rawInput: unknown): Promise<{ statementId: string }> {
    if (actor.role !== "admin") throw new CampaignServiceError("só admin gera extrato", "forbidden");
    const input: GenerateStatementInput = GenerateStatementInputSchema.parse(rawInput);
    return this.repo.generateStatement(actor, input.partnerId, input.periodStart, input.periodEnd, input.paymentInstruction);
  }

  /** B2B09: dono do parceiro (ou admin) vê os próprios extratos, já formatados para exibição. */
  async listForPartner(actor: SessionActor, partnerId: string): Promise<DisplayStatement[]> {
    const allowed = await this.repo.isPartnerMemberOrAdmin(actor, partnerId);
    if (!allowed) throw new CampaignServiceError("sem acesso a este parceiro", "forbidden");
    const statements = await this.repo.listStatementsForPartner(partnerId);
    return statements.map(formatStatementForDisplay);
  }
}
