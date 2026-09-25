import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAccess = vi.hoisted(() => vi.fn());
const getSessionActor = vi.hoisted(() => vi.fn());
const getReviewQueue = vi.hoisted(() => vi.fn());
const getReviewDetail = vi.hoisted(() => vi.fn());
const service = vi.hoisted(() => ({ open: vi.fn(), blockers: vi.fn() }));
const loaders = vi.hoisted(() => ({ loadThresholds: vi.fn(), loadSchoolLabels: vi.fn() }));
vi.mock("@/features/auth/guard", () => ({ requireAccess: (...a: unknown[]) => requireAccess(...a) }));
vi.mock("@/features/auth/actor", () => ({ getSessionActor: () => getSessionActor() }));
vi.mock("@/features/review/queries", () => ({ getReviewQueue: (...a: unknown[]) => getReviewQueue(...a), getReviewDetail: (...a: unknown[]) => getReviewDetail(...a) }));
vi.mock("@/app/admin/revisao/loaders", () => ({ ...loaders, buildReviewService: () => service }));
vi.mock("@/app/admin/revisao/actions", () => ({ saveReviewAction: vi.fn(), approveAndPublishAction: vi.fn(), publishAction: vi.fn(), rejectAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/",
  redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));

import Detail from "@/app/admin/revisao/[id]/page";
import Queue from "@/app/admin/revisao/page";

const ID = "3f2b8c1e-5d4a-4b6f-9c3d-1a2b3c4d5e6f";
const SCHOOL = "50000000-0000-4000-8000-0000000000c1";
const ME = "aaaaaaaa-5d4a-4b6f-9c3d-1a2b3c4d5e6f";
const HOSTILE = "<img src=x onerror=alert(1)>";
const item = (o: Record<string, unknown> = {}) => ({ name: "Caderno", quantity: 2, unit: null, category: "papelaria", confidence: 0.9, alerts: [], origin: "extracted", ...o });
const row = (o: Record<string, unknown> = {}) => ({ id: ID, source: "parent", schoolId: SCHOOL, grade: "4º ano", schoolYear: 2027, isDemo: true, createdAt: "2026-09-25T12:00:00Z", itemCount: 3, reasons: ["critical_alert", "item_without_quantity", "item_flagged"], state: null, ...o });
const detail = (o: Record<string, unknown> = {}, sub: Record<string, unknown> = {}) => ({
  submission: { id: ID, status: "human_review", source: "school", schoolId: SCHOOL, grade: "4º ano", schoolYear: 2027, isDemo: true, createdAt: "2026-09-25T12:00:00Z", mimeType: "application/pdf", sizeBytes: 204800, ...sub },
  current: { id: "v2", version: 2, grade: "4º ano", schoolYear: 2027, items: [item({ name: HOSTILE, quantity: null }), item({ name: "Lápis", origin: "edited" })], origin: "admin_edit", createdAt: "2026-09-25T13:00:00Z" },
  versions: [{ version: 1, origin: "extraction", createdAt: "2026-09-25T12:00:00Z", actorId: null }, { version: 2, origin: "admin_edit", createdAt: "2026-09-25T13:00:00Z", actorId: ME }],
  extraction: { overallConfidence: 0.8, alerts: ["handwritten"], criticalAlerts: ["handwritten"], itemCount: 2 },
  decisions: [{ kind: "publication", decision: "human_review", reasons: ["critical_alert"], actorId: null, createdAt: "2026-09-25T12:01:00Z" }],
  publishedBy: null,
  hasOrphan: false,
  ...o,
});
const sp = (aba?: string) => Promise.resolve(aba ? { aba } : {});
const params = (id: string) => Promise.resolve({ id });

beforeEach(() => {
  for (const f of [requireAccess, getSessionActor, getReviewQueue, getReviewDetail, ...Object.values(service), ...Object.values(loaders)]) f.mockReset();
  requireAccess.mockResolvedValue({ user: { email: "admin@listacerta.test" }, role: "admin" });
  getSessionActor.mockResolvedValue({ userId: ME, role: "admin" });
  loaders.loadThresholds.mockResolvedValue({ confidenceThreshold: 0.8, itemConfidenceThreshold: 0.6 });
  loaders.loadSchoolLabels.mockResolvedValue({ [SCHOOL]: { name: "Escola Sintética", inep: "51000001" } });
  service.open.mockResolvedValue({ version: 2, versionId: "v2" });
  service.blockers.mockResolvedValue(["item_quantity_missing", "critical_alerts_unconfirmed"]);
});

describe("/admin/revisao (fila)", () => {
  it("guard de /admin/revisao: não-admin é redirecionado antes de qualquer leitura", async () => {
    requireAccess.mockRejectedValue(new Error("REDIRECT:/403"));
    await expect(Queue({ searchParams: sp() })).rejects.toThrow("REDIRECT:/403");
    await expect(Detail({ params: params(ID) })).rejects.toThrow("REDIRECT:/403");
    expect(requireAccess).toHaveBeenCalledWith("/admin/revisao");
    expect(getReviewQueue).not.toHaveBeenCalled();
    expect(getReviewDetail).not.toHaveBeenCalled();
  });
  it("abas com contagens, linha em frases, sem nome/e-mail do remetente, selo Demonstração", async () => {
    getReviewQueue.mockImplementation(async (_a: unknown, tab: string) => (tab === "pending" ? [row()] : []));
    render(await Queue({ searchParams: sp() }));
    const nav = screen.getByRole("navigation", { name: "Filtro por situação" });
    expect(within(nav).getByRole("link", { name: "Pendentes (1)" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Aprovadas (0)" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Recusadas (0)" })).toBeInTheDocument();
    expect(screen.getByText(/Escola Sintética · 4º ano/)).toBeInTheDocument();
    expect(screen.getByText("Família")).toBeInTheDocument();
    expect(screen.getByText("Alerta crítico no documento")).toBeInTheDocument();
    expect(screen.getByText("Itens sem quantidade")).toBeInTheDocument();
    expect(screen.queryByText("Itens sinalizados para conferência")).toBeNull();
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.getByText("Demonstração")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Abrir/ })).toHaveAttribute("href", `/admin/revisao/${ID}`);
    expect(document.body.textContent).not.toMatch(/@(?!listacerta)|full_name|submitted_by/i);
    expect(screen.queryByRole("columnheader", { name: /remetente|e-mail|nome/i })).toBeNull();
  });
  it("sem porta de escola: 'Escola não identificada neste ambiente'; aba Aprovadas mostra o subestado", async () => {
    loaders.loadSchoolLabels.mockResolvedValue({});
    getReviewQueue.mockImplementation(async (_a: unknown, tab: string) => (tab === "approved" ? [row({ state: "awaiting_publication" })] : []));
    render(await Queue({ searchParams: sp("aprovadas") }));
    expect(screen.getByText(/Escola não identificada neste ambiente · 4º ano/)).toBeInTheDocument();
    expect(screen.getByText("Aguardando publicação")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Aprovadas (1)" })).toHaveAttribute("aria-current", "page");
  });
  it("aba vazia e erro com nova tentativa", async () => {
    getReviewQueue.mockResolvedValue([]);
    const { unmount } = render(await Queue({ searchParams: sp("recusadas") }));
    expect(screen.getByText("Nenhuma lista nesta aba.")).toBeInTheDocument();
    unmount();
    getReviewQueue.mockRejectedValue(new Error("boom"));
    render(await Queue({ searchParams: sp() }));
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar a fila.");
    expect(screen.getByRole("link", { name: "Tentar de novo" })).toBeInTheDocument();
  });
  it("AdminShell traz o link Revisão", async () => {
    getReviewQueue.mockResolvedValue([]);
    render(await Queue({ searchParams: sp() }));
    expect(within(screen.getByRole("navigation", { name: "Administração" })).getByRole("link", { name: "Revisão" })).toHaveAttribute("aria-current", "page");
  });
});

