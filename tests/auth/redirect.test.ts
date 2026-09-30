import { describe, expect, it } from "vitest";
import { decideAccess, hasSessionCookie } from "@/features/auth/decide-access";
import { loginPathFor, safeNextPath } from "@/features/auth/redirect";

describe("safeNextPath", () => {
  it.each([
    ["//evil.com"],
    ["/\\evil.com"],
    ["https://evil.com"],
    ["javascript:alert(1)"],
    [""],
    ["%2f%2fevil.com"],
    ["/%2f%2fevil.com"],
    ["/%5cevil.com"],
    ["evil.com"],
    ["/\nfoo"],
    ["/.//evil.com"],
    ["/..//evil.com"],
    ["/%2e//evil.com"],
    ["/%2E%2E//evil.com"],
    ["/a/../b"],
    ["/\t/evil.com"],
    ["/%09/evil.com"],
    ["/%2f/evil.com"],
    ["/\r\n/evil.com"],
    ["/%0d%0aSet-Cookie:x=1"],
    [null],
    [undefined],
    [42],
    [["/conta"]],
  ])("rejeita %j", (input) => {
    expect(safeNextPath(input)).toBe("/conta");
  });
  it.each([["/conta"], ["/escola/turmas"], ["/admin/importacoes?x=1"], ["/escolas/123#topo"], ["/admin/importacoes?x=1#a"], ["/"]])("aceita %s", (input) => {
    expect(safeNextPath(input)).toBe(input);
  });

  it("usa o fallback informado (S23: confirmSaleAction) em vez de /conta", () => {
    expect(safeNextPath("https://evil.com", "/papelaria/leads")).toBe("/papelaria/leads");
    expect(safeNextPath("//evil.com", "/papelaria/leads")).toBe("/papelaria/leads");
    expect(safeNextPath("/papelaria/leads/LC-1234", "/papelaria/leads")).toBe("/papelaria/leads/LC-1234");
  });
});

/** Review Focus da Task 13 (UX-043): sessão expirada no meio de uma ação volta ao mesmo passo depois de entrar. */
describe("loginPathFor · retorno à rota atual", () => {
  const nextOf = (path: string) => new URL(path, "http://x.invalid").searchParams.get("next");

  it.each(["/conta/alunos/novo", "/carrinho/novo?lista=abc&destino=cotacao", "/cotacao/LC-1234", "/escolas/99001001/ef-5?ano=2027"])("devolve para %s depois do login", (route) => {
    const login = loginPathFor(route);
    expect(login.startsWith("/entrar?next=")).toBe(true);
    expect(safeNextPath(nextOf(login))).toBe(route);
  });

  it("marca a sessão que terminou sem perder o destino", () => {
    const login = loginPathFor("/conta/alunos/novo", { expired: true });
    expect(new URL(login, "http://x.invalid").searchParams.get("sessao")).toBe("terminou");
    expect(safeNextPath(nextOf(login))).toBe("/conta/alunos/novo");
  });

  it("destino externo ou malicioso cai em /conta (sem redirecionamento aberto)", () => {
    for (const evil of ["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)"]) {
      expect(safeNextPath(nextOf(loginPathFor(evil)))).toBe("/conta");
    }
  });

  it("o proxy manda a ação protegida com sessão expirada para /entrar?next=<rota atual>&sessao=terminou", () => {
    const d = decideAccess({ pathname: "/conta/alunos/novo", search: "", userId: null, role: null, hadSession: true });
    expect(d).toEqual({ action: "redirect-login", location: "/entrar?next=%2Fconta%2Falunos%2Fnovo&sessao=terminou" });
    if (d.action !== "redirect-login") throw new Error("esperado redirect-login");
    expect(safeNextPath(nextOf(d.location))).toBe("/conta/alunos/novo");
  });

  it("sem cookie de sessão não diz que a sessão terminou", () => {
    const d = decideAccess({ pathname: "/conta", search: "?a=1", userId: null, role: null });
    expect(d).toEqual({ action: "redirect-login", location: "/entrar?next=%2Fconta%3Fa%3D1" });
  });

  it("só o cookie de sessão conta (não o verificador PKCE de quem só pediu o link)", () => {
    expect(hasSessionCookie(["sb-127-auth-token"])).toBe(true);
    expect(hasSessionCookie(["sb-abc-auth-token.0", "sb-abc-auth-token.1"])).toBe(true);
    expect(hasSessionCookie(["sb-127-auth-token-code-verifier"])).toBe(false);
    expect(hasSessionCookie(["outro", "theme"])).toBe(false);
  });
});
