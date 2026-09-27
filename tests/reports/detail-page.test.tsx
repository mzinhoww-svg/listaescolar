// D-153 (S18): o `<select name="resolution">`, o campo de nota e os botões Resolver/Arquivar sem ação ficam
// desabilitados enquanto a denúncia está `open` (a única transição válida ali é "Colocar em análise"; o servidor
// já ignora `resolution` nesse status, mas a tela não deveria sugerir uma escolha ainda sem efeito).
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAccess = vi.fn();
vi.mock("@/features/auth/guard", () => ({ requireAccess: (...a: unknown[]) => requireAccess(...a) }));

const getSessionActor = vi.fn();
vi.mock("@/features/auth/actor", () => ({ getSessionActor: () => getSessionActor() }));

const getById = vi.fn();
vi.mock("@/features/reports/wiring", () => ({ getReportsService: async () => ({ getById: (...a: unknown[]) => getById(...a) }) }));

vi.mock("@/features/admin/list-lookup", () => ({ getListSummaryForAdmin: async () => null }));

import DenunciaDetailPage from "@/app/admin/denuncias/[id]/page";

const ACTOR = { userId: "11111111-1111-4111-8111-111111111111", role: "admin" };
const ID = "22222222-2222-4222-8222-222222222222";
const params = () => Promise.resolve({ id: ID });
const sp = () => Promise.resolve({});

const BASE_REPORT = {
  id: ID,
  targetType: "school_list" as const,
  targetId: "33333333-3333-4333-8333-333333333333",
  reason: "spam" as const,
  detailCode: null,
  reporterId: "44444444-4444-4444-8444-444444444444",
  resolution: null,
  resolutionNote: null,
  resolvedBy: null,
  resolvedAt: null,
  createdAt: new Date("2026-09-01T00:00:00Z"),
};

beforeEach(() => {
  requireAccess.mockReset().mockResolvedValue({ user: { email: "admin@listacerta.test" }, role: "admin" });
  getSessionActor.mockReset().mockResolvedValue(ACTOR);
  getById.mockReset();
});

describe("/admin/denuncias/[id]", () => {
  it("status open: campos de resolução desabilitados (só 'Colocar em análise' é válido)", async () => {
    getById.mockResolvedValue({ ...BASE_REPORT, status: "open" });
    render(await DenunciaDetailPage({ params: params(), searchParams: sp() }));
    expect(screen.getByLabelText("Procede?")).toBeDisabled();
    expect(screen.getByLabelText("Código da resolução (opcional, sem prosa)")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Resolver" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Arquivar sem ação" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Colocar em análise" })).toBeEnabled();
  });

  it("status reviewing: campos de resolução habilitados", async () => {
    getById.mockResolvedValue({ ...BASE_REPORT, status: "reviewing" });
    render(await DenunciaDetailPage({ params: params(), searchParams: sp() }));
    expect(screen.getByLabelText("Procede?")).toBeEnabled();
    expect(screen.getByLabelText("Código da resolução (opcional, sem prosa)")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Resolver" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Arquivar sem ação" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Colocar em análise" })).not.toBeInTheDocument();
  });
});
