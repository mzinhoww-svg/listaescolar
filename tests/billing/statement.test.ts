import { describe, expect, it } from "vitest";

import type { LedgerEntryView } from "@/features/billing/ports";
import { statementLines, weeklyAverage } from "@/features/billing/statement";

function entry(over: Partial<LedgerEntryView>): LedgerEntryView {
  return {
    id: "e1",
    entryType: "lead_debit",
    amountCents: -500,
    balanceAfterCents: 1000,
    leadId: null,
    leadCode: null,
    schoolName: null,
    invoiceId: null,
    itemCount: null,
    reason: null,
    reversed: false,
    createdAt: new Date("2026-06-10T12:00:00Z"),
    ...over,
  };
}

describe("statementLines", () => {
  it("descreve cada tipo sem dado do responsável", () => {
    const lines = statementLines([
      entry({ entryType: "lead_debit", leadCode: "LC-A1B2", schoolName: "Escola Municipal X" }),
      entry({ entryType: "free_lead", leadCode: "LC-Z9Y8" }),
      entry({ entryType: "pass_lead", leadCode: "LC-Q1W2" }),
      entry({ entryType: "topup", amountCents: 5000 }),
      entry({ entryType: "reversal", amountCents: 500 }),
    ]);
    expect(lines.map((l) => l.description)).toEqual(["Lead LC-A1B2 · Escola Municipal X", "Lead grátis · LC-Z9Y8", "Lead do passe · LC-Q1W2", "Recarga", "Estorno"]);
  });

  it("preserva valor e saldo após", () => {
    const [line] = statementLines([entry({ amountCents: -900, balanceAfterCents: 100 })]);
    expect(line!.amountCents).toBe(-900);
    expect(line!.balanceAfterCents).toBe(100);
  });
});

describe("weeklyAverage", () => {
  const now = new Date("2026-06-30T00:00:00Z");

  it("indisponível (null) sem lançamentos", () => {
    expect(weeklyAverage([], now)).toBeNull();
  });

  it("indisponível (null) com menos de 7 dias de histórico", () => {
    const entries = [entry({ createdAt: new Date("2026-06-29T00:00:00Z") }), entry({ createdAt: new Date("2026-06-28T00:00:00Z") })];
    expect(weeklyAverage(entries, now)).toBeNull();
  });

  it("calcula com pelo menos 7 dias de histórico, ignorando estornados", () => {
    const entries = [
      entry({ createdAt: new Date("2026-06-01T00:00:00Z") }),
      entry({ createdAt: new Date("2026-06-08T00:00:00Z") }),
      entry({ createdAt: new Date("2026-06-15T00:00:00Z") }),
      entry({ createdAt: new Date("2026-06-20T00:00:00Z"), reversed: true }),
      entry({ createdAt: new Date("2026-06-01T00:00:00Z"), entryType: "topup", amountCents: 5000 }),
    ];
    const avg = weeklyAverage(entries, now);
    expect(avg).not.toBeNull();
    expect(avg).toBeGreaterThan(0);
  });
});
