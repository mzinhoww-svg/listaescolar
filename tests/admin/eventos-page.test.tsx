// Revisão de segurança (S16): auditFilterSchema precisa ser aplicado de fato — filtro inválido vira mensagem
// clara, sem nunca chamar searchAuditLog com dado ruim (que geraria um erro genérico de banco).
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAccess = vi.fn();
vi.mock("@/features/auth/guard", () => ({ requireAccess: (...a: unknown[]) => requireAccess(...a) }));

const getSessionActor = vi.fn();
vi.mock("@/features/auth/actor", () => ({ getSessionActor: () => getSessionActor() }));

const searchAuditLog = vi.fn();
vi.mock("@/features/admin/audit", async () => {
  const actual = await vi.importActual<typeof import("@/features/admin/audit")>("@/features/admin/audit");
  return { ...actual, searchAuditLog: (...a: unknown[]) => searchAuditLog(...a) };
});

import EventosPage from "@/app/admin/eventos/page";

const ACTOR = { userId: "11111111-1111-4111-8111-111111111111", role: "admin" };
const sp = (o: Record<string, string> = {}) => Promise.resolve(o);

beforeEach(() => {
  requireAccess.mockReset().mockResolvedValue({ user: { email: "admin@listacerta.test" }, role: "admin" });
  getSessionActor.mockReset().mockResolvedValue(ACTOR);
  searchAuditLog.mockReset().mockResolvedValue({ rows: [], hasNext: false, page: 1, pageSize: 50 });
});

describe("/admin/eventos (Admin08-Eventos)", () => {
  it("filtro válido: chama searchAuditLog com os dados", async () => {
    render(await EventosPage({ searchParams: sp({ entidade: "reports" }) }));
    expect(searchAuditLog).toHaveBeenCalledWith(ACTOR, { entityTable: "reports" }, { page: 1 });
    expect(screen.getByText("Nenhum evento com este filtro.")).toBeInTheDocument();
  });

  it("entidadeId inválido (não é uuid): mensagem clara de filtro inválido, sem chamar o banco", async () => {
    render(await EventosPage({ searchParams: sp({ entidadeId: "não-é-um-uuid" }) }));
    expect(searchAuditLog).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Filtro inválido");
  });

  it("data 'de' fora do formato: mesma mensagem clara, sem erro genérico", async () => {
    render(await EventosPage({ searchParams: sp({ de: "01/09/2026" }) }));
    expect(searchAuditLog).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Filtro inválido");
  });

  const row = (o: Record<string, unknown> = {}) => ({
    id: "22222222-2222-4222-8222-222222222222", action: "UPDATE", entityTable: "stationeries", entityId: "33333333-3333-4333-8333-333333333333",
    before: { status: "under_review", updated_at: "a" }, after: { status: "approved", updated_at: "b" },
    actorId: "44444444-4444-4444-8444-444444444444", actorRole: "admin", actorName: "Ana Souza", createdAt: new Date("2026-09-29T12:00:00Z"), ...o,
  });

  it("mostra quem decidiu (nome e papel), ação e tabela em português e o que mudou, sem UPDATE/JSON cru", async () => {
    searchAuditLog.mockResolvedValue({ rows: [row()], hasNext: false, page: 1, pageSize: 50 });
    render(await EventosPage({ searchParams: sp() }));
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(screen.getByText("Equipe")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(table).toHaveTextContent("Alterado");
    expect(table).toHaveTextContent("Papelaria");
    expect(table).toHaveTextContent("Em revisão");
    expect(table).toHaveTextContent("Aprovada");
    expect(table).not.toHaveTextContent("UPDATE");
    expect(table).not.toHaveTextContent("under_review");
    expect(table).not.toHaveTextContent("{");
  });

  it("linha sem ator aparece como ação automática do sistema", async () => {
    searchAuditLog.mockResolvedValue({ rows: [row({ actorId: null, actorRole: "system", actorName: null })], hasNext: false, page: 1, pageSize: 50 });
    render(await EventosPage({ searchParams: sp() }));
    expect(screen.getByText("Sistema")).toBeInTheDocument();
    expect(screen.getByText("Ação automática")).toBeInTheDocument();
  });

  it("filtros usam rótulos em português em vez de UPDATE/school_lists como exemplo", async () => {
    render(await EventosPage({ searchParams: sp() }));
    expect(screen.queryByPlaceholderText("UPDATE")).toBeNull();
    expect(screen.queryByPlaceholderText("school_lists")).toBeNull();
    expect(screen.getByLabelText("Ação")).toBeInTheDocument();
    expect(screen.getByLabelText("Tabela")).toBeInTheDocument();
  });

  it("paginação: pede a página da URL e oferece Anterior/Próxima mantendo os filtros", async () => {
    searchAuditLog.mockResolvedValue({ rows: [row()], hasNext: true, page: 2, pageSize: 50 });
    render(await EventosPage({ searchParams: sp({ pagina: "2", entidade: "stationeries" }) }));
    expect(searchAuditLog).toHaveBeenCalledWith(ACTOR, { entityTable: "stationeries" }, { page: 2 });
    expect(screen.getByRole("link", { name: /Próxima página/ })).toHaveAttribute("href", "/admin/eventos?entidade=stationeries&pagina=3");
    expect(screen.getByRole("link", { name: /Página anterior/ })).toHaveAttribute("href", "/admin/eventos?entidade=stationeries&pagina=1");
    expect(screen.getByText(/Página 2/)).toBeInTheDocument();
  });

  it("primeira página sem mais resultados: sem links de paginação", async () => {
    searchAuditLog.mockResolvedValue({ rows: [row()], hasNext: false, page: 1, pageSize: 50 });
    render(await EventosPage({ searchParams: sp() }));
    expect(screen.queryByRole("link", { name: /Próxima página/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Página anterior/ })).toBeNull();
  });

  it("página inválida cai na primeira", async () => {
    render(await EventosPage({ searchParams: sp({ pagina: "abc" }) }));
    expect(searchAuditLog).toHaveBeenCalledWith(ACTOR, {}, { page: 1 });
  });
});
