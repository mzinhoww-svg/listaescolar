import { describe, expect, it } from "vitest";
import { approvalBlockers, criticalAlertsIn, publicationBlockers, type GateInput } from "@/features/review/gate";
import type { PublicationContext } from "@/supabase/functions/_shared/publication/types.ts";

const SCHOOL = "50000000-0000-4000-8000-0000000000c1";
const item = (over: Record<string, unknown> = {}) => ({ name: "Caderno", quantity: 2, unit: "un", category: "papelaria" as const, confidence: 0.9, alerts: [], origin: "extracted" as const, ...over });
const good = (over: Partial<GateInput> = {}): GateInput => ({ schoolId: SCHOOL, grade: "4º ano", schoolYear: 2027, items: [item()] as GateInput["items"], ...over });
const ctx = (over: Partial<PublicationContext> = {}): PublicationContext => ({
  school: { verification: "verified", municipalityEnabled: true },
  gradeSlug: "ef-4",
  validSchoolYears: [2027],
  submitterLinked: true,
  currentList: null,
  ...over,
});

describe("approvalBlockers (intrínsecos, uma mutação por linha)", () => {
  it("versão completa: sem bloqueios", () => {
    expect(approvalBlockers(good())).toEqual([]);
  });
  it.each<[string, Partial<GateInput>, string[]]>([
    ["sem itens", { items: [] }, ["no_items"]],
    ["nome em branco", { items: [item({ name: "  " })] as GateInput["items"] }, ["item_name_missing"]],
    ["quantidade nula", { items: [item({ quantity: null })] as GateInput["items"] }, ["item_quantity_missing"]],
    ["categoria nula", { items: [item({ category: null })] as GateInput["items"] }, ["item_category_missing"]],
    ["sem série", { grade: null }, ["grade_missing"]],
    ["sem ano", { schoolYear: null }, ["school_year_missing"]],
    ["sem escola", { schoolId: null }, ["school_missing"]],
    ["dois problemas: ordem canônica", { grade: null, items: [item({ quantity: null })] as GateInput["items"] }, ["item_quantity_missing", "grade_missing"]],
  ])("%s", (_n, over, codes) => {
    expect(approvalBlockers(good(over))).toEqual(codes);
  });
  it("alerta crítico sem confirmação bloqueia; confirmado libera", () => {
    expect(approvalBlockers(good(), { required: true, acknowledged: false })).toEqual(["critical_alerts_unconfirmed"]);
    expect(approvalBlockers(good(), { required: true, acknowledged: true })).toEqual([]);
    expect(approvalBlockers(good(), { required: false, acknowledged: false })).toEqual([]);
  });
});

describe("publicationBlockers (intrínsecos + contexto da porta)", () => {
  it("contexto bom: nada; escola registered/claimed é permitida (não exige verified)", () => {
    expect(publicationBlockers(good(), ctx())).toEqual([]);
    expect(publicationBlockers(good(), ctx({ school: { verification: "registered", municipalityEnabled: true } }))).toEqual([]);
    expect(publicationBlockers(good(), ctx({ school: { verification: "claimed", municipalityEnabled: true } }))).toEqual([]);
  });
  it.each<[string, PublicationContext | null, string[]]>([
    ["contexto nulo", null, ["context_unavailable"]],
    ["escola ausente", ctx({ school: null }), ["school_not_found"]],
    ["escola suspensa", ctx({ school: { verification: "suspended", municipalityEnabled: true } }), ["school_suspended"]],
    ["município não habilitado", ctx({ school: { verification: "verified", municipalityEnabled: false } }), ["municipality_not_enabled"]],
    ["série sem slug", ctx({ gradeSlug: null }), ["grade_unresolved"]],
    ["ano fora dos válidos", ctx({ validSchoolYears: [2026] }), ["school_year_invalid"]],
    ["lista arquivada", ctx({ currentList: { listId: "x", status: "archived", currentVersionId: null } }), ["list_archived"]],
    ["lista publicada é normal", ctx({ currentList: { listId: "x", status: "published", currentVersionId: "v" } }), []],
  ])("%s", (_n, c, codes) => {
    expect(publicationBlockers(good(), c)).toEqual(codes);
  });
  it("intrínseco + contexto juntos, em ordem canônica; ack crítico entra", () => {
    expect(publicationBlockers(good({ schoolYear: null }), ctx({ school: null }), { required: true, acknowledged: false })).toEqual([
      "school_year_missing",
      "critical_alerts_unconfirmed",
      "school_not_found",
    ]);
  });
});

describe("criticalAlertsIn", () => {
  const result = { alerts: ["handwritten"], criticalAlerts: [], items: [{ alerts: ["ambiguous_item"] }, {}] };
  it("interseção dos alertas do resultado (documento e itens) com a configuração", () => {
    expect(criticalAlertsIn(result, ["handwritten", "invalid_school_grade_year"])).toEqual(["handwritten"]);
    expect(criticalAlertsIn(result, ["ambiguous_item"])).toEqual(["ambiguous_item"]);
    expect(criticalAlertsIn(result, [])).toEqual([]);
  });
  it("o que a extração já marcou como crítico conta mesmo sem configuração", () => {
    expect(criticalAlertsIn({ ...result, criticalAlerts: ["text_document_mismatch"] }, [])).toEqual(["text_document_mismatch"]);
  });
  it("sem resultado: nada", () => {
    expect(criticalAlertsIn(null, ["handwritten"])).toEqual([]);
  });
});
