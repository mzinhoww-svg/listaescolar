import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionActor = vi.fn();
const createStudent = vi.fn();
const updateStudent = vi.fn();
const deleteStudent = vi.fn();
vi.mock("@/features/auth/actor", () => ({ getSessionActor: () => getSessionActor() }));
vi.mock("@/features/students/repository", () => ({
  createStudent: (...a: unknown[]) => createStudent(...a),
  updateStudent: (...a: unknown[]) => updateStudent(...a),
  deleteStudent: (...a: unknown[]) => deleteStudent(...a),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { createStudentAction, deleteStudentAction, updateStudentAction } from "@/app/conta/alunos/actions";

const form = (v: Record<string, string>) => {
  const f = new FormData();
  for (const [k, val] of Object.entries(v)) f.set(k, val);
  return f;
};
const ID = "10000000-0000-4000-8000-000000000001";

describe("ações de aluno · UX-053 e UX-043", () => {
  beforeEach(() => {
    getSessionActor.mockReset().mockResolvedValue({ userId: "u1" });
    createStudent.mockReset().mockResolvedValue(undefined);
    updateStudent.mockReset().mockResolvedValue(undefined);
    deleteStudent.mockReset().mockResolvedValue(true);
  });

  it("salvar aluno volta à conta com o aviso 'aluno-salvo'", async () => {
    await expect(createStudentAction({ status: "idle" }, form({ nickname: "Maria", gradeSlug: "ef-5", consent: "on" }))).rejects.toThrow("REDIRECT:/conta?aviso=aluno-salvo");
  });

  it("editar aluno volta com 'aluno-atualizado' e excluir com 'aluno-excluido'", async () => {
    await expect(updateStudentAction({ status: "idle" }, form({ id: ID, nickname: "Maria", gradeSlug: "ef-5" }))).rejects.toThrow("REDIRECT:/conta?aviso=aluno-atualizado");
    await expect(deleteStudentAction(form({ id: ID }))).rejects.toThrow("REDIRECT:/conta?aviso=aluno-excluido");
  });

  it("sessão expirada no envio do formulário volta ao mesmo formulário depois de entrar", async () => {
    getSessionActor.mockResolvedValue(null);
    await expect(createStudentAction({ status: "idle" }, form({ nickname: "Maria", gradeSlug: "ef-5", consent: "on" }))).rejects.toThrow(
      "REDIRECT:/entrar?next=%2Fconta%2Falunos%2Fnovo&sessao=terminou",
    );
    await expect(updateStudentAction({ status: "idle" }, form({ id: ID, nickname: "Maria", gradeSlug: "ef-5" }))).rejects.toThrow(
      `REDIRECT:/entrar?next=%2Fconta%2Falunos%2F${ID}%2Feditar&sessao=terminou`,
    );
  });
});
