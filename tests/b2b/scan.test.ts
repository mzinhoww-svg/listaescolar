import { describe, expect, it } from "vitest";

import { scanForForbidden } from "@/features/b2b/api/scan";

describe("scanForForbidden", () => {
  it("acha chave proibida no topo", () => {
    expect(scanForForbidden({ email: "a@b.com" })).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "email", reason: "key" })]),
    );
  });

  it("acha chave proibida aninhada em objeto", () => {
    const findings = scanForForbidden({ data: { school: { created_by: "x" } } });
    expect(findings.some((f) => f.path === "data.school.created_by" && f.reason === "key")).toBe(true);
  });

  it("acha chave proibida aninhada em array", () => {
    const findings = scanForForbidden({ items: [{ ok: true }, { profile_id: "abc" }] });
    expect(findings.some((f) => f.path === "items[1].profile_id")).toBe(true);
  });

  it("acha e-mail dentro de uma string maior (não só o valor exato)", () => {
    const findings = scanForForbidden({ note: "contato: fulano@escola.edu.br para dúvidas" });
    expect(findings.some((f) => f.reason === "value" && f.match === "email")).toBe(true);
  });

  it("acha CPF por regex", () => {
    expect(scanForForbidden({ note: "CPF 123.456.789-09" }).some((f) => f.match === "cpf")).toBe(true);
    expect(scanForForbidden({ note: "12345678909" }).some((f) => f.match === "cpf")).toBe(true);
  });

  it("acha telefone brasileiro por regex", () => {
    expect(scanForForbidden({ note: "chame no (65) 99999-8888" }).some((f) => f.match === "telefone")).toBe(true);
  });

  it("acha valor proibido semeado (UUID, nome de aluno, código LC-)", () => {
    const seededUuid = "9f2b1a34-0000-4000-8000-000000000123";
    const findings = scanForForbidden({ x: { y: `algo com ${seededUuid} dentro` } }, { values: [seededUuid, "Joãozinho", "LC-5TJ1"] });
    expect(findings.some((f) => f.match === seededUuid)).toBe(true);
  });

  it("allowlist mínima: chave do próprio contrato não conta como achado", () => {
    // "source" bate na regex padrão; um endpoint legítimo poderia (hipoteticamente) precisar dela.
    expect(scanForForbidden({ source: "catalogo" }).length).toBeGreaterThan(0);
    expect(scanForForbidden({ source: "catalogo" }, { allowKeys: ["source"] })).toEqual([]);
  });

  it("resposta limpa (só campos da whitelist) não produz achado nenhum", () => {
    const clean = {
      data: [{ inep: "51999901", name: "Escola Exemplo", network: "municipal", neighborhood: "Centro",
        municipality: { ibge_code: "5103403", name: "Cuiabá", uf: "MT" }, verified: true, published_lists_count: 2, is_demo: false }],
      meta: { api_version: "v1", environment: "test", request_id: "11111111-1111-4111-8111-111111111111" },
    };
    expect(scanForForbidden(clean)).toEqual([]);
  });

  it("teste de controle: injeta um campo proibido no retorno de uma função falsa e prova que a varredura pega", () => {
    function fakeEndpointResponse() {
      return { data: { inep: "1", email: "leak@escola.example" } }; // campo proibido injetado de propósito
    }
    const findings = scanForForbidden(fakeEndpointResponse());
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.path === "data.email")).toBe(true);
  });

  it("não lança para tipos primitivos, null ou undefined", () => {
    expect(scanForForbidden(null)).toEqual([]);
    expect(scanForForbidden(undefined)).toEqual([]);
    expect(scanForForbidden(42)).toEqual([]);
    expect(scanForForbidden(true)).toEqual([]);
  });
});
