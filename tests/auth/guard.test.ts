import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const getCurrentRole = vi.fn();
vi.mock("@/features/auth/queries", () => ({
  getCurrentUser: () => getCurrentUser(),
  getCurrentRole: () => getCurrentRole(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { requireAccess } from "@/features/auth/guard";

const user = { id: "u1", email: "a@b.co" };

describe("requireAccess", () => {
  beforeEach(() => {
    getCurrentUser.mockReset();
    getCurrentRole.mockReset();
  });

  it("sem usuário: login com next do caminho", async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(requireAccess("/admin")).rejects.toThrow("REDIRECT:/entrar?next=%2Fadmin");
    expect(getCurrentRole).not.toHaveBeenCalled();
  });

  it("UX-043: sem usuário em subrota volta à mesma rota (com a query) depois do login", async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(requireAccess("/conta/alunos/novo?serie=ef-5")).rejects.toThrow("REDIRECT:/entrar?next=%2Fconta%2Falunos%2Fnovo%3Fserie%3Def-5");
  });

  it("UX-043: rota externa não vira destino do login", async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(requireAccess("//evil.com")).rejects.toThrow("REDIRECT:/entrar?next=%2Fconta");
  });

  it("usuário sem papel: /403", async () => {
    getCurrentUser.mockResolvedValue(user);
    getCurrentRole.mockResolvedValue(null);
    await expect(requireAccess("/conta")).rejects.toThrow("REDIRECT:/403");
  });

  it("papel sem permissão: /403", async () => {
    getCurrentUser.mockResolvedValue(user);
    getCurrentRole.mockResolvedValue("parent");
    await expect(requireAccess("/admin")).rejects.toThrow("REDIRECT:/403");
  });

  it("papel permitido: devolve usuário e papel", async () => {
    getCurrentUser.mockResolvedValue(user);
    getCurrentRole.mockResolvedValue("admin");
    await expect(requireAccess("/admin")).resolves.toEqual({ user, role: "admin" });
  });
});
