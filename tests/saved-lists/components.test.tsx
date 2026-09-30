// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const getSessionActor = vi.fn();
const listMySavedLists = vi.fn();
vi.mock("@/features/auth/guard", () => ({ requireAccess: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/features/auth/actor", () => ({ getSessionActor: () => getSessionActor() }));
vi.mock("@/features/saved-lists/queries", () => ({ listMySavedLists: (...a: unknown[]) => listMySavedLists(...a) }));
vi.mock("@/app/conta/listas-salvas/actions", () => ({ removeSavedListAction: vi.fn(), saveListAction: vi.fn() }));

import SavedListsPage from "@/app/conta/listas-salvas/page";
import { SaveListButton } from "@/components/lists/SaveListButton";
import { SavedListsSection } from "@/components/saved-lists/SavedListsSection";

const row = {
  id: "s1",
  createdAt: new Date("2026-09-02"),
  studentId: "st1",
  listId: "l1",
  studentNickname: "Maria",
  schoolName: "Escola Demo S29",
  schoolInep: "99001001",
  gradeSlug: "ef-5",
  gradeLabel: "5º ano",
  schoolYear: 2027,
};

describe("/conta/listas-salvas · UX-052", () => {
  it("'Remover' abre ConfirmDialog com verbo + objeto e não remove na hora", async () => {
    getSessionActor.mockResolvedValue({ userId: "u1" });
    listMySavedLists.mockResolvedValue([row]);
    render(await SavedListsPage());
    const trigger = screen.getByRole("button", { name: "Remover lista de Maria" });
    expect(trigger).toBeInTheDocument();
    const dialog = document.querySelector("dialog");
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("open")).toBeNull();
    fireEvent.click(trigger);
    expect(within(dialog as HTMLElement).getByRole("heading", { name: /Remover a lista de Maria/ })).toBeInTheDocument();
    expect(within(dialog as HTMLElement).getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    // o botão que remove está DENTRO do diálogo; nada de botão "Remover" solto fora dele
    for (const b of screen.queryAllByRole("button", { name: /^Remover$/ })) expect(b.closest("dialog")).not.toBeNull();
  });

  it("o título-link tem alvo de 44 px", async () => {
    getSessionActor.mockResolvedValue({ userId: "u1" });
    listMySavedLists.mockResolvedValue([row]);
    render(await SavedListsPage());
    const link = screen.getByRole("link", { name: /Escola Demo S29 · 5º ano/ });
    expect(link.className).toContain("min-h-11");
  });

  it("vazio tem ação 'Buscar a escola'", async () => {
    getSessionActor.mockResolvedValue({ userId: "u1" });
    listMySavedLists.mockResolvedValue([]);
    render(await SavedListsPage());
    expect(screen.getByRole("link", { name: "Buscar a escola" })).toHaveAttribute("href", "/escolas");
  });
});

describe("SavedListsSection · UX-059", () => {
  it("o vazio é uma frase contínua, sem link de 44 px dentro dela (a ação é a principal do hub)", () => {
    render(<SavedListsSection savedLists={[]} />);
    const p = screen.getByText(/Nenhuma lista salva ainda\./);
    expect(p.tagName).toBe("P");
    expect(p.querySelector("a")).toBeNull();
    expect(p.textContent).toMatch(/Salvar lista/);
  });
});

describe("SaveListButton · UX-053", () => {
  it("depois de salvar diz para qual aluno e onde achar a lista", async () => {
    const save = vi.fn(async () => ({ status: "ok" as const }));
    render(<SaveListButton listId="l1" students={[{ id: "st1", nickname: "Maria" }]} loggedIn nextPath="/escolas/1/ef-5" save={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Salvar lista" }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/Lista salva para Maria/);
    expect(screen.getByRole("link", { name: "Ver em Minha conta" })).toHaveAttribute("href", "/conta/listas-salvas");
  });

  it("sessão expirada: o convite de entrar volta à mesma lista", () => {
    render(<SaveListButton listId="l1" students={[]} loggedIn={false} nextPath="/escolas/1/ef-5?ano=2027" save={vi.fn()} />);
    expect(screen.getByRole("link", { name: /Entrar para salvar/ })).toHaveAttribute("href", "/entrar?next=%2Fescolas%2F1%2Fef-5%3Fano%3D2027");
  });

  it("o erro da action aparece em alerta e o botão deixa tentar de novo", async () => {
    const save = vi.fn(async () => ({ status: "error" as const, message: "Não foi possível salvar agora." }));
    render(<SaveListButton listId="l1" students={[{ id: "st1", nickname: "Maria" }]} loggedIn nextPath="/x" save={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Salvar lista" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Não foi possível/));
    expect(screen.getByRole("button", { name: "Salvar lista" })).toBeEnabled();
  });
});
