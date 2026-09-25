import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAccess = vi.hoisted(() => vi.fn());
const getSessionActor = vi.hoisted(() => vi.fn());
const copyService = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("@/features/auth/guard", () => ({ requireAccess: (...a: unknown[]) => requireAccess(...a) }));
vi.mock("@/features/auth/actor", () => ({ getSessionActor: () => getSessionActor() }));
vi.mock("@/features/review/deps", () => ({ buildParentCopyService: () => copyService }));
vi.mock("@/app/enviar-lista/[submissionId]/revisar/actions", () => ({ saveParentCopyAction: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));

import Page from "@/app/enviar-lista/[submissionId]/revisar/page";
import { PARENT_IDLE, type ParentCopyState } from "@/app/enviar-lista/[submissionId]/revisar/state";
import { ParentCopyEditor } from "@/components/review/ParentCopyEditor";
import type { ReviewItem } from "@/features/review/schemas";

const SUB = "3f2b8c1e-5d4a-4b6f-9c3d-1a2b3c4d5e6f";
const COPY = "9c9c9c9c-5d4a-4b6f-9c3d-1a2b3c4d5e6f";
const HOSTILE = '"><script>alert(1)</script><img src=x onerror=alert(1)>';
const item = (o: Partial<ReviewItem> = {}): ReviewItem => ({ name: "Caderno", quantity: 2, unit: null, category: "papelaria", confidence: 0.9, alerts: [], origin: "extracted", ...o });
const view = { copyId: COPY, version: 1, items: [item({ name: HOSTILE }), item({ name: "Lápis", quantity: null })], grade: "5º ano", schoolYear: 2027 };
const params = (id: string) => Promise.resolve({ submissionId: id });
type Act = (prev: ParentCopyState, fd: FormData) => Promise<ParentCopyState>;

beforeEach(() => {
  for (const f of [requireAccess, getSessionActor, copyService.open]) f.mockReset();
  requireAccess.mockResolvedValue({ user: { email: "p@x.test" }, role: "parent" });
  getSessionActor.mockResolvedValue({ userId: "u1", role: "parent" });
  copyService.open.mockResolvedValue(view);
});

describe("/enviar-lista/[id]/revisar (pai)", () => {
  it("outro dono, envio de escola ou sem resultado (open = null), id inválido e papéis não-parent: o mesmo 404", async () => {
    copyService.open.mockResolvedValue(null);
    await expect(Page({ params: params(SUB) })).rejects.toThrow("NOT_FOUND");
    await expect(Page({ params: params("x") })).rejects.toThrow("NOT_FOUND");
    for (const role of ["admin", "school_member"]) {
      getSessionActor.mockResolvedValue({ userId: "u1", role });
      await expect(Page({ params: params(SUB) })).rejects.toThrow("NOT_FOUND");
    }
    getSessionActor.mockResolvedValue(null);
    await expect(Page({ params: params(SUB) })).rejects.toThrow("NOT_FOUND");
    expect(copyService.open).toHaveBeenCalledTimes(1);
  });
  it("dono: avisos, série/ano só leitura, nome hostil como texto, campos rotulados e alvo de 44 px", async () => {
    const { container } = render(await Page({ params: params(SUB) }));
    expect(copyService.open).toHaveBeenCalledWith({ userId: "u1", role: "parent" }, SUB);
    expect(screen.getByText(/Estas mudanças valem só para você\. A lista oficial da escola é conferida pela equipe/)).toBeInTheDocument();
    expect(screen.getByText("Não escreva o nome da criança nos itens.")).toBeInTheDocument();
    expect(screen.getByText(/Série: 5º ano · Ano letivo: 2027/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Série")).toBeNull();
    expect(screen.getByLabelText("Nome do item 1")).toHaveValue(HOSTILE);
    expect(container.querySelector("img, script")).toBeNull();
    expect(screen.getByLabelText("Quantidade do item 2")).toHaveAttribute("placeholder", "?");
    for (const n of ["Nome do item 1", "Quantidade do item 1"]) expect(screen.getByLabelText(n).className).toMatch(/min-h-11/);
    expect(screen.getByRole("button", { name: "Remover item 2" }).className).toMatch(/min-h-11/);
    expect(screen.getByRole("button", { name: "Salvar minha lista" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Enviar para revisão/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Montar carrinho/ })).toBeNull();
  });
  it("falha ao abrir: estado honesto (sem 404 mentiroso)", async () => {
    copyService.open.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(await Page({ params: params(SUB) }));
    expect(screen.getByText("Não foi possível abrir sua lista")).toBeInTheDocument();
  });
});

describe("ParentCopyEditor", () => {
  const editor = (action: Act, items = view.items) => <ParentCopyEditor copyId={COPY} submissionId={SUB} initialVersion={1} initialItems={items} grade="5º ano" schoolYear={2027} action={action} />;
  it("salvar envia itens + versão esperada; só depois de salvar aparece 'Montar carrinho' com o copyId; editar de novo esconde", async () => {
    const save = vi.fn<Act>(async () => ({ kind: "saved", message: "Lista salva.", version: 2 }));
    render(editor(save));
    fireEvent.change(screen.getByLabelText("Quantidade do item 2"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar minha lista" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    const payload = JSON.parse(String(save.mock.calls[0]![1].get("payload")));
    expect(payload.expectedVersion).toBe(1);
    expect(payload.items[1]).toMatchObject({ quantity: 3, origin: "edited" });
    expect(save.mock.calls[0]![1].get("copyId")).toBe(COPY);
    expect(await screen.findByText("Lista salva.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Montar carrinho com esta lista" })).toHaveAttribute("href", `/carrinho/novo?lista=${COPY}`);
    fireEvent.change(screen.getByLabelText("Nome do item 2"), { target: { value: "Lápis 2B" } });
    expect(screen.queryByRole("link", { name: /Montar carrinho/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Salvar minha lista" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(save.mock.calls[1]![1].get("payload"))).expectedVersion).toBe(2);
  });
  it("stale: aviso com role=alert e sem link do carrinho", async () => {
    const save = vi.fn<Act>(async () => ({ kind: "stale", message: "Esta lista foi alterada em outra aba. Recarregue." }));
    render(editor(save));
    fireEvent.click(screen.getByRole("button", { name: "Salvar minha lista" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("alterada em outra aba");
    expect(screen.queryByRole("link", { name: /Montar carrinho/ })).toBeNull();
  });
  it("quantidade fracionária/0 e nome vazio bloqueiam salvar; adicionar nasce sem quantidade; remover funciona", () => {
    render(editor(async () => PARENT_IDLE));
    fireEvent.change(screen.getByLabelText("Quantidade do item 1"), { target: { value: "1.5" } });
    expect(screen.getByRole("alert")).toHaveTextContent("número inteiro de 1 a 9999");
    expect(screen.getByRole("button", { name: "Salvar minha lista" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Quantidade do item 1"), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: "Salvar minha lista" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Quantidade do item 1"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar item" }));
    expect(screen.getByLabelText("Quantidade do item 3")).toHaveValue(null);
    expect(screen.getByRole("button", { name: "Salvar minha lista" })).toBeDisabled(); // nome vazio
    fireEvent.click(screen.getByRole("button", { name: "Remover item 3" }));
    expect(screen.getByRole("button", { name: "Salvar minha lista" })).toBeEnabled();
  });
});
