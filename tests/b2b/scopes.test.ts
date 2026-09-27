import { describe, expect, it } from "vitest";

import { ALLOWED_SCOPES, isB2bScope, isScopeAllowedForType, PARTNER_TYPES, scopeFor, scopesForPartnerType } from "@/features/b2b/scopes";

describe("ALLOWED_SCOPES", () => {
  it("são exatamente os três escopos do contrato", () => {
    expect(ALLOWED_SCOPES).toEqual(["schools:read", "lists:read", "carts:match"]);
  });
  it("isB2bScope reconhece só os válidos", () => {
    for (const s of ALLOWED_SCOPES) expect(isB2bScope(s)).toBe(true);
    expect(isB2bScope("admin:write")).toBe(false);
    expect(isB2bScope(123)).toBe(false);
  });
});

describe("scopesForPartnerType", () => {
  it("varejista tem os três escopos", () => {
    expect(scopesForPartnerType("retailer")).toEqual(["schools:read", "lists:read", "carts:match"]);
  });
  it("marca e edtech não têm carts:match", () => {
    for (const t of ["brand", "edtech"] as const) {
      expect(scopesForPartnerType(t)).toEqual(["schools:read", "lists:read"]);
      expect(isScopeAllowedForType(t, "carts:match")).toBe(false);
    }
  });
  it("todo tipo de parceiro tem um conjunto não vazio de escopos", () => {
    for (const t of PARTNER_TYPES) expect(scopesForPartnerType(t).length).toBeGreaterThan(0);
  });
});

describe("scopeFor", () => {
  it("mapeia cada endpoint do contrato para o escopo certo", () => {
    expect(scopeFor("schools.list")).toBe("schools:read");
    expect(scopeFor("schools.get")).toBe("schools:read");
    expect(scopeFor("schools.lists")).toBe("lists:read");
    expect(scopeFor("lists.get")).toBe("lists:read");
    expect(scopeFor("lists.items")).toBe("lists:read");
    expect(scopeFor("carts.match")).toBe("carts:match");
  });
  it("endpoint desconhecido -> undefined", () => {
    expect(scopeFor("qualquer.coisa")).toBeUndefined();
  });
});