describe("/admin/revisao/[id] (detalhe)", () => {
  it("id inválido e envio inexistente: 404", async () => {
    await expect(Detail({ params: params("x") })).rejects.toThrow("NOT_FOUND");
    getReviewDetail.mockResolvedValue(null);
    await expect(Detail({ params: params(ID) })).rejects.toThrow("NOT_FOUND");
  });
  it("abre a revisão (open) e mostra documento ao lado dos itens, alertas neutros e bloqueios", async () => {
    getReviewDetail.mockResolvedValue(detail());
    const { container } = render(await Detail({ params: params(ID) }));
    expect(service.open).toHaveBeenCalledWith({ userId: ME, role: "admin" }, ID);
    expect(screen.getByRole("heading", { level: 1, name: "Revise o que a IA leu" })).toBeInTheDocument();
    expect(screen.getByTitle("Documento enviado (PDF)")).toHaveAttribute("src", `/admin/revisao/documento/${ID}`);
    expect(container.innerHTML).not.toMatch(/token=|\/object\/sign|storage_path/);
    expect(screen.getByText(/Documento manuscrito: conferir cada item com o original\./)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Procon|Lei 12\.886/);
    expect(screen.getByText("Alerta crítico no documento")).toBeInTheDocument();
    expect(screen.getByText("Há item sem quantidade: informe um número de 1 a 9999.")).toBeInTheDocument();
    expect(screen.getByText("Confirme que conferiu o documento original.")).toBeInTheDocument();
    expect(screen.getByLabelText("Conferi o documento original")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aprovar e publicar" })).toBeDisabled();
    expect(screen.getByText("Versão 2 · editada por você às 09:00")).toBeInTheDocument();
    expect(screen.getByText("Versão 1 · lida pela IA às 08:00")).toBeInTheDocument();
    expect(screen.getByText("Conferido pela equipe")).toBeInTheDocument();
  });
  it("nome hostil é texto (sem nó img), quantidade nula fica vazia com placeholder ?", async () => {
    getReviewDetail.mockResolvedValue(detail());
    const { container } = render(await Detail({ params: params(ID) }));
    expect(container.querySelector("tbody img")).toBeNull();
    expect(screen.getByLabelText("Nome do item 1")).toHaveValue(HOSTILE);
    expect(screen.getByLabelText("Quantidade do item 1")).toHaveAttribute("placeholder", "?");
    expect(screen.getByText("2 itens lidos", { exact: false })).toHaveTextContent("1 precisa de atenção");
  });
  it("sem settings: faixa indisponível (nada de faixa inventada)", async () => {
    loaders.loadThresholds.mockResolvedValue(null);
    getReviewDetail.mockResolvedValue(detail());
    render(await Detail({ params: params(ID) }));
    expect(screen.getByText("Faixa indisponível")).toBeInTheDocument();
  });
  it("fora de human_review: somente leitura, sem open; aprovado humano sem publicação tem 'Publicar'", async () => {
    getReviewDetail.mockResolvedValue(detail({ decisions: [{ kind: "review", decision: "approved", reasons: [], actorId: ME, createdAt: "2026-09-25T13:00:00Z" }] }, { status: "approved" }));
    render(await Detail({ params: params(ID) }));
    expect(service.open).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Salvar edição" })).toBeNull();
    expect(screen.queryByLabelText("Nome do item 1")).toBeNull();
    expect(screen.getByRole("button", { name: "Publicar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Recusar" })).toBeNull();
  });
  it("publicação órfã: aviso fixo e sem botão de publicar", async () => {
    getReviewDetail.mockResolvedValue(detail({ hasOrphan: true, decisions: [{ kind: "review", decision: "approved", reasons: [], actorId: ME, createdAt: "2026-09-25T13:00:00Z" }] }, { status: "approved" }));
    render(await Detail({ params: params(ID) }));
    expect(screen.getByText(/publicação automática não reconciliada/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Publicar/ })).toBeNull();
  });
  it("erro de leitura: alerta com nova tentativa", async () => {
    getReviewDetail.mockRejectedValue(new Error("boom"));
    render(await Detail({ params: params(ID) }));
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar.");
  });
});
