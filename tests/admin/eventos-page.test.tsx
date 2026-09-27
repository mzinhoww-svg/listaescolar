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
  searchAuditLog.mockReset().mockResolvedValue([]);
});

describe("/admin/eventos (Admin08-Eventos)", () => {
  it("filtro válido: chama searchAuditLog com os dados", async () => {
    render(await EventosPage({ searchParams: sp({ entidade: "reports" }) }));
    expect(searchAuditLog).toHaveBeenCalledWith(ACTOR, { entityTable: "reports" });
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
});
