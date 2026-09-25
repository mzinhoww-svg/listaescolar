import { describe, expect, it } from "vitest";
import { GRADE_OPTIONS } from "@/features/submissions/copy";
import { parentCopyPayloadSchema, reviewItemSchema, reviewPayloadSchema, rejectSchema } from "@/features/review/schemas";
import { REJECT_REASONS } from "@/features/review/codes";

const item = (over: Record<string, unknown> = {}) => ({ name: "Caderno", quantity: 2, unit: "un", category: "papelaria", confidence: 0.9, alerts: [], origin: "extracted", ...over });
const payload = (over: Record<string, unknown> = {}) => ({ grade: "4º ano", schoolYear: 2027, items: [item()], expectedVersion: 1, ...over });

describe("reviewItemSchema (espelha review_items_valid)", () => {
  it("aceita item completo e texto hostil como texto; apara espaços do nome", () => {
    expect(reviewItemSchema.safeParse(item()).success).toBe(true);
    const hostil = reviewItemSchema.parse(item({ name: '  <img src=x onerror=alert(1)> "><script>  ' }));
    expect(hostil.name).toBe('<img src=x onerror=alert(1)> "><script>');
    expect(reviewItemSchema.safeParse(item({ name: "Régua < 5 anos", quantity: null, category: null, confidence: null, unit: null })).success).toBe(true);
  });
  it.each([
    ["nome vazio", { name: "   " }],
    ["nome de controle", { name: "a\nb" }],
    ["nome bidi", { name: "a‮b" }],
    ["nome 301", { name: "x".repeat(301) }],
    ["quantidade 0", { quantity: 0 }],
    ["quantidade 10000", { quantity: 10000 }],
    ["quantidade 1.5", { quantity: 1.5 }],
    ["quantidade string", { quantity: "2" }],
    ["categoria fora", { category: "moveis" }],
    ["alerta fora", { alerts: ["procon"] }],
    ["origem fora", { origin: "ai" }],
    ["confiança 2", { confidence: 2 }],
    ["unidade 41", { unit: "u".repeat(41) }],
    ["chave extra", { extra: 1 }],
  ])("recusa %s", (_n, over) => {
    expect(reviewItemSchema.safeParse(item(over)).success).toBe(false);
  });
});

describe("reviewPayloadSchema", () => {
  it("aceita série da lista e ano 2000..2100; nulos para série/ano", () => {
    expect(reviewPayloadSchema.safeParse(payload()).success).toBe(true);
    expect(reviewPayloadSchema.safeParse(payload({ grade: null, schoolYear: null })).success).toBe(true);
    for (const g of GRADE_OPTIONS) expect(reviewPayloadSchema.safeParse(payload({ grade: g })).success).toBe(true);
  });
  it.each([
    ["série fora da lista", { grade: "10º ano" }],
    ["ano 1999", { schoolYear: 1999 }],
    ["ano 2101", { schoolYear: 2101 }],
    ["ano fracionário", { schoolYear: 2027.5 }],
    ["501 itens", { items: Array.from({ length: 501 }, () => item()) }],
    ["versão 0", { expectedVersion: 0 }],
    ["versão 201", { expectedVersion: 201 }],
    ["actorId forjado", { actorId: "00000000-0000-4000-8000-000000000003" }],
    ["sem itens", { items: undefined }],
  ])("recusa %s", (_n, over) => {
    expect(reviewPayloadSchema.safeParse(payload(over)).success).toBe(false);
  });
});

describe("parentCopyPayloadSchema e rejectSchema", () => {
  it("cópia do pai: só itens e versão", () => {
    expect(parentCopyPayloadSchema.safeParse({ items: [item({ origin: "edited" })], expectedVersion: 2 }).success).toBe(true);
    expect(parentCopyPayloadSchema.safeParse({ items: [], expectedVersion: 1, grade: "4º ano" }).success).toBe(false);
    expect(parentCopyPayloadSchema.safeParse({ items: [item({ quantity: 0 })], expectedVersion: 1 }).success).toBe(false);
  });
  it("recusa só com motivo da lista fechada", () => {
    for (const reason of REJECT_REASONS) expect(rejectSchema.safeParse({ reason, expectedVersion: 1 }).success).toBe(true);
    expect(rejectSchema.safeParse({ reason: "porque sim", expectedVersion: 1 }).success).toBe(false);
    expect(rejectSchema.safeParse({ expectedVersion: 1 }).success).toBe(false);
  });
});
