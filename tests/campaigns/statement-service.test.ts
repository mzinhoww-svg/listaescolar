import { describe, expect, it, vi } from "vitest";

import type { SessionActor } from "@/features/auth/actor";
import type { Statement } from "@/features/campaigns/repository";
import { formatStatementForDisplay, StatementService, type StatementRepo } from "@/features/campaigns/statement-service";

function actorOf(role: SessionActor["role"] = "admin", userId = "11111111-1111-4111-8111-111111111111"): SessionActor {
  return { userId, role } as unknown as SessionActor;
}

const STATEMENT: Statement = {
  id: "s1",
  partnerId: "33333333-3333-4333-8333-333333333333",
  periodStart: "2026-09-01",
  periodEnd: "2026-09-30",
  paymentInstruction: "PIX manual",
  createdAt: "2026-10-01T00:00:00Z",
  lineItems: [
    { id: "l1", source: "api_usage", campaignId: null, label: "Uso da API", quantity: 120, unit: "requisições", unitPriceCents: null, amountCents: null, pricingStatus: "unavailable" },
    { id: "l2", source: "campaign_cpc", campaignId: "c1", label: "Campanha X", quantity: 10, unit: "cliques", unitPriceCents: 300, amountCents: 3000, pricingStatus: "priced" },
  ],
};

describe("formatStatementForDisplay", () => {
  it("linha sem preço mostra 'indisponível' (nunca zero, nunca inventa valor)", () => {
    const d = formatStatementForDisplay(STATEMENT);
    const apiLine = d.lineItems.find((l) => l.label === "Uso da API")!;
    expect(apiLine.amountDisplay).toBe("indisponível");
  });

  it("linha priced mostra o valor formatado em reais a partir do bid do parceiro", () => {
    const d = formatStatementForDisplay(STATEMENT);
    const campaignLine = d.lineItems.find((l) => l.label === "Campanha X")!;
    expect(campaignLine.amountDisplay).toBe("R$ 30,00");
  });

  it("total combina o que tem preço e avisa que há itens indisponíveis (nunca soma um valor inventado no lugar deles)", () => {
    const d = formatStatementForDisplay(STATEMENT);
    expect(d.totalDisplay).toBe("R$ 30,00 + itens indisponíveis");
  });

  it("sem nenhuma linha indisponível, o total não menciona 'indisponível'", () => {
    const allPriced: Statement = { ...STATEMENT, lineItems: [STATEMENT.lineItems[1]!] };
    const d = formatStatementForDisplay(allPriced);
    expect(d.totalDisplay).toBe("R$ 30,00");
  });
});

function makeRepo(overrides: Partial<StatementRepo> = {}): StatementRepo {
  return {
    generateStatement: vi.fn(async () => ({ statementId: "s1" })),
    listStatementsForPartner: vi.fn(async () => [STATEMENT]),
    isPartnerMemberOrAdmin: vi.fn(async () => true),
    ...overrides,
  };
}

describe("StatementService", () => {
  it("generate: só admin; dono do parceiro é recusado", async () => {
    const repo = makeRepo();
    const svc = new StatementService(repo);
    await expect(
      svc.generate(actorOf("parent"), { partnerId: "33333333-3333-4333-8333-333333333333", periodStart: "2026-09-01", periodEnd: "2026-09-30" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(repo.generateStatement).not.toHaveBeenCalled();
  });

  it("generate: admin válido chama o repositório com o payload validado", async () => {
    const repo = makeRepo();
    const svc = new StatementService(repo);
    const r = await svc.generate(actorOf("admin"), { partnerId: "33333333-3333-4333-8333-333333333333", periodStart: "2026-09-01", periodEnd: "2026-09-30", paymentInstruction: "PIX" });
    expect(r).toEqual({ statementId: "s1" });
    expect(repo.generateStatement).toHaveBeenCalledWith(expect.anything(), "33333333-3333-4333-8333-333333333333", "2026-09-01", "2026-09-30", "PIX");
  });

  it("listForPartner: sem vínculo com o parceiro -> forbidden, sem listar", async () => {
    const repo = makeRepo({ isPartnerMemberOrAdmin: vi.fn(async () => false) });
    const svc = new StatementService(repo);
    await expect(svc.listForPartner(actorOf("parent"), "33333333-3333-4333-8333-333333333333")).rejects.toMatchObject({ code: "forbidden" });
    expect(repo.listStatementsForPartner).not.toHaveBeenCalled();
  });

  it("listForPartner: com vínculo, devolve extratos formatados", async () => {
    const repo = makeRepo();
    const svc = new StatementService(repo);
    const r = await svc.listForPartner(actorOf("parent"), "33333333-3333-4333-8333-333333333333");
    expect(r[0]!.totalDisplay).toBe("R$ 30,00 + itens indisponíveis");
  });
});
