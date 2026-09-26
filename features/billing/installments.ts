import { BILLING_TIMEZONE } from "./limits";
import { addMonthsClamped, localDateParts, type DateParts } from "./tz";

export type Installment = { installmentNo: number; amountCents: number; dueDate: DateParts };

/**
 * Divide `totalCents` em `n` parcelas (resto na 1ª) com vencimentos mensais a partir de `purchaseDate` (fuso de
 * Cuiabá), dia limitado ao fim do mês de destino — mesma conta de `billing_purchase_season_pass` (0401_billing.sql).
 */
export function splitInstallments(totalCents: number, n: number, purchaseDate: Date): Installment[] {
  if (!Number.isInteger(n) || n < 1) throw new RangeError("número de parcelas inválido");
  const base = Math.trunc(totalCents / n);
  const rest = totalCents - base * n;
  const today = localDateParts(purchaseDate, BILLING_TIMEZONE);
  return Array.from({ length: n }, (_, i) => ({
    installmentNo: i + 1,
    amountCents: base + (i === 0 ? rest : 0),
    dueDate: addMonthsClamped(today, i),
  }));
}
