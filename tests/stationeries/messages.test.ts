import { describe, expect, it } from "vitest";

import { errorMessageForCode, repositoryErrorCode } from "@/features/stationeries/messages";

describe("mensagens por código (?erro=)", () => {
  it("código conhecido vira texto fixo; texto livre nunca é ecoado", () => {
    expect(errorMessageForCode("cnpj_taken")).toContain("CNPJ");
    expect(errorMessageForCode("<script>alert(1)</script>")).toBe(errorMessageForCode("desconhecido"));
    expect(errorMessageForCode("constructor")).toBe(errorMessageForCode("desconhecido"));
    expect(errorMessageForCode(undefined)).toBeNull();
  });
  it("código do repositório", () => {
    expect(repositoryErrorCode(Object.assign(new Error("x"), { name: "StationeryRepositoryError", code: "forbidden" }))).toBe("forbidden");
    expect(repositoryErrorCode(new Error("x"))).toBe("desconhecido");
  });
});
