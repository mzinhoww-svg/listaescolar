import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AiCostPanel } from "@/components/admin/AiCostPanel";
import { costPanelStats } from "@/features/ai-settings/cost";
import { updateAiSettingsSchema } from "@/features/ai-settings/schemas";

const row = (usd: number, unknown = 0) => ({ providerCostUsdMicros: usd, unknownCostRows: unknown });

describe("costPanelStats", () => {
  it("média, p95 (posto mais próximo) e máximo só das listas com custo completo", () => {
    const rows = Array.from({ length: 20 }, (_, i) => row((i + 1) * 100_000)); // US$ 0,10 a 2,00
    const s = costPanelStats(rows, 5);
    expect(s.lists).toBe(20);
    expect(s.completeLists).toBe(20);
    expect(s.partialLists).toBe(0);
    expect(s.usdMicros).toEqual({ mean: 1_050_000, p95: 1_900_000, max: 2_000_000 });
    expect(s.brlCents).toEqual({ mean: 525, p95: 950, max: 1000 });
    expect(s.rate).toBe(5);
  });

  it("lista com linha sem custo é parcial: fica fora das médias e é contada à parte", () => {
    const s = costPanelStats([row(1_000_000), row(9_000_000, 1), row(3_000_000)], 5);
    expect(s.completeLists).toBe(2);
    expect(s.partialLists).toBe(1);
    expect(s.usdMicros).toEqual({ mean: 2_000_000, p95: 3_000_000, max: 3_000_000 });
  });

  it("sem taxa: dólar conhecido e reais indisponíveis (null, não zero)", () => {
    const s = costPanelStats([row(1_000_000)], null);
    expect(s.usdMicros).toEqual({ mean: 1_000_000, p95: 1_000_000, max: 1_000_000 });
    expect(s.brlCents).toBeNull();
    expect(s.rate).toBeNull();
  });

  it("sem lista completa: tudo indisponível", () => {
    for (const rows of [[], [row(0, 2)]]) {
      const s = costPanelStats(rows, 5);
      expect(s.usdMicros).toBeNull();
      expect(s.brlCents).toBeNull();
    }
  });

  it("custo zero informado é zero de verdade (grátis), diferente de indisponível", () => {
    const s = costPanelStats([row(0)], 5);
    expect(s.usdMicros).toEqual({ mean: 0, p95: 0, max: 0 });
    expect(s.brlCents).toEqual({ mean: 0, p95: 0, max: 0 });
  });
});

describe("AiCostPanel", () => {
  it("mostra média, p95, máximo, listas parciais e a taxa em uso", () => {
    const stats = costPanelStats([row(1_000_000), row(3_000_000), row(1_000_000, 1)], 5.5);
    render(<AiCostPanel stats={stats} />);
    const region = screen.getByRole("region", { name: /custo de ia por lista/i });
    const t = region.textContent ?? "";
    expect(t).toMatch(/R\$\s*11,00/); // média US$ 2,00 a 5,50
    expect(t).toMatch(/R\$\s*16,50/); // p95 = máximo US$ 3,00
    expect(t).toMatch(/US\$\s*2,00/);
    expect(t).toMatch(/1 lista com custo parcial/i);
    expect(t).toMatch(/5,5000/);
    expect(t).toMatch(/Meta.*R\$\s*0,50/);
  });

  it("sem taxa: 'BRL indisponível', dólar visível, nenhum R$ inventado", () => {
    render(<AiCostPanel stats={costPanelStats([row(1_000_000)], null)} />);
    const t = screen.getByRole("region", { name: /custo de ia por lista/i }).textContent ?? "";
    expect(t).toMatch(/BRL indisponível/i);
    expect(t).toMatch(/US\$\s*1,00/);
    expect(t).not.toMatch(/R\$\s*\d/);
  });

  it("sem uso registrado: 'indisponível' com o motivo, nunca zero", () => {
    render(<AiCostPanel stats={costPanelStats([], 5)} />);
    const t = screen.getByRole("region", { name: /custo de ia por lista/i }).textContent ?? "";
    expect(t).toMatch(/indisponível/i);
    expect(t).toMatch(/nenhuma lista com custo informado pelo provedor/i);
    expect(t).not.toMatch(/R\$\s*0,00/);
    expect(t).not.toMatch(/US\$\s*0,00/);
  });

  it("falha ao carregar: aviso, sem números", () => {
    render(<AiCostPanel stats={null} />);
    expect(screen.getByRole("region", { name: /custo de ia por lista/i }).textContent).toMatch(/indisponível/i);
  });
});

describe("taxa de câmbio no formulário de IA", () => {
  const ok = { confidenceThreshold: "0.8", itemConfidenceThreshold: "0.7", maxEscalations: "1", pipelineVersion: "v1" };
  it("vazio vira nulo; positivo passa; zero, negativo e lixo são recusados", () => {
    expect(updateAiSettingsSchema.parse({ ...ok, usdBrlRate: "" }).usdBrlRate).toBeNull();
    expect(updateAiSettingsSchema.parse(ok).usdBrlRate).toBeNull();
    expect(updateAiSettingsSchema.parse({ ...ok, usdBrlRate: "5,4321" }).usdBrlRate).toBe(5.4321);
    expect(updateAiSettingsSchema.parse({ ...ok, usdBrlRate: "5.5" }).usdBrlRate).toBe(5.5);
    for (const bad of ["0", "-1", "abc", "10000", "1,2,3"]) {
      expect(updateAiSettingsSchema.safeParse({ ...ok, usdBrlRate: bad }).success, bad).toBe(false);
    }
  });
});
