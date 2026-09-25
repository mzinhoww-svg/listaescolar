import { describe, expect, it } from "vitest";

import { formatCnpj, isValidCnpj, normalizeCnpj } from "@/features/stationeries/cnpj";
import { normalizeCep, normalizePhone, normalizeWhatsapp } from "@/features/stationeries/phone";

import { makeCnpj } from "./helpers";

describe("CNPJ", () => {
  it.each([
    ["11222333000181", true],
    ["11.222.333/0001-81", true],
    ["11.444.777/0001-61", true],
    ["00.000.000/0001-91", true],
    [makeCnpj("123456780001"), true],
    ["11222333000182", false], // dígito errado
    ["11222333000191", false],
    ["11111111111111", false], // repetidos
    ["00000000000000", false],
    ["99999999999999", false],
    ["1122233300018", false], // 13 dígitos
    ["112223330001811", false], // 15 dígitos
    ["", false],
    ["abcdefghijklmn", false],
    ["11.222.333/0001-8x", false],
  ])("isValidCnpj(%j) = %s", (input, expected) => {
    expect(isValidCnpj(input)).toBe(expected);
  });
  it.each([
    ["12ABC34501DE35", true], // exemplo oficial (IN RFB 2.229/2024)
    ["12.ABC.345/01DE-35", true],
    ["12.abc.345/01de-35", true], // caixa baixa é normalizada
    [makeCnpj("A1B2C3D4E5F6"), true],
    [makeCnpj("ZZZZZZZZ0001"), true],
    [makeCnpj("0A0B0C0D0E0F"), true],
    ["12ABC34501DE34", false], // dígito verificador errado
    ["12ABC34501DE3A", false], // letra em dígito verificador
    ["12ABC34501DEAB", false],
    ["AAAAAAAAAAAAAA", false], // caracteres repetidos
    ["12ABC34501DE3", false],
    ["12ABC34501DE355", false],
    ["12ABC3450!DE35", false],
    ["12ÁBC34501DE35", false],
  ])("CNPJ alfanumérico isValidCnpj(%j) = %s", (input, expected) => {
    expect(isValidCnpj(input)).toBe(expected);
  });
  it("alfanumérico: normaliza para [0-9A-Z]{14} e formata", () => {
    expect(normalizeCnpj("12.abc.345/01de-35")).toBe("12ABC34501DE35");
    expect(formatCnpj("12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });
  it("normaliza e formata", () => {
    expect(normalizeCnpj("11.222.333/0001-81")).toBe("11222333000181");
    expect(normalizeCnpj("11.222.333/0001-82")).toBeNull();
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });
});

describe("telefone e WhatsApp (E.164 BR)", () => {
  it.each([
    ["(65) 99999-8888", "+5565999998888"],
    ["65 99999 8888", "+5565999998888"],
    ["+55 65 99999-8888", "+5565999998888"],
    ["5565999998888", "+5565999998888"],
    ["(65) 3333-4444", "+556533334444"],
    ["55999998888", "+5555999998888"], // DDD 55 (RS), não código do país
    ["+5565999998888", "+5565999998888"],
    ["0 65 99999-8888", "+5565999998888"], // zero de tronco
    ["(065) 3333-4444", "+556533334444"],
    ["065999998888", "+5565999998888"],
    ["(65) 8888-7777", null], // 10 dígitos começando em 8: nem fixo nem celular
    ["(65) 9999-8888", null], // 10 dígitos com 9
    ["(05) 99999-8888", null], // DDD com zero
    ["(65) 89999-8888", null], // 11 dígitos sem 9
    ["+1 650 555 1212", null], // outro país
    ["99999", null],
    ["", null],
    ["65 99999-88x8", null],
  ])("normalizeWhatsapp(%j) = %j", (input, expected) => {
    expect(normalizeWhatsapp(input)).toBe(expected);
    expect(normalizePhone(input)).toBe(expected);
  });
  it.each([
    ["78005-000", "78005000"],
    ["78005000", "78005000"],
    ["7800-5000", null],
    ["00000-000", null],
    ["abcde-fgh", null],
    ["", null],
  ])("normalizeCep(%j) = %j", (input, expected) => {
    expect(normalizeCep(input)).toBe(expected);
  });
});
