import { describe, expect, it } from "vitest";
import { canAccess, protectedPrefix, type UserRole } from "@/features/auth/access";

describe("protectedPrefix", () => {
  it("reconhece prefixos protegidos", () => {
    expect(protectedPrefix("/conta")).toBe("/conta");
    expect(protectedPrefix("/conta/x")).toBe("/conta");
    expect(protectedPrefix("/escola/turmas")).toBe("/escola");
    expect(protectedPrefix("/papelaria")).toBe("/papelaria");
    expect(protectedPrefix("/admin/importacoes")).toBe("/admin");
  });
  it("não confunde prefixos parecidos nem rotas públicas", () => {
    expect(protectedPrefix("/administrador")).toBeNull();
    expect(protectedPrefix("/contato")).toBeNull();
    expect(protectedPrefix("/escolas")).toBeNull();
    expect(protectedPrefix("/")).toBeNull();
    expect(protectedPrefix("/entrar")).toBeNull();
  });
});

describe("canAccess", () => {
  const matrix: Record<string, Record<UserRole, "allow" | "forbidden">> = {
    "/conta": { parent: "allow", school_member: "allow", admin: "allow", stationery_member: "allow", system: "forbidden" },
    "/conta/x": { parent: "allow", school_member: "allow", admin: "allow", stationery_member: "allow", system: "forbidden" },
    "/escola": { parent: "forbidden", school_member: "allow", admin: "allow", stationery_member: "forbidden", system: "forbidden" },
    "/papelaria/pedidos": { parent: "forbidden", school_member: "forbidden", admin: "allow", stationery_member: "allow", system: "forbidden" },
    "/admin": { parent: "forbidden", school_member: "forbidden", admin: "allow", stationery_member: "forbidden", system: "forbidden" },
    "/admin/importacoes": { parent: "forbidden", school_member: "forbidden", admin: "allow", stationery_member: "forbidden", system: "forbidden" },
  };
  for (const [path, byRole] of Object.entries(matrix)) {
    for (const [role, expected] of Object.entries(byRole)) {
      it(`${role} em ${path} -> ${expected}`, () => {
        expect(canAccess(role as UserRole, path)).toBe(expected);
      });
    }
  }
  it("role nulo em rota protegida -> login", () => {
    for (const p of ["/conta", "/escola", "/papelaria", "/admin/x"]) {
      expect(canAccess(null, p)).toBe("login");
    }
  });
  it("rotas públicas sempre allow", () => {
    for (const role of [null, "parent", "admin"] as const) {
      expect(canAccess(role, "/")).toBe("allow");
      expect(canAccess(role, "/administrador")).toBe("allow");
      expect(canAccess(role, "/entrar")).toBe("allow");
    }
  });
});
