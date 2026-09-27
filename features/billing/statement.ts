import type { LedgerEntryView } from "./ports";

export type StatementLine = { id: string; date: Date; description: string; amountCents: number; balanceAfterCents: number };

/** "Lead LC-XXXX · Escola", "Lead grátis", "Lead do passe", "Recarga Pix", "Estorno" — nunca dado do responsável. */
function describe(entry: LedgerEntryView): string {
  switch (entry.entryType) {
    case "lead_debit": {
      const code = entry.leadCode ?? "—";
      return entry.schoolName ? `Lead ${code} · ${entry.schoolName}` : `Lead ${code}`;
    }
    case "free_lead":
      return entry.leadCode ? `Lead grátis · ${entry.leadCode}` : "Lead grátis";
    case "pass_lead":
      return entry.leadCode ? `Lead do passe · ${entry.leadCode}` : "Lead do passe";
    case "topup":
      return "Recarga";
    case "reversal":
      return "Estorno";
    default:
      return "Lançamento";
  }
}

/** Extrato para a tela (Pap06): data, descrição neutra, valor e saldo após — na ordem em que já vêm (cronológica). */
export function statementLines(entries: readonly LedgerEntryView[]): StatementLine[] {
  return entries.map((e) => ({ id: e.id, date: e.createdAt, description: describe(e), amountCents: e.amountCents, balanceAfterCents: e.balanceAfterCents }));
}

const MS_PER_DAY = 86_400_000;

/**
 * Débitos médios por semana nos últimos 28 dias (só `lead_debit`/`free_lead`/`pass_lead` não estornados). `null`
 * ("indisponível") com menos de 7 dias de histórico no período — nunca um número inventado.
 */
export function weeklyAverage(entries: readonly LedgerEntryView[], now: Date): number | null {
  const windowStart = new Date(now.getTime() - 28 * MS_PER_DAY);
  const debits = entries.filter(
    (e) => (e.entryType === "lead_debit" || e.entryType === "free_lead" || e.entryType === "pass_lead") && !e.reversed && e.createdAt >= windowStart && e.createdAt <= now,
  );
  if (debits.length === 0) return null;
  const oldest = debits.reduce((min, e) => (e.createdAt < min ? e.createdAt : min), now);
  const spanDays = (now.getTime() - oldest.getTime()) / MS_PER_DAY;
  if (spanDays < 7) return null;
  const weeks = Math.max(spanDays / 7, 1);
  return debits.length / weeks;
}
