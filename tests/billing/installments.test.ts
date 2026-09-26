import { describe, expect, it } from "vitest";

import { splitInstallments } from "@/features/billing/installments";
import { formatDateParts } from "@/features/billing/tz";

describe("splitInstallments", () => {
  it("resto fica na 1ª parcela; soma bate com o total", () => {
    const rows = splitInstallments(1000, 3, new Date("2026-06-10T12:00:00-04:00"));
    expect(rows.map((r) => r.amountCents)).toEqual([334, 333, 333]);
    expect(rows.reduce((s, r) => s + r.amountCents, 0)).toBe(1000);
  });

  it("divisão exata: nenhuma parcela ganha resto", () => {
    const rows = splitInstallments(900, 3, new Date("2026-06-10T12:00:00-04:00"));
    expect(rows.map((r) => r.amountCents)).toEqual([300, 300, 300]);
  });

  it("1 parcela = valor total, vencimento hoje", () => {
    const rows = splitInstallments(500, 1, new Date("2026-06-10T12:00:00-04:00"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amountCents).toBe(500);
    expect(formatDateParts(rows[0]!.dueDate)).toBe("2026-06-10");
  });

  it("vencimentos mensais a partir da compra, dia limitado ao fim do mês (31/01 -> 28/02 -> 31/03)", () => {
    const rows = splitInstallments(300, 3, new Date("2026-01-31T12:00:00-04:00"));
    expect(rows.map((r) => formatDateParts(r.dueDate))).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("ano bissexto: 31/01 -> 29/02", () => {
    const rows = splitInstallments(200, 2, new Date("2028-01-31T12:00:00-04:00"));
    expect(rows.map((r) => formatDateParts(r.dueDate))).toEqual(["2028-01-31", "2028-02-29"]);
  });

  it("recusa número de parcelas inválido", () => {
    expect(() => splitInstallments(100, 0, new Date())).toThrow();
    expect(() => splitInstallments(100, -1, new Date())).toThrow();
  });
});
