// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/conta/alunos/actions", () => ({ deleteStudentAction: vi.fn() }));

import { GradeSelect } from "@/components/students/GradeSelect";
import { StudentForm } from "@/components/students/StudentForm";
import { StudentsSection } from "@/components/students/StudentsSection";
import { SERIES_OPTIONS } from "@/components/submissions/series-options";
import { STAGE_LABEL } from "@/features/grades/catalog";
import { accountNotice } from "@/features/students/notices";

const student = { id: "10000000-0000-4000-8000-000000000001", nickname: "Maria", gradeSlug: "ef-5", gradeLabel: "5º ano", createdAt: new Date("2026-09-01") };
const saved = {
  id: "s1",
  createdAt: new Date("2026-09-02"),
  studentId: student.id,
  listId: "l1",
  studentNickname: "Maria",
  schoolName: "Escola Demo",
  schoolInep: "99001001",
  gradeSlug: "ef-5",
  gradeLabel: "5º ano",
  schoolYear: 2027,
};

describe("StudentsSection · UX-054 (ações por aluno)", () => {
  it("com lista salva: 'Ver a lista do 5º ano' leva à lista e 'Enviar a lista' já leva escola e série", () => {
    render(<StudentsSection students={[student]} savedLists={[saved]} />);
    expect(screen.getByRole("link", { name: "Ver a lista do 5º ano" })).toHaveAttribute("href", "/escolas/99001001/ef-5?ano=2027");
    const send = screen.getByRole("link", { name: "Enviar a lista de Maria" });
    expect(send.getAttribute("href")).toContain("/enviar-lista?");
    expect(send.getAttribute("href")).toContain("serie=ef-5");
    expect(send.getAttribute("href")).toContain("escola=99001001");
    expect(screen.getByRole("link", { name: "Editar Maria" })).toHaveAttribute("href", `/conta/alunos/${student.id}/editar`);
  });

  it("sem lista salva: 'Buscar a lista do 5º ano' leva à busca de escolas", () => {
    render(<StudentsSection students={[student]} savedLists={[]} />);
    expect(screen.getByRole("link", { name: "Buscar a lista do 5º ano" })).toHaveAttribute("href", "/escolas");
    expect(screen.getByRole("link", { name: "Enviar a lista de Maria" }).getAttribute("href")).toContain("serie=ef-5");
  });

  it("todos os links do cartão têm alvo de 44 px", () => {
    render(<StudentsSection students={[student]} savedLists={[saved]} />);
    const card = screen.getByRole("list", { name: "Alunos" });
    for (const a of within(card).getAllByRole("link")) expect(a.className).toContain("min-h-11");
  });

  it("vazio: uma ação principal 'Adicionar aluno'; com alunos o 'Adicionar' do cabeçalho é texto", () => {
    const { rerender } = render(<StudentsSection students={[]} savedLists={[]} />);
    expect(screen.getByRole("link", { name: "Adicionar aluno" }).className).toContain("bg-tinta");
    rerender(<StudentsSection students={[student]} savedLists={[]} />);
    expect(screen.getByRole("link", { name: "Adicionar" }).className).not.toContain("bg-tinta");
  });
});

describe("avisos do hub · UX-053", () => {
  it("aluno salvo diz o que aconteceu e o próximo passo", () => {
    expect(accountNotice("aluno-salvo")).toMatch(/Aluno salvo/);
    expect(accountNotice("aluno-salvo")).toMatch(/lista/);
    expect(accountNotice("aluno-atualizado")).toMatch(/atualizado/i);
    expect(accountNotice("aluno-excluido")).toMatch(/exclu/i);
  });
  it("código desconhecido não vira texto", () => {
    expect(accountNotice("<script>")).toBeNull();
    expect(accountNotice(undefined)).toBeNull();
    expect(accountNotice(["aluno-salvo"])).toBe(accountNotice("aluno-salvo"));
  });
});

describe("StudentForm · UX-055", () => {
  const action = vi.fn(async () => ({ status: "idle" as const }));
  const setup = () => render(<StudentForm action={action} submitLabel="Salvar aluno" />);

  it("noValidate: o erro vem em português, junto do campo, com aria-invalid e aria-describedby, sem chamar a action", async () => {
    action.mockClear();
    const { container } = setup();
    expect(container.querySelector("form")).toHaveAttribute("novalidate");
    fireEvent.click(screen.getByRole("button", { name: "Salvar aluno" }));
    const nick = screen.getByLabelText("Apelido do aluno");
    await waitFor(() => expect(nick).toHaveAttribute("aria-invalid", "true"));
    expect(nick.getAttribute("aria-describedby")).toContain("nickname-erro");
    expect(document.getElementById("nickname-erro")).toHaveTextContent("Informe o apelido do aluno.");
    const grade = screen.getByLabelText("Série");
    expect(grade).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById("gradeSlug-erro")).toHaveTextContent("Escolha a série.");
    expect(document.getElementById("consent-erro")).toHaveTextContent(/consentimento/i);
    expect(action).not.toHaveBeenCalled();
  });

  it("foco vai para o primeiro campo com erro", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Salvar aluno" }));
    await waitFor(() => expect(screen.getByLabelText("Apelido do aluno")).toHaveFocus());
  });

  it("a regra 'sem sobrenome' aparece antes do envio (dica) e como erro ao digitar nome e sobrenome", async () => {
    setup();
    expect(screen.getByText(/sem sobrenome/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Apelido do aluno"), { target: { value: "Maria Silva" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar aluno" }));
    await waitFor(() => expect(document.getElementById("nickname-erro")).toHaveTextContent("Use só um apelido, sem sobrenome."));
  });

  it("a dica do apelido é neutra (não usa verde)", () => {
    setup();
    const hint = screen.getByText(/sem sobrenome/i);
    expect(hint.className).not.toMatch(/verde/);
  });

  it("formulário válido chama a action", async () => {
    action.mockClear();
    setup();
    fireEvent.change(screen.getByLabelText("Apelido do aluno"), { target: { value: "Maria" } });
    fireEvent.change(screen.getByLabelText("Série"), { target: { value: "ef-5" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar aluno" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  });
});

describe("séries · UX-058", () => {
  it("o seletor do aluno usa as mesmas etapas do formulário de envio", () => {
    render(<GradeSelect value="" onChange={() => {}} />);
    const select = screen.getByLabelText("Série");
    for (const label of Object.values(STAGE_LABEL)) expect(within(select).getByRole("group", { name: label })).toBeInTheDocument();
    for (const o of SERIES_OPTIONS.filter((x) => x.stage !== "ei")) expect(within(select).getByRole("option", { name: o.label })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "3ª série" })).toBeInTheDocument();
  });
  it("Ensino Médio nomeia 1ª a 3ª série em ambos", () => {
    expect(SERIES_OPTIONS.filter((x) => x.stage === "em").map((o) => o.label)).toEqual(["1ª série", "2ª série", "3ª série"]);
    expect(STAGE_LABEL.em).toBe("Ensino Médio");
  });
});
