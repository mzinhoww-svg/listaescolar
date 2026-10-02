import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CATALOG_LABELS, SERIES_OPTIONS } from "@/components/submissions/series-options";
import { SeriesFields } from "@/components/submissions/SeriesFields";
import { STAGE_LABEL } from "@/features/grades/catalog";
import { GRADE_OPTIONS } from "@/features/submissions/copy";

describe("rótulos de série unificados (revisão UX, menores)", () => {
  it("o valor enviado continua o de GRADE_OPTIONS", () => {
    expect(SERIES_OPTIONS.map((o) => o.value)).toEqual([...GRADE_OPTIONS]);
  });

  it("ensino fundamental e médio usam os mesmos rótulos do catálogo da página da escola", () => {
    for (const o of SERIES_OPTIONS.filter((x) => x.stage !== "ei")) expect(CATALOG_LABELS.has(o.label), o.label).toBe(true);
  });

  it("o seletor agrupa pelas mesmas etapas da página da escola", () => {
    render(<SeriesFields years={[2026, 2027]} defaultYear={2027} />);
    const select = screen.getByLabelText("Série");
    for (const label of Object.values(STAGE_LABEL)) expect(within(select).getByRole("group", { name: label })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "3ª série" })).toHaveValue("3ª série do ensino médio");
    expect(within(select).getByRole("option", { name: "Escolha a série" })).toBeInTheDocument();
  });
});
