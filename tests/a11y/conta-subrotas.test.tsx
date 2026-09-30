// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAccess = vi.fn();
const getSessionActor = vi.fn();
vi.mock("@/features/auth/guard", () => ({ requireAccess: (...a: unknown[]) => requireAccess(...a) }));
vi.mock("@/features/auth/actor", () => ({ getSessionActor: () => getSessionActor() }));
vi.mock("@/features/privacy/queries", () => ({ listMyConsents: vi.fn().mockResolvedValue([]), REVOCABLE_CONSENT_PURPOSES: ["list_upload"] }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/app/conta/privacidade/actions", () => ({ revokeConsentAction: vi.fn(), deleteAccountAction: vi.fn() }));
vi.mock("@/features/notifications/queries", () => ({
  listNotifications: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  unreadCount: vi.fn().mockResolvedValue(0),
  listPreferences: vi.fn().mockResolvedValue([]),
  listWatches: vi.fn().mockResolvedValue([]),
  activePushCount: vi.fn().mockResolvedValue(0),
  PAGE_SIZE: 20,
}));
vi.mock("@/app/conta/notificacoes/actions", () => ({
  markAllReadAction: vi.fn(),
  markReadAction: vi.fn(),
  savePreferenceAction: vi.fn(),
  subscribePushAction: vi.fn(),
  unsubscribePushAction: vi.fn(),
  unwatchFormAction: vi.fn(),
}));

import NotificationsPage from "@/app/conta/notificacoes/page";
import PrivacyPage from "@/app/conta/privacidade/page";

beforeEach(() => {
  requireAccess.mockReset().mockResolvedValue({ user: { id: "u1", email: "f@x.test" }, role: "parent" });
  getSessionActor.mockReset().mockResolvedValue({ userId: "u1" });
});

describe("subrotas de /conta com Voltar e título · UX-049", () => {
  it("/conta/notificacoes: Voltar à conta, h1 e central identificada", async () => {
    render(await NotificationsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("link", { name: "Voltar" })).toHaveAttribute("href", "/conta");
    expect(screen.getByRole("heading", { level: 1, name: "Notificações" })).toBeInTheDocument();
    expect(document.getElementById("central")).not.toBeNull();
  });

  it("/conta/notificacoes: a família não vê eventos de papelaria nem de escola nas preferências", async () => {
    render(await NotificationsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByText("Novo pedido de cotação")).toBeNull();
    expect(screen.queryByText(/pedido para administrar/i)).toBeNull();
  });

  it("/conta/notificacoes: papelaria vê o pedido de cotação", async () => {
    requireAccess.mockResolvedValue({ user: { id: "u1", email: "p@x.test" }, role: "stationery_member" });
    render(await NotificationsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Novo pedido de cotação")).toBeInTheDocument();
  });

  it("/conta/privacidade: Voltar à conta e a política com nome de marca, não com o caminho", async () => {
    render(await PrivacyPage());
    expect(screen.getByRole("link", { name: "Voltar" })).toHaveAttribute("href", "/conta");
    expect(screen.getByRole("heading", { level: 1, name: "Privacidade e dados" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Política de Privacidade" })).toHaveAttribute("href", "/privacidade");
    expect(screen.queryByText("/privacidade")).toBeNull();
    expect(screen.getByRole("link", { name: "Baixar meus dados" })).toHaveAttribute("href", "/api/conta/exportar");
  });

  it("/conta/privacidade: uma só ação principal (baixar) e a exclusão em contorno de perigo", async () => {
    render(await PrivacyPage());
    const primaries = [...document.querySelectorAll("a.bg-tinta, button.bg-tinta")];
    expect(primaries.map((e) => e.textContent)).toEqual(["Baixar meus dados"]);
  });
});
