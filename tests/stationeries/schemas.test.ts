import { describe, expect, it } from "vitest";

import {
  StationeryBasicsSchema,
  StationeryConsentSchema,
  StationeryRegistrationSchema,
  StationeryServiceSchema,
} from "@/features/stationeries/schemas";

const MUNI = "11111111-1111-4111-8111-111111111111";
const basics = {
  tradeName: "  Papelaria Central ",
  legalName: "Papelaria Central LTDA",
  cnpj: "11.222.333/0001-81",
  municipalityId: MUNI,
  neighborhood: "Centro",
  cep: "78005-000",
};
const service = { whatsapp: "(65) 99999-8888", offersPickup: true };

describe("StationeryRegistrationSchema (por passo)", () => {
  it("passo 1: normaliza CNPJ e CEP, apara textos", () => {
    const r = StationeryBasicsSchema.parse(basics);
    expect(r.cnpj).toBe("11222333000181");
    expect(r.cep).toBe("78005000");
    expect(r.tradeName).toBe("Papelaria Central");
  });
  it.each([
    ["CNPJ inválido", { ...basics, cnpj: "11.222.333/0001-82" }],
    ["CNPJ repetido", { ...basics, cnpj: "11111111111111" }],
    ["município não uuid", { ...basics, municipalityId: "x" }],
    ["sem razão social", { ...basics, legalName: "" }],
    ["CEP inválido", { ...basics, cep: "123" }],
  ])("passo 1 recusa: %s", (_n, input) => {
    expect(StationeryBasicsSchema.safeParse(input).success).toBe(false);
  });
  it("passo 2: WhatsApp E.164 e ao menos retirada, entrega ou bairro", () => {
    expect(StationeryServiceSchema.parse(service).whatsapp).toBe("+5565999998888");
    expect(StationeryServiceSchema.safeParse({ whatsapp: "(65) 99999-8888" }).success).toBe(false);
    expect(StationeryServiceSchema.safeParse({ whatsapp: "(65) 99999-8888", areas: ["Centro"] }).success).toBe(true);
    expect(StationeryServiceSchema.safeParse({ ...service, whatsapp: "123" }).success).toBe(false);
    expect(StationeryServiceSchema.safeParse({ ...service, email: "nao-e-email" }).success).toBe(false);
    expect(StationeryServiceSchema.safeParse({ ...service, paymentMethods: ["bitcoin"] }).success).toBe(false);
    expect(StationeryServiceSchema.safeParse({ ...service, serviceRadiusKm: 51 }).success).toBe(false);
  });
  it("passo 3: exige aceite", () => {
    expect(StationeryConsentSchema.safeParse({ lgpdAccepted: false }).success).toBe(false);
    expect(StationeryConsentSchema.parse({ lgpdAccepted: true }).lgpdTextVersion).toMatch(/lgpd/);
  });
  it("cadastro completo", () => {
    const r = StationeryRegistrationSchema.safeParse({ basics, service, consent: { lgpdAccepted: true } });
    expect(r.success).toBe(true);
  });
});
