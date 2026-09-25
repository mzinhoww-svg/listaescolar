import { describe, expect, it } from "vitest";

import { computeKpis, FUNNEL_TABS, funnelTab, matchesTab, type KpiRow } from "@/features/leads/funnel";
import { LEAD_STATUSES, type LeadStatus } from "@/features/leads/state";

describe("funil", () => {
  it("abas: Todos, Novos, Lista aberta, Atendidos, Vendidos, Encerrados (sem Contestados)", () => {
    expect(FUNNEL_TABS.map((t) => t.label)).toEqual(["Todos", "Novos", "Lista aberta", "Atendidos", "Vendidos", "Encerrados"]);
  });

  const expected: Record<LeadStatus, string> = {
    received: "new",
    viewed: "opened",
    in_progress: "attended",
    quote_sent: "attended",
    awaiting_customer: "attended",
    converted: "sold",
    declined: "closed",
    expired: "closed",
    cancelled: "closed",
  };
  for (const status of LEAD_STATUSES) it(`${status} -> ${expected[status]}`, () => expect(funnelTab(status)).toBe(expected[status]));

  it("matchesTab: 'all' casa tudo e cada status casa exatamente uma aba", () => {
    for (const s of LEAD_STATUSES) {
      expect(matchesTab(s, "all")).toBe(true);
      const hits = FUNNEL_TABS.filter((t) => t.id !== "all" && matchesTab(s, t.id));
      expect(hits).toHaveLength(1);
    }
  });
});

const row = (over: Partial<KpiRow>): KpiRow => ({ status: "received", declaredSaleCents: null, saleDeclaredAt: null, ...over });

describe("computeKpis", () => {
  const now = new Date("2026-09-25T15:00:00Z");

  it("conta novos e aguardando resposta", () => {
    const k = computeKpis([row({}), row({ status: "received" }), row({ status: "viewed" }), row({ status: "in_progress" }), row({ status: "expired" })], now);
    expect(k.newCount).toBe(2);
    expect(k.awaitingCount).toBe(3);
  });

  it("vendidos na semana (7 dias) e vendas declaradas no mês", () => {
    const k = computeKpis(
      [
        row({ status: "converted", declaredSaleCents: 10_000, saleDeclaredAt: new Date("2026-09-24T12:00:00Z") }),
        row({ status: "converted", declaredSaleCents: 5_050, saleDeclaredAt: new Date("2026-09-10T12:00:00Z") }),
        row({ status: "converted", declaredSaleCents: null, saleDeclaredAt: new Date("2026-09-20T12:00:00Z") }),
        row({ status: "converted", declaredSaleCents: 999, saleDeclaredAt: new Date("2026-08-20T12:00:00Z") }),
      ],
      now,
    );
    expect(k.soldThisWeek).toBe(2);
    expect(k.declaredMonthCents).toBe(15_050);
  });

  it("virada de mês no fuso America/Cuiaba (UTC-4)", () => {
    // 01/10 03:45Z = 30/09 23:45 em Cuiabá: ainda é setembro.
    const lateSept = new Date("2026-10-01T03:45:00Z");
    const k = computeKpis(
      [
        row({ status: "converted", declaredSaleCents: 100, saleDeclaredAt: new Date("2026-10-01T03:30:00Z") }), // 30/09 23:30 Cuiabá
        row({ status: "converted", declaredSaleCents: 200, saleDeclaredAt: new Date("2026-10-01T04:00:00Z") }), // 01/10 00:00 Cuiabá
        row({ status: "converted", declaredSaleCents: 400, saleDeclaredAt: new Date("2026-09-01T03:59:00Z") }), // 31/08 23:59 Cuiabá
        row({ status: "converted", declaredSaleCents: 800, saleDeclaredAt: new Date("2026-09-01T04:00:00Z") }), // 01/09 00:00 Cuiabá
      ],
      lateSept,
    );
    expect(k.declaredMonthCents).toBe(900);
    const early = computeKpis(
      [row({ status: "converted", declaredSaleCents: 200, saleDeclaredAt: new Date("2026-10-01T04:00:00Z") })],
      new Date("2026-10-01T04:30:00Z"),
    );
    expect(early.declaredMonthCents).toBe(200);
  });

  it("ignora venda no futuro e lista vazia dá zero", () => {
    expect(computeKpis([], now)).toEqual({ newCount: 0, awaitingCount: 0, soldThisWeek: 0, declaredMonthCents: null });
    const k = computeKpis([row({ status: "converted", declaredSaleCents: 100, saleDeclaredAt: new Date("2026-09-26T15:00:00Z") })], now);
    expect(k.soldThisWeek).toBe(0);
    expect(k.declaredMonthCents).toBeNull();
  });
});
