import { describe, expect, it, vi } from "vitest";

import type { SessionActor } from "@/features/auth/actor";
import { CampaignServiceError } from "@/features/campaigns/errors";
import { applyKAnonymitySuppression, InsightsService, type InsightsRepo, type RawCell } from "@/features/campaigns/insights-service";

// S26 · aceite do PLAN: "teste de k-anonimato". A supressão mora em TypeScript (a contagem crua do banco não tem
// k-anonimato nenhum) por desenho — ver comentário de topo de features/campaigns/insights-service.ts.

function actorOf(role: SessionActor["role"] = "parent", userId = "11111111-1111-4111-8111-111111111111"): SessionActor {
  return { userId, role } as unknown as SessionActor;
}

describe("applyKAnonymitySuppression", () => {
  it("célula abaixo de min_k fica oculta (count null, suppressed true); igual ou acima fica visível", () => {
    // 3 cidades (não 2): evita que a supressão complementar (testada abaixo) também oculte Cuiabá aqui.
    const cells: RawCell[] = [
      { id: "5103403", label: "Cuiabá", count: 10 },
      { id: "5103700", label: "Rondonópolis", count: 7 },
      { id: "5108402", label: "Sinop", count: 3 }, // abaixo de 5
    ];
    const r = applyKAnonymitySuppression(cells, 5);
    const cuiaba = r.cells.find((c) => c.id === "5103403")!;
    const sinop = r.cells.find((c) => c.id === "5108402")!;
    expect(cuiaba).toMatchObject({ count: 10, suppressed: false });
    expect(sinop).toMatchObject({ count: null, suppressed: true });
  });

  it("célula com contagem EXATAMENTE igual a min_k fica visível (limiar é 'abaixo de', não 'até')", () => {
    const r = applyKAnonymitySuppression([{ id: "a", label: "A", count: 5 }], 5);
    expect(r.cells[0]).toMatchObject({ count: 5, suppressed: false });
  });

  it("0 células suprimidas: nenhuma ação extra, total visível", () => {
    const r = applyKAnonymitySuppression(
      [
        { id: "a", label: "A", count: 10 },
        { id: "b", label: "B", count: 8 },
      ],
      5,
    );
    expect(r.cells.every((c) => !c.suppressed)).toBe(true);
    expect(r.total).toMatchObject({ count: 18, suppressed: false });
  });

  it("exatamente 1 célula suprimida entre 3+ irmãs + total visível: suprime uma SEGUNDA (a de menor contagem visível)", () => {
    const cells: RawCell[] = [
      { id: "a", label: "A", count: 20 },
      { id: "b", label: "B", count: 9 }, // menor visível: deve ser a segunda suprimida
      { id: "c", label: "C", count: 2 }, // abaixo de 5: suprimida primeiro
    ];
    const r = applyKAnonymitySuppression(cells, 5);
    const byId = Object.fromEntries(r.cells.map((c) => [c.id, c]));
    expect(byId.c).toMatchObject({ suppressed: true, count: null }); // original
    expect(byId.b).toMatchObject({ suppressed: true, count: null }); // complementar (menor visível)
    expect(byId.a).toMatchObject({ suppressed: false, count: 20 }); // maior: nunca suprimida
    // subtração não recupera nem "b" nem "c": o total sozinho não isola nenhum dos dois.
    expect(r.total.suppressed).toBe(false);
    expect(r.total.count).toBe(31);
  });

  it("empate na segunda supressão é resolvido por ordem alfabética do id (determinístico)", () => {
    const cells: RawCell[] = [
      { id: "z-maior", label: "Z", count: 50 },
      { id: "b-empate", label: "B", count: 8 },
      { id: "a-empate", label: "A", count: 8 }, // mesmo count de b-empate; "a-empate" < "b-empate"
      { id: "x-oculta", label: "X", count: 1 },
    ];
    const r = applyKAnonymitySuppression(cells, 5);
    const byId = Object.fromEntries(r.cells.map((c) => [c.id, c]));
    expect(byId["x-oculta"]!.suppressed).toBe(true);
    expect(byId["a-empate"]!.suppressed).toBe(true); // vence o empate (ordem alfabética)
    expect(byId["b-empate"]!.suppressed).toBe(false);
    expect(byId["z-maior"]!.suppressed).toBe(false);
  });

  it("2 ou mais células já suprimidas: nenhuma ação extra (ambiguidade da subtração já basta)", () => {
    const cells: RawCell[] = [
      { id: "a", label: "A", count: 20 },
      { id: "b", label: "B", count: 2 },
      { id: "c", label: "C", count: 3 },
    ];
    const r = applyKAnonymitySuppression(cells, 5);
    const suppressedCount = r.cells.filter((c) => c.suppressed).length;
    expect(suppressedCount).toBe(2);
    expect(r.total).toMatchObject({ count: 25, suppressed: false });
  });

  it("caso degenerado: só existe UMA cidade no recorte e ela está oculta -> o TOTAL também é suprimido (senão o total a revela sozinho)", () => {
    const r = applyKAnonymitySuppression([{ id: "a", label: "A", count: 2 }], 5);
    expect(r.cells[0]).toMatchObject({ suppressed: true, count: null });
    expect(r.total).toMatchObject({ suppressed: true, count: null });
  });

  it("sem nenhuma cidade: total 0, sempre oculto (0 < qualquer min_k >= 2)", () => {
    const r = applyKAnonymitySuppression([], 5);
    expect(r.cells).toEqual([]);
    expect(r.total).toMatchObject({ count: null, suppressed: true });
  });
});

function makeRepo(overrides: Partial<InsightsRepo> = {}): InsightsRepo {
  return {
    insightsRaw: vi.fn(async () => []),
    getMinK: vi.fn(async () => 5),
    callerBrandEnvironment: vi.fn(async () => ({ isDemo: false })),
    ...overrides,
  };
}

describe("InsightsService.query", () => {
  it("ator sem parceiro marca habilitado -> forbidden, sem consultar o banco", async () => {
    const repo = makeRepo({ callerBrandEnvironment: vi.fn(async () => null) });
    const svc = new InsightsService(repo);
    await expect(svc.query(actorOf(), { category: "papelaria", gradeStage: "ef" })).rejects.toBeInstanceOf(CampaignServiceError);
    expect(repo.insightsRaw).not.toHaveBeenCalled();
  });

  it("usa o ambiente (is_demo) do parceiro do ator para consultar a contagem crua", async () => {
    const repo = makeRepo({ callerBrandEnvironment: vi.fn(async () => ({ isDemo: true })) });
    const svc = new InsightsService(repo);
    await svc.query(actorOf(), { category: "papelaria", gradeStage: "ef" });
    expect(repo.insightsRaw).toHaveBeenCalledWith("papelaria", "ef", true);
  });

  it("admin fora do papel admin não consegue queryAsAdmin", async () => {
    const repo = makeRepo();
    const svc = new InsightsService(repo);
    await expect(svc.queryAsAdmin(actorOf("parent"), { category: "papelaria", gradeStage: "ef" }, false)).rejects.toMatchObject({ code: "forbidden" });
  });
});
