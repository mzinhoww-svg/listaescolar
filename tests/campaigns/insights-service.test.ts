import { describe, expect, it, vi } from "vitest";

import type { SessionActor } from "@/features/auth/actor";
import { CampaignServiceError } from "@/features/campaigns/errors";
import { applyKAnonymitySuppression, InsightsService, type InsightsRepo, type RawCell } from "@/features/campaigns/insights-service";

// S26 · aceite do PLAN: "teste de k-anonimato". Correções da revisão de segurança independente sobre o desenho
// anterior (que suprimia uma SEGUNDA célula nomeada para evitar a subtração total-visíveis): esse desenho ainda
// vazava nos limites — com exatamente 2 células ocultas cuja soma cai numa faixa estreita (ex. soma = k+1), só
// existe uma forma de dividir a soma em dois valores cada um < k, revelando os dois. O desenho atual nunca nomeia
// uma cidade abaixo de `minK`: todas as pequenas somam numa célula ANÔNIMA "outras", só mostrada quando a PRÓPRIA
// soma atinge `minK` (aí é, por definição, um agregado k-anônimo, não importa como as parcelas se dividem). O
// TOTAL nunca é a soma bruta real — é sempre a soma só do que foi exibido — então não há mais nada para subtrair.

function actorOf(role: SessionActor["role"] = "parent", userId = "11111111-1111-4111-8111-111111111111"): SessionActor {
  return { userId, role } as unknown as SessionActor;
}

describe("applyKAnonymitySuppression", () => {
  it("cidade com contagem >= minK aparece NOMEADA", () => {
    const cells: RawCell[] = [{ id: "5103403", label: "Cuiabá", count: 10 }];
    const r = applyKAnonymitySuppression(cells, 5);
    expect(r.cities).toEqual([{ id: "5103403", label: "Cuiabá", count: 10 }]);
    expect(r.others).toBeNull();
    expect(r.partial).toBe(false);
    expect(r.total).toBe(10);
  });

  it("contagem EXATAMENTE igual a minK já é nomeada (limiar é 'abaixo de', não 'até')", () => {
    const r = applyKAnonymitySuppression([{ id: "a", label: "A", count: 5 }], 5);
    expect(r.cities).toEqual([{ id: "a", label: "A", count: 5 }]);
    expect(r.total).toBe(5);
  });

  it("fronteira S=k+1: 2 cidades pequenas cuja soma é k+1 vão para 'outras', SEM nomear nenhuma (correção do vazamento por limite)", () => {
    // k=5; duas cidades pequenas (2 e 4, soma 6=k+1) — o desenho antigo suprimiria uma NOMEADA (ex. a de 4) e
    // revelaria a outra (2) por subtração do total, ou vice-versa. Aqui nenhuma das duas é nomeada: viram um
    // agregado anônimo de 6, k-anônimo por si só.
    const cells: RawCell[] = [
      { id: "a", label: "A", count: 20 }, // grande, nomeada
      { id: "b", label: "B", count: 4 }, // pequena
      { id: "c", label: "C", count: 2 }, // pequena
    ];
    const r = applyKAnonymitySuppression(cells, 5);
    expect(r.cities).toEqual([{ id: "a", label: "A", count: 20 }]);
    expect(r.cities.some((x) => x.id === "b" || x.id === "c")).toBe(false); // nem B nem C aparecem nomeadas
    expect(r.others).toBe(6); // 4 + 2, agregado, sem nome
    expect(r.partial).toBe(false);
    expect(r.total).toBe(26); // 20 + 6 — soma só do que é exibido, nunca "descontável"
  });

  it("várias cidades ocultas (3+) somando >= minK: todas viram uma única célula anônima", () => {
    const cells: RawCell[] = [
      { id: "a", label: "A", count: 1 },
      { id: "b", label: "B", count: 1 },
      { id: "c", label: "C", count: 1 },
      { id: "d", label: "D", count: 2 },
    ];
    const r = applyKAnonymitySuppression(cells, 5);
    expect(r.cities).toEqual([]);
    expect(r.others).toBe(5); // 1+1+1+2
    expect(r.partial).toBe(false);
    expect(r.total).toBe(5);
  });

  it("cidade com uma única escola (count=1), sozinha, sem outra cidade pequena para agrupar: fica INTEIRAMENTE oculta (nem nome, nem no agregado)", () => {
    const r = applyKAnonymitySuppression([{ id: "a", label: "A", count: 1 }], 5);
    expect(r.cities).toEqual([]);
    expect(r.others).toBeNull(); // 1 sozinho não chega a minK nem agregado consigo mesmo
    expect(r.partial).toBe(true); // existe dado, mas não pode ser mostrado
    expect(r.total).toBe(0); // nada exibido — nunca um "quase total" que entregue o valor por eliminação
  });

  it("agregado de pequenas que NÃO atinge minK mesmo somado: omitido por inteiro (nunca um número abaixo do k)", () => {
    const cells: RawCell[] = [
      { id: "a", label: "A", count: 1 },
      { id: "b", label: "B", count: 2 },
    ]; // soma 3 < 5
    const r = applyKAnonymitySuppression(cells, 5);
    expect(r.others).toBeNull();
    expect(r.partial).toBe(true);
    expect(r.total).toBe(0);
  });

  it("sem nenhuma cidade: total 0, sem parcial (não há dado nenhum, não é 'oculto')", () => {
    const r = applyKAnonymitySuppression([], 5);
    expect(r.cities).toEqual([]);
    expect(r.others).toBeNull();
    expect(r.partial).toBe(false);
    expect(r.total).toBe(0);
  });

  it("cidades nomeadas vêm ordenadas de forma determinística (por id)", () => {
    const cells: RawCell[] = [
      { id: "z", label: "Z", count: 10 },
      { id: "a", label: "A", count: 20 },
    ];
    const r = applyKAnonymitySuppression(cells, 5);
    expect(r.cities.map((c) => c.id)).toEqual(["a", "z"]);
  });

  it("mistura de grandes e pequenas: total é a soma do que é exibido (grandes + outras), nunca a soma bruta real", () => {
    const cells: RawCell[] = [
      { id: "a", label: "A", count: 50 },
      { id: "b", label: "B", count: 30 },
      { id: "c", label: "C", count: 3 }, // pequena
      { id: "d", label: "D", count: 4 }, // pequena
    ];
    const r = applyKAnonymitySuppression(cells, 5);
    expect(r.cities.map((c) => c.id)).toEqual(["a", "b"]);
    expect(r.others).toBe(7); // 3 + 4
    expect(r.total).toBe(87); // 50 + 30 + 7
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

  it("resultado final aplica a supressão sobre a contagem crua (contagem por ESCOLA distinta)", async () => {
    const repo = makeRepo({
      insightsRaw: vi.fn(async () => [
        { cityIbge: "5103403", cityName: "Cuiabá", distinctSchools: 10 },
        { cityIbge: "5108402", cityName: "Sinop", distinctSchools: 1 },
      ]),
    });
    const svc = new InsightsService(repo);
    const r = await svc.query(actorOf(), { category: "papelaria", gradeStage: "ef" });
    expect(r.cities).toEqual([{ id: "5103403", label: "Cuiabá", count: 10 }]);
    expect(r.others).toBeNull();
    expect(r.partial).toBe(true); // Sinop (1 escola) não pode ser mostrado nem nomeado nem agregado
    expect(r.total).toBe(10);
  });
});
