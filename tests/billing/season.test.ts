import { describe, expect, it } from "vitest";

import { maxInstallmentsAvailable, seasonWindow } from "@/features/billing/season";
import { formatDateParts } from "@/features/billing/tz";

// Plano-modelo do PLAN: temporada novembro (11) a março (3), passe em até 3x.
const WRAP_PLAN = { seasonStartMonth: 11, seasonEndMonth: 3 };
// Sem virada de ano: fevereiro (2) a maio (5).
const SAME_YEAR_PLAN = { seasonStartMonth: 2, seasonEndMonth: 5 };
const SINGLE_MONTH_PLAN = { seasonStartMonth: 12, seasonEndMonth: 12 };

function cuiabaInstant(iso: string): Date {
  // ISO já em UTC-4 explícito (America/Cuiaba, fixo, sem DST).
  return new Date(iso);
}

describe("seasonWindow · temporada que cruza o fim do ano (nov-mar)", () => {
  it("dentro da temporada (janeiro): começa no novembro anterior, termina no março seguinte", () => {
    const w = seasonWindow(WRAP_PLAN, cuiabaInstant("2026-01-15T12:00:00-04:00"));
    expect(formatDateParts(w.seasonStart)).toBe("2025-11-01");
    expect(formatDateParts(w.seasonEnd)).toBe("2026-03-31");
    expect(w.inSeason).toBe(true);
    expect(w.label).toBe("novembro a março");
  });

  it("fora da temporada (abril): aponta para a PRÓXIMA (novembro deste ano)", () => {
    const w = seasonWindow(WRAP_PLAN, cuiabaInstant("2026-04-15T12:00:00-04:00"));
    expect(formatDateParts(w.seasonStart)).toBe("2026-11-01");
    expect(formatDateParts(w.seasonEnd)).toBe("2027-03-31");
    expect(w.inSeason).toBe(false);
  });

  it("dentro da temporada (novembro): começa neste ano, termina no março seguinte", () => {
    const w = seasonWindow(WRAP_PLAN, cuiabaInstant("2026-11-15T12:00:00-04:00"));
    expect(formatDateParts(w.seasonStart)).toBe("2026-11-01");
    expect(formatDateParts(w.seasonEnd)).toBe("2027-03-31");
    expect(w.inSeason).toBe(true);
  });

  it("borda: 31/03 23:59 (Cuiabá) ainda está na temporada; 01/04 00:00 já não está", () => {
    const last = seasonWindow(WRAP_PLAN, cuiabaInstant("2026-03-31T23:59:00-04:00"));
    expect(last.inSeason).toBe(true);
    expect(formatDateParts(last.seasonEnd)).toBe("2026-03-31");
    const first = seasonWindow(WRAP_PLAN, cuiabaInstant("2026-04-01T00:00:00-04:00"));
    expect(first.inSeason).toBe(false);
    expect(formatDateParts(first.seasonStart)).toBe("2026-11-01");
  });

  it("startsAt/endsAt são os instantes UTC corretos (meia-noite local de Cuiabá)", () => {
    const w = seasonWindow(WRAP_PLAN, cuiabaInstant("2026-01-15T12:00:00-04:00"));
    expect(w.startsAt.toISOString()).toBe("2025-11-01T04:00:00.000Z");
    // endsAt é EXCLUSIVO: meia-noite local do dia seguinte ao fim (1º de abril).
    expect(w.endsAt.toISOString()).toBe("2026-04-01T04:00:00.000Z");
  });
});

describe("seasonWindow · sem virada de ano (fev-mai)", () => {
  it("dentro da temporada", () => {
    const w = seasonWindow(SAME_YEAR_PLAN, cuiabaInstant("2026-03-01T12:00:00-04:00"));
    expect(formatDateParts(w.seasonStart)).toBe("2026-02-01");
    expect(formatDateParts(w.seasonEnd)).toBe("2026-05-31");
    expect(w.inSeason).toBe(true);
  });

  it("antes da temporada (janeiro): aponta para a mesma temporada deste ano", () => {
    const w = seasonWindow(SAME_YEAR_PLAN, cuiabaInstant("2026-01-10T12:00:00-04:00"));
    expect(formatDateParts(w.seasonStart)).toBe("2026-02-01");
    expect(w.inSeason).toBe(false);
  });

  it("depois da temporada (junho): aponta para o ano seguinte", () => {
    const w = seasonWindow(SAME_YEAR_PLAN, cuiabaInstant("2026-06-10T12:00:00-04:00"));
    expect(formatDateParts(w.seasonStart)).toBe("2027-02-01");
    expect(w.inSeason).toBe(false);
  });
});

describe("seasonWindow · meses iguais (só dezembro)", () => {
  it("dentro do mês único", () => {
    const w = seasonWindow(SINGLE_MONTH_PLAN, cuiabaInstant("2026-12-15T12:00:00-04:00"));
    expect(formatDateParts(w.seasonStart)).toBe("2026-12-01");
    expect(formatDateParts(w.seasonEnd)).toBe("2026-12-31");
    expect(w.inSeason).toBe(true);
    expect(w.label).toBe("dezembro");
  });
});

describe("maxInstallmentsAvailable", () => {
  it("null quando o plano não tem passe", () => {
    expect(maxInstallmentsAvailable({ ...WRAP_PLAN, passMaxInstallments: null }, cuiabaInstant("2026-01-15T12:00:00-04:00"))).toBeNull();
  });

  it("3 quando a compra é logo no início da temporada (cabem as 3 parcelas mensais)", () => {
    expect(maxInstallmentsAvailable({ ...WRAP_PLAN, passMaxInstallments: 3 }, cuiabaInstant("2026-11-05T12:00:00-04:00"))).toBe(3);
  });

  it("menos parcelas quando a compra é perto do fim da temporada", () => {
    // comprado em 15/03: parcela 2 cairia em 15/04 (fora), então só 1 parcela cabe.
    const n = maxInstallmentsAvailable({ ...WRAP_PLAN, passMaxInstallments: 3 }, cuiabaInstant("2026-03-15T12:00:00-04:00"));
    expect(n).toBe(1);
  });
});
