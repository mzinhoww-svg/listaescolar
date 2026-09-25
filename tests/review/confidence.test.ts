import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { confidenceBand } from "@/features/review/confidence";

const settings = { confidenceThreshold: 0.8, itemConfidenceThreshold: 0.6 };

describe("confidenceBand", () => {
  it("faixas vêm dos limiares das settings; o limiar é a fronteira", () => {
    expect(confidenceBand({ confidence: 0.95, origin: "extracted" }, settings)).toBe("alta");
    expect(confidenceBand({ confidence: 0.8, origin: "extracted" }, settings)).toBe("alta");
    expect(confidenceBand({ confidence: 0.79, origin: "extracted" }, settings)).toBe("media");
    expect(confidenceBand({ confidence: 0.6, origin: "extracted" }, settings)).toBe("media");
    expect(confidenceBand({ confidence: 0.59, origin: "extracted" }, settings)).toBe("baixa");
    expect(confidenceBand({ confidence: 0.1, origin: "extracted" }, { confidenceThreshold: 0.2, itemConfidenceThreshold: 0.15 })).toBe("baixa");
    expect(confidenceBand({ confidence: 0.5, origin: "extracted" }, { confidenceThreshold: 0.4, itemConfidenceThreshold: 0.3 })).toBe("alta");
  });
  it("sem settings ou sem confiança: indisponível; item editado ou adicionado: conferido", () => {
    expect(confidenceBand({ confidence: 0.9, origin: "extracted" }, null)).toBe("indisponivel");
    expect(confidenceBand({ confidence: null, origin: "extracted" }, settings)).toBe("indisponivel");
    expect(confidenceBand({ confidence: 0.2, origin: "edited" }, settings)).toBe("conferido");
    expect(confidenceBand({ confidence: null, origin: "added" }, null)).toBe("conferido");
  });
  it("nenhum limiar decimal fixo no código (confidence.ts e gate.ts)", () => {
    for (const f of ["features/review/confidence.ts", "features/review/gate.ts"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/\b0\.\d+\b/);
    }
  });
});
