import { describe, expect, it } from "vitest";

import { neighborhoodLabel, normalizeNeighborhood } from "@/features/stationeries/neighborhood";

describe("normalizeNeighborhood (única normalização de bairro)", () => {
  it.each([
    ["  Jardim   Tropical ", "jardim tropical"],
    ["São José", "sao jose"],
    ["SAO JOSE", "sao jose"],
    ["Coxipó da Ponte", "coxipo da ponte"],
    ["Cidade Alta", "cidade alta"],
    ["", ""],
  ])("%j -> %j", (input, expected) => {
    expect(normalizeNeighborhood(input)).toBe(expected);
  });
  it("é idempotente", () => {
    expect(normalizeNeighborhood(normalizeNeighborhood("Ãgua Ções"))).toBe("agua coes");
  });
  it("neighborhoodLabel preserva a caixa e os acentos, só arruma espaços", () => {
    expect(neighborhoodLabel("  São   José ")).toBe("São José");
  });
});
