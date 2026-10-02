import { describe, expect, it } from "vitest";

import { SITE_COPY } from "@/features/site/copy";

describe("promessa alinhada ao piloto (revisão UX I8)", () => {
  it("o hero promete lista oficial + pedir preço à papelaria do bairro; comparação só com preço de loja", () => {
    const lead = SITE_COPY.hero.lead;
    expect(lead).toMatch(/lista oficial/i);
    expect(lead).toMatch(/papelaria do bairro/i);
    expect(lead).toMatch(/quando houver preço de loja/i);
  });

  it("o cartão ilustrativo não sugere preço nem 'mais barato'", () => {
    const card = [SITE_COPY.hero.cardFoot, SITE_COPY.hero.cardPrice, SITE_COPY.hero.cardTag].join(" ");
    expect(card).not.toMatch(/mais barato|R\$|menor preço|econom/i);
    expect(SITE_COPY.hero.cardPrice).toMatch(/sem preço/i);
  });

  it("'Para pais' e 'Como funciona' só falam em comparar quando há preço de loja", () => {
    const parents = SITE_COPY.parents.items.map((i) => i.text).join(" ");
    const steps = SITE_COPY.steps.items.map((i) => i.text).join(" ");
    for (const t of [parents, steps]) {
      expect(t).toMatch(/quando houver preço de loja/i);
      expect(t).not.toMatch(/mais barato|menos lojas/i);
    }
    expect(SITE_COPY.how.steps[1]?.screen.head).not.toMatch(/Mais barato/i);
  });
});
