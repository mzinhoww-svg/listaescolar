import { describe, expect, it } from "vitest";
import { canAccess } from "@/features/auth/access";

describe("/conta/notificacoes", () => {
  it("todos os papéis logados acessam; sem sessão vai ao login; o perfil técnico system nunca", () => {
    for (const role of ["parent", "school_member", "admin", "stationery_member"] as const) expect(canAccess(role, "/conta/notificacoes")).toBe("allow");
    expect(canAccess(null, "/conta/notificacoes")).toBe("login");
    expect(canAccess("system", "/conta/notificacoes")).toBe("forbidden");
  });
});
