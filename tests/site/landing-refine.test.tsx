import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/site/channels", () => ({ getPurchaseChannels: vi.fn() }));

import { getPurchaseChannels } from "@/features/site/channels";

import { CHANNELS, loadPage, renderInSite } from "./helpers";

const channels = vi.mocked(getPurchaseChannels);

describe("landing refinada (M10)", () => {
  beforeEach(() => {
    channels.mockResolvedValue({ ...CHANNELS, hasStationeries: true });
  });

  it("diz o escopo do piloto junto da busca", async () => {
    const Page = await loadPage("/");
    const { container } = await renderInSite(Page);
    expect(container.textContent).toContain("Piloto em Cuiabá, MT");
  });

  it("nenhum elemento animado existe sem motion-reduce", async () => {
    const Page = await loadPage("/");
    const { container } = await renderInSite(Page);
    const animated = container.querySelectorAll('[class*="reveal"], [class*="tick-loop"], [class*="animate-"]');
    expect(animated.length).toBeGreaterThan(0);
    for (const el of animated) expect(el.getAttribute("class")).toContain("motion-reduce:");
  });

  it("não mostra nomes de varejistas sem parceria real", async () => {
    const Page = await loadPage("/");
    const { container } = await renderInSite(Page);
    expect(container.textContent).not.toContain("Amazon");
    expect(container.textContent).not.toContain("Kalunga");
    expect(container.textContent).toContain("Papelarias do bairro");
  });
});
