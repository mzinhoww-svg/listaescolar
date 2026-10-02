import { describe, expect, it } from "vitest";

import { PRICE_SOURCES, SOURCE_LABEL, sourceLabel } from "@/components/cart/format";

describe("sourceLabel (revisão UX I2)", () => {
  it.each(PRICE_SOURCES)("toda origem conhecida (%s) tem rótulo em pt-BR, sem código técnico", (source) => {
    const label = sourceLabel(source);
    expect(SOURCE_LABEL[source]).toBe(label);
    expect(label).not.toBe(source);
    expect(label).not.toMatch(/[_:]/);
    expect(label.length).toBeGreaterThan(3);
  });

  it("mapeia a origem da papelaria", () => {
    expect(sourceLabel("informed_by_stationery")).toBe("informado pela papelaria");
  });

  it("feed de loja e origem desconhecida não vazam o código", () => {
    expect(sourceLabel("retailer_feed:acme")).toBe("informado pela loja");
    expect(sourceLabel("qualquer_coisa_nova")).toBe("fonte informada");
  });
});
