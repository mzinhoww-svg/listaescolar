import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const getOwnerContext = vi.fn();
vi.mock("@/features/stationeries/session", () => ({ getOwnerContext: (...a: unknown[]) => getOwnerContext(...a) }));
vi.mock("@/features/leads/queries", () => ({ listStationeryLeads: vi.fn(async () => ({ rows: [] })) }));
vi.mock("@/features/stationeries/queries", () => ({
  countCatalogItems: vi.fn(async () => 0),
  listOwnAreas: vi.fn(async () => []),
  listStatusEvents: vi.fn(async () => []),
}));
vi.mock("@/app/papelaria/actions", () => ({ ownerStatusAction: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/papelaria" }));

import Page from "@/app/papelaria/page";

const own = (status: string) => ({
  actor: { userId: "u", role: "stationery_member" },
  stationery: { id: "1", status, tradeName: "Papelaria Demo", slug: "demo", statusReason: null },
});

describe("UX-076 · Pausar a papelaria", () => {
  it("pausar passa por diálogo com o efeito escrito; Publicar e Reativar continuam diretos", async () => {
    getOwnerContext.mockResolvedValue(own("active"));
    const { container, unmount } = render(await Page({ searchParams: Promise.resolve({}) }));
    const dialog = container.querySelector("dialog")!;
    expect(dialog.textContent).toMatch(/Pausar a papelaria\?/);
    expect(dialog.textContent).toMatch(/não recebe novos pedidos/);
    expect(dialog.querySelector('input[name="to"][value="paused"]')).not.toBeNull();
    // o gatilho fora do diálogo não envia sozinho: é `type=button`
    expect(screen.getByRole("button", { name: "Pausar papelaria" })).toHaveAttribute("type", "button");
    expect(within(dialog).getByRole("button", { name: "Cancelar", hidden: true })).toBeInTheDocument();
    unmount();
    getOwnerContext.mockResolvedValue(own("paused"));
    const again = render(await Page({ searchParams: Promise.resolve({}) }));
    expect(again.container.querySelector("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Reativar" })).toHaveAttribute("type", "submit");
  });
});
