import { describe, expect, it } from "vitest";
import { decideAccess } from "@/features/auth/decide-access";

describe("decideAccess", () => {
  it("rota pública passa mesmo anônimo", () => {
    expect(decideAccess({ pathname: "/", userId: null, role: null })).toEqual({ action: "next" });
    expect(decideAccess({ pathname: "/administrador", userId: null, role: null })).toEqual({
      action: "next",
    });
  });
  it("anônimo em rota protegida vai ao login preservando next", () => {
    expect(decideAccess({ pathname: "/admin", userId: null, role: null })).toEqual({
      action: "redirect-login",
      location: "/entrar?next=%2Fadmin",
    });
  });
  it("preserva a query em next", () => {
    const d = decideAccess({
      pathname: "/escola/turmas",
      search: "?a=1&b=2",
      userId: null,
      role: null,
    });
    expect(d).toEqual({
      action: "redirect-login",
      location: "/entrar?next=%2Fescola%2Fturmas%3Fa%3D1%26b%3D2",
    });
  });
  it("next inseguro cai para /conta", () => {
    expect(decideAccess({ pathname: "/admin/x\\y", userId: null, role: null })).toEqual({
      action: "redirect-login",
      location: "/entrar?next=%2Fconta",
    });
  });
  it("parent em /conta passa; em /admin recebe 403", () => {
    expect(decideAccess({ pathname: "/conta", userId: "u", role: "parent" })).toEqual({
      action: "next",
    });
    expect(decideAccess({ pathname: "/admin", userId: "u", role: "parent" })).toEqual({
      action: "rewrite-403",
      location: "/403",
    });
  });
  it("admin acessa tudo protegido", () => {
    for (const p of ["/conta", "/escola", "/papelaria", "/admin/x"]) {
      expect(decideAccess({ pathname: p, userId: "u", role: "admin" })).toEqual({ action: "next" });
    }
  });
  it("logado sem papel (profile ausente) recebe 403, sem laço de login", () => {
    expect(decideAccess({ pathname: "/conta", userId: "u", role: null }).action).toBe(
      "rewrite-403",
    );
  });
  it("userId presente e papel nulo: rewrite-403 explícito, mesmo em rota de qualquer papel", () => {
    for (const p of ["/conta", "/escola", "/papelaria", "/admin"]) {
      expect(decideAccess({ pathname: p, userId: "u", role: null })).toEqual({
        action: "rewrite-403",
        location: "/403",
      });
    }
  });
  it("papel system nunca acessa área de usuário", () => {
    expect(decideAccess({ pathname: "/conta", userId: "u", role: "system" }).action).toBe(
      "rewrite-403",
    );
  });
});
