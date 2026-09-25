import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSchoolClaimContext = vi.fn();
const getMyClaimForSchool = vi.fn();
const getClaimStatusView = vi.fn();
const getClaimForAdmin = vi.fn();
const listClaimQueue = vi.fn();
vi.mock("@/features/claims/queries", () => ({
  getSchoolClaimContext: (...a: unknown[]) => getSchoolClaimContext(...a),
  getMyClaimForSchool: (...a: unknown[]) => getMyClaimForSchool(...a),
  getClaimStatusView: (...a: unknown[]) => getClaimStatusView(...a),
  getClaimForAdmin: (...a: unknown[]) => getClaimForAdmin(...a),
  listClaimQueue: (...a: unknown[]) => listClaimQueue(...a),
}));
const getSessionActor = vi.fn();
vi.mock("@/features/auth/actor", () => ({ getSessionActor: () => getSessionActor() }));
vi.mock("@/features/auth/queries", () => ({ getCurrentUser: vi.fn().mockResolvedValue({ email: "parent@listacerta.test" }) }));
const requireAccess = vi.fn();
vi.mock("@/features/auth/guard", () => ({ requireAccess: (...a: unknown[]) => requireAccess(...a) }));
const confirmTokenAction = vi.fn();
vi.mock("@/app/escolas/[inep]/reivindicar/confirmar/actions", () => ({ confirmTokenAction: (...a: unknown[]) => confirmTokenAction(...a) }));
vi.mock("@/app/escolas/[inep]/reivindicar/actions", () => ({
  createClaimAction: vi.fn(), removeEvidenceAction: vi.fn(), requestTokenAction: vi.fn(), submitClaimAction: vi.fn(), uploadEvidenceAction: vi.fn(),
}));
vi.mock("@/app/admin/reivindicacoes/actions", () => ({ decideClaimAction: vi.fn() }));
vi.mock("@/features/claims/queries-mine", () => ({ listMySchools: vi.fn().mockResolvedValue([]), listMyPendingClaims: vi.fn().mockResolvedValue([]) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/",
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import ConfirmPage from "@/app/escolas/[inep]/reivindicar/confirmar/page";
import ClaimPage from "@/app/escolas/[inep]/reivindicar/page";
import AdminDetail from "@/app/admin/reivindicacoes/[id]/page";
import AdminQueue from "@/app/admin/reivindicacoes/page";
import SchoolPanel from "@/app/escola/page";

const TOKEN = "A".repeat(43);
const context = {
  school: { id: "33333333-3333-4333-8333-333333333333", inep: "99001003", name: "Escola Demonstração 3", municipality: "Cuiabá", verificationStatus: "registered", isDemo: true },
  blockedReason: null,
  methods: { institutional_email: { available: true }, institutional_whatsapp: { available: true }, documents: { available: true } },
};
const parent = { userId: "u1", role: "parent" };
const sp = (o: Record<string, string> = {}) => Promise.resolve(o);
const props = (inep = "99001003") => ({ params: Promise.resolve({ inep }), searchParams: sp({ token: TOKEN }) });

beforeEach(() => {
  for (const f of [getSchoolClaimContext, getMyClaimForSchool, getClaimStatusView, getClaimForAdmin, listClaimQueue, getSessionActor, requireAccess, confirmTokenAction]) f.mockReset();
  getSchoolClaimContext.mockResolvedValue(context);
  getSessionActor.mockResolvedValue(parent);
  requireAccess.mockResolvedValue({ user: { email: "x@listacerta.test" }, role: "admin" });
});

describe("/escolas/[inep]/reivindicar/confirmar", () => {
  it("GET só mostra o botão e não consome o token", async () => {
    render(await ConfirmPage(props()));
    expect(screen.getByRole("button", { name: "Confirmar e-mail da escola" })).toBeInTheDocument();
    expect(confirmTokenAction).not.toHaveBeenCalled();
  });
  it("sem sessão vai ao login preservando o token em next", async () => {
    getSessionActor.mockResolvedValue(null);
    await expect(ConfirmPage(props())).rejects.toThrow(`REDIRECT:/entrar?next=${encodeURIComponent(`/escolas/99001003/reivindicar/confirmar?token=${TOKEN}`)}`);
  });
  it("escola inexistente é 404; token malformado mostra 'Link inválido'", async () => {
    getSchoolClaimContext.mockResolvedValue(null);
    await expect(ConfirmPage(props("99999999"))).rejects.toThrow("NOT_FOUND");
    getSchoolClaimContext.mockResolvedValue(context);
    render(await ConfirmPage({ params: Promise.resolve({ inep: "99001003" }), searchParams: sp({ token: "curto" }) }));
    expect(screen.getByText(/Link inválido/)).toBeInTheDocument();
  });
});

describe("/escolas/[inep]/reivindicar", () => {
  const p = (q: Record<string, string> = {}) => ({ params: Promise.resolve({ inep: "99001003" }), searchParams: sp(q) });
  it("sem sessão vai ao login com next; escola inexistente é 404", async () => {
    getSessionActor.mockResolvedValue(null);
    await expect(ClaimPage(p())).rejects.toThrow(`REDIRECT:/entrar?next=${encodeURIComponent("/escolas/99001003/reivindicar")}`);
    getSchoolClaimContext.mockResolvedValue(null);
    await expect(ClaimPage(p())).rejects.toThrow("NOT_FOUND");
  });
  it("reivindicação alheia (consulta devolve null) mostra o formulário, sem dado de terceiros", async () => {
    getMyClaimForSchool.mockResolvedValue(null);
    render(await ClaimPage(p()));
    expect(screen.getByRole("heading", { level: 1, name: "Reivindicar escola" })).toBeInTheDocument();
    expect(getClaimStatusView).not.toHaveBeenCalled();
  });
});

describe("/admin/reivindicacoes", () => {
  it("fila e detalhe passam pelo guard de /admin/reivindicacoes", async () => {
    requireAccess.mockRejectedValue(new Error("REDIRECT:/403"));
    await expect(AdminQueue({ searchParams: sp() })).rejects.toThrow("REDIRECT:/403");
    await expect(AdminDetail({ params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) })).rejects.toThrow("REDIRECT:/403");
    expect(requireAccess).toHaveBeenCalledWith("/admin/reivindicacoes");
    expect(listClaimQueue).not.toHaveBeenCalled();
    expect(getClaimForAdmin).not.toHaveBeenCalled();
  });
  it("detalhe: id inválido e reivindicação inexistente são 404", async () => {
    await expect(AdminDetail({ params: Promise.resolve({ id: "x" }) })).rejects.toThrow("NOT_FOUND");
    getClaimForAdmin.mockResolvedValue(null);
    await expect(AdminDetail({ params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) })).rejects.toThrow("NOT_FOUND");
  });
});

describe("/escola", () => {
  it("passa pelo guard de /escola", async () => {
    requireAccess.mockRejectedValue(new Error("REDIRECT:/403"));
    await expect(SchoolPanel()).rejects.toThrow("REDIRECT:/403");
    expect(requireAccess).toHaveBeenCalledWith("/escola");
  });
});
