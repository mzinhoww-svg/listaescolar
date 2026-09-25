import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReviewSummary } from "@/components/submissions/ReviewSummary";
import { WARNING_LOW_CONFIDENCE } from "@/features/extraction";

const base = {
  items: [
    {
      name: "Caderno",
      quantity: 2,
      unit: "un",
      confidence: 0.4,
      alerts: ["low_confidence_item" as const],
    },
  ],
  overallConfidence: 0.4,
};

describe("ReviewSummary com confiança baixa (S08)", () => {
  it("baixa confiança vira alerta visível e o item mostra a sinalização", () => {
    render(
      <ReviewSummary
        isDemo={false}
        result={{
          ...base,
          warnings: [WARNING_LOW_CONFIDENCE],
          lowConfidence: true,
          requiresReview: true,
        }}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("revisão obrigatória");
    expect(screen.getByText("leitura incerta")).toBeTruthy();
  });
  it("role alert só no aviso de baixa confiança, não em todos os avisos", () => {
    render(
      <ReviewSummary
        isDemo={false}
        result={{ ...base, warnings: [WARNING_LOW_CONFIDENCE, "outro aviso"], lowConfidence: true, requiresReview: true }}
      />,
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByText("outro aviso").getAttribute("role")).toBeNull();
  });
  it("sem baixa confiança nem crítico: avisos discretos, sem role alert", () => {
    render(<ReviewSummary isDemo={false} result={{ ...base, warnings: ["aviso qualquer"] }} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("ReviewSummary: aviso de revisão não duplica o estado de publicação", () => {
  const REVIEW = "Sua lista passa por revisão antes de aparecer para outras famílias.";
  it("human_review com estado: mostra só o estado, sem o aviso duplicado", () => {
    render(<ReviewSummary isDemo={false} status="human_review" result={{ ...base, warnings: [] }} />);
    expect(screen.getByTestId("publication-state")).toBeTruthy();
    expect(screen.queryByText(REVIEW)).toBeNull();
  });
  it("sem estado de publicação: o aviso continua", () => {
    render(<ReviewSummary isDemo={false} result={{ ...base, warnings: [] }} />);
    expect(screen.getByText(REVIEW)).toBeTruthy();
  });
});
