import { describe, expect, it } from "vitest";
import { answerSchemaForStep } from "@/lib/pesquisa/schemas";

describe("answerSchemaForStep", () => {
  it("aceita slugs válidos de cada tela", () => {
    expect(answerSchemaForStep(1)?.safeParse({ cidade: "cuiaba" }).success).toBe(true);
    expect(answerSchemaForStep(2)?.safeParse({ filhos: "3_ou_mais" }).success).toBe(true);
    expect(answerSchemaForStep(3)?.safeParse({ rede: "ambas" }).success).toBe(true);
    expect(
      answerSchemaForStep(4)?.safeParse({
        etapas: ["infantil", "fundamental_1"],
        escola: "Escola Demo",
      }).success,
    ).toBe(true);
    expect(answerSchemaForStep(4)?.safeParse({ etapas: ["medio"] }).success).toBe(true);
    expect(answerSchemaForStep(5)?.safeParse({ recebimento: "outro" }).success).toBe(true);
    expect(
      answerSchemaForStep(6)?.safeParse({ onde_comprou: ["papelaria_bairro", "internet"] }).success,
    ).toBe(true);
    expect(answerSchemaForStep(7)?.safeParse({ gasto: "ate_200" }).success).toBe(true);
    expect(answerSchemaForStep(8)?.safeParse({ tempo: "meio_dia" }).success).toBe(true);
    expect(answerSchemaForStep(9)?.safeParse({ comparou: "um_pouco" }).success).toBe(true);
    expect(
      answerSchemaForStep(10)?.safeParse({ dores: ["preco_alto", "falta_tempo"] }).success,
    ).toBe(true);
    expect(
      answerSchemaForStep(11)?.safeParse({ usaria: "com_certeza", canal: "tanto_faz" }).success,
    ).toBe(true);
    expect(
      answerSchemaForStep(12)?.safeParse({ compra_ideal: "Tudo pronto", pode_citar: true }).success,
    ).toBe(true);
  });

  it("rejeita id de outra tela (strictObject)", () => {
    const r = answerSchemaForStep(1)?.safeParse({ cidade: "cuiaba", filhos: "1" });
    expect(r?.success).toBe(false);
  });

  it("rejeita valor fora dos slugs permitidos", () => {
    expect(answerSchemaForStep(1)?.safeParse({ cidade: "rio_de_janeiro" }).success).toBe(false);
    expect(answerSchemaForStep(7)?.safeParse({ gasto: "um_milhao" }).success).toBe(false);
  });

  it("rejeita mais de 2 dores (tela 10)", () => {
    const r = answerSchemaForStep(10)?.safeParse({
      dores: ["preco_alto", "falta_tempo", "ir_ate_loja"],
    });
    expect(r?.success).toBe(false);
  });

  it("rejeita opção repetida em múltipla escolha", () => {
    const r = answerSchemaForStep(10)?.safeParse({ dores: ["preco_alto", "preco_alto"] });
    expect(r?.success).toBe(false);
  });

  it("exige pelo menos uma opção em múltipla escolha", () => {
    expect(answerSchemaForStep(6)?.safeParse({ onde_comprou: [] }).success).toBe(false);
  });

  it("rejeita texto longo demais", () => {
    expect(
      answerSchemaForStep(4)?.safeParse({ etapas: ["medio"], escola: "a".repeat(121) }).success,
    ).toBe(false);
    expect(answerSchemaForStep(12)?.safeParse({ compra_ideal: "a".repeat(501) }).success).toBe(
      false,
    );
  });

  it("tela 12: aceita objeto vazio (única totalmente opcional)", () => {
    expect(answerSchemaForStep(12)?.safeParse({}).success).toBe(true);
  });

  it("outras telas: objeto vazio é rejeitado (campo obrigatório ausente)", () => {
    expect(answerSchemaForStep(1)?.safeParse({}).success).toBe(false);
    expect(answerSchemaForStep(4)?.safeParse({}).success).toBe(false);
    expect(answerSchemaForStep(11)?.safeParse({}).success).toBe(false);
  });

  it("tela 11: canal obrigatório quando usaria != nao", () => {
    expect(answerSchemaForStep(11)?.safeParse({ usaria: "talvez" }).success).toBe(false);
    expect(answerSchemaForStep(11)?.safeParse({ usaria: "com_certeza" }).success).toBe(false);
  });

  it("tela 11: canal não pode vir quando usaria == nao", () => {
    const r = answerSchemaForStep(11)?.safeParse({ usaria: "nao", canal: "tanto_faz" });
    expect(r?.success).toBe(false);
  });

  it("tela 11: usaria == nao sem canal é válido", () => {
    expect(answerSchemaForStep(11)?.safeParse({ usaria: "nao" }).success).toBe(true);
  });

  it("step inexistente devolve null", () => {
    expect(answerSchemaForStep(0)).toBeNull();
    expect(answerSchemaForStep(13)).toBeNull();
    expect(answerSchemaForStep(-1)).toBeNull();
  });
});
