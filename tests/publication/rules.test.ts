import { describe, expect, it } from "vitest";
import { ALERT_CODE_LIST } from "@/supabase/functions/_shared/extraction-schema.ts";
import { REASON_CODES, type ReasonCode } from "@/supabase/functions/_shared/publication/codes.ts";
import { PUBLICATION_RULES_VERSION, RULES, evaluatePublication } from "@/features/publication/rules";
import type { PublicationContext, PublicationInput, PublicationSettings } from "@/supabase/functions/_shared/publication/types.ts";

// Valores sintéticos de teste; as regras só leem os limiares recebidos em `settings`.
const T = 0.8;
const TI = 0.6;
const CRITICAL = ["handwritten", "invalid_school_grade_year", "text_document_mismatch"] as const;
const ITEM_ALERTS = ["low_confidence_item", "ambiguous_item", "possible_collective_item", "restrictive_brand_or_spec"] as const;

const baseSettings = (): PublicationSettings => ({
  confidenceThreshold: T,
  itemConfidenceThreshold: TI,
  criticalAlerts: [...CRITICAL],
  autoPublishEnabled: true,
});
const baseContext = (): PublicationContext => ({
  school: { verification: "verified", municipalityEnabled: true },
  gradeSlug: "ef-4",
  validSchoolYears: [2026, 2027],
  submitterLinked: true,
  currentList: { listId: "30000000-0000-4000-8000-000000000001", status: "published", currentVersionId: "40000000-0000-4000-8000-000000000001" },
});
type Item = {
  name: string;
  quantity: number | null;
  unit: string | null;
  confidence: number;
  normalizedName?: string;
  category?: string;
  alerts?: string[];
};
const baseItem = (): Item => ({ name: "Caderno", quantity: 2, unit: "un", confidence: 0.9, normalizedName: "caderno", category: "papelaria", alerts: [] });
const baseResult = (): Record<string, unknown> => ({
  items: [baseItem(), { ...baseItem(), name: "Lápis", normalizedName: "lapis", category: "escrita" }],
  overallConfidence: 0.9,
  warnings: [],
  pipelineVersion: "s08.1",
  alerts: [],
  criticalAlerts: [],
  lowConfidence: false,
  requiresReview: true,
});
const baseInput = (): PublicationInput => ({
  submissionId: "10000000-0000-4000-8000-0000000000aa",
  schoolId: "50000000-0000-4000-8000-000000000001",
  submittedBy: "00000000-0000-4000-8000-000000000002",
  source: "school",
  grade: "4º ano",
  schoolYear: 2027,
  isDemo: false,
  result: baseResult(),
  context: baseContext(),
  publisherAvailable: true,
});

type Mut = { input?: Partial<PublicationInput>; result?: Record<string, unknown>; ctx?: Partial<PublicationContext>; settings?: Partial<PublicationSettings> | null; items?: Item[] };
function run(m: Mut = {}) {
  const input = baseInput();
  const result = { ...baseResult(), ...(m.result ?? {}) };
  if (m.items) result.items = m.items;
  const built: PublicationInput = { ...input, result, ...(m.input ?? {}) };
  if (m.ctx) built.context = { ...baseContext(), ...m.ctx };
  const settings = m.settings === null ? null : { ...baseSettings(), ...(m.settings ?? {}) };
  return { input: built, settings, verdict: evaluatePublication(built, settings) };
}
const itemWith = (over: Partial<Item>): Item => ({ ...baseItem(), ...over });
const withItems = (over: Partial<Item>): Mut => ({ items: [itemWith(over), baseItem()] });

describe("regras da publicação automática: entrada-base", () => {
  it("passa em tudo: auto_publish, sem motivos, justificativa rules_passed", () => {
    const { verdict } = run();
    expect(verdict).toEqual({ outcome: "auto_publish", reasons: [], justification: "rules_passed" });
  });
  it("cada regra isolada devolve lista vazia na base", () => {
    const { input, settings } = run();
    for (const [name, rule] of Object.entries(RULES)) expect(rule(input, settings), name).toEqual([]);
    expect(Object.keys(RULES)).toEqual(["overallScore", "noCriticalAlert", "noPendingItem", "requiredFields", "validSchoolGradeYear", "officialSource", "operational"]);
  });
  it("versão das regras", () => expect(PUBLICATION_RULES_VERSION).toBe("s09.1"));
});

type Row = [string, Mut, ReasonCode[]];
const rows: Row[] = [
  // 1. overallScore
  ["score = limiar passa", { result: { overallConfidence: T } }, []],
  ["score = limiar - 0,001 falha", { result: { overallConfidence: T - 0.001 } }, ["overall_below_threshold"]],
  ["score zero falha", { result: { overallConfidence: 0 } }, ["overall_below_threshold"]],
  ["lowConfidence true", { result: { lowConfidence: true } }, ["low_confidence_extraction"]],
  // 2. noCriticalAlert (documento)
  ...ALERT_CODE_LIST.map((a): Row => [`alerta ${a} no documento, crítico`, { result: { alerts: [a] }, settings: { criticalAlerts: [a] } }, a === "invalid_school_grade_year" ? ["critical_alert", "school_grade_year_mismatch"] : ["critical_alert"]]),
  ...ALERT_CODE_LIST.map((a): Row => [`alerta ${a} no documento, não crítico`, { result: { alerts: [a] }, settings: { criticalAlerts: [] } }, a === "invalid_school_grade_year" ? ["school_grade_year_mismatch"] : []]),
  // 2. noCriticalAlert (item)
  ...ALERT_CODE_LIST.map((a): Row => {
    const isItemType = (ITEM_ALERTS as readonly string[]).includes(a);
    const codes = (crit: boolean): ReasonCode[] => {
      const out: ReasonCode[] = [];
      if (crit) out.push("critical_alert");
      if (isItemType) out.push("item_flagged");
      if (a === "invalid_school_grade_year") out.push("school_grade_year_mismatch");
      return out;
    };
    return [`alerta ${a} em item, crítico`, { ...withItems({ alerts: [a] }), settings: { criticalAlerts: [a] } }, codes(true)];
  }),
  ...ALERT_CODE_LIST.map((a): Row => {
    const isItemType = (ITEM_ALERTS as readonly string[]).includes(a);
    const codes: ReasonCode[] = [];
    if (isItemType) codes.push("item_flagged");
    if (a === "invalid_school_grade_year") codes.push("school_grade_year_mismatch");
    return [`alerta ${a} em item, não crítico`, { ...withItems({ alerts: [a] }), settings: { criticalAlerts: [] } }, codes];
  }),
  ["result.criticalAlerts não vazio, settings sem críticos", { result: { criticalAlerts: ["handwritten"] }, settings: { criticalAlerts: [] } }, ["critical_alert"]],
  // 3. noPendingItem
  ["lista vazia", { items: [] }, ["empty_list"]],
  ["item com confiança = limiar por item passa", withItems({ confidence: TI }), []],
  ["item abaixo do limiar por item", withItems({ confidence: TI - 0.001 }), ["item_below_threshold"]],
  ["quantidade null", withItems({ quantity: null }), ["item_without_quantity"]],
  ["quantidade 0", withItems({ quantity: 0 }), ["item_without_quantity"]],
  ...ITEM_ALERTS.map((a): Row => [`item com ${a}`, withItems({ alerts: [a] }), ["item_flagged"]]),
  // 4. requiredFields
  ["item sem normalizedName", withItems({ normalizedName: undefined }), ["item_incomplete"]],
  ["item sem category", withItems({ category: undefined }), ["item_incomplete"]],
  ["item com normalizedName só de espaços", withItems({ normalizedName: "   " }), ["item_incomplete"]],
  ["envio sem escola", { input: { schoolId: null } }, ["missing_school"]],
  ["envio sem série", { input: { grade: null } }, ["missing_grade"]],
  ["envio com série em branco", { input: { grade: "  " } }, ["missing_grade"]],
  ["envio sem ano", { input: { schoolYear: null } }, ["missing_school_year"]],
  ["metadado ausente: pipelineVersion", { result: { pipelineVersion: undefined } }, ["extraction_metadata_missing"]],
  ["metadado ausente: alerts", { result: { alerts: undefined } }, ["extraction_metadata_missing"]],
  ["metadado ausente: criticalAlerts", { result: { criticalAlerts: undefined } }, ["extraction_metadata_missing"]],
  ["metadado ausente: lowConfidence", { result: { lowConfidence: undefined } }, ["extraction_metadata_missing"]],
  // 5. validSchoolGradeYear
  ["contexto sem a escola", { ctx: { school: null } }, ["school_not_found"]],
  ["escola registered", { ctx: { school: { verification: "registered", municipalityEnabled: true } } }, ["school_not_verified"]],
  ["escola claimed", { ctx: { school: { verification: "claimed", municipalityEnabled: true } } }, ["school_not_verified"]],
  ["escola suspended", { ctx: { school: { verification: "suspended", municipalityEnabled: true } } }, ["school_suspended"]],
  ["município desabilitado", { ctx: { school: { verification: "verified", municipalityEnabled: false } } }, ["municipality_not_enabled"]],
  ["série não resolvida", { ctx: { gradeSlug: null } }, ["grade_unresolved"]],
  ["ano fora da lista", { input: { schoolYear: 2031 } }, ["school_year_invalid"]],
  ["lista arquivada", { ctx: { currentList: { listId: "30000000-0000-4000-8000-000000000001", status: "archived", currentVersionId: null } } }, ["list_archived"]],
  ["sem lista atual (primeira publicação) passa", { ctx: { currentList: null } }, []],
  // 6. officialSource
  ["envio de pai", { input: { source: "parent" } }, ["parent_submission"]],
  ["remetente não vinculado (false)", { ctx: { submitterLinked: false } }, ["submitter_not_linked"]],
  ["remetente não vinculado (null)", { ctx: { submitterLinked: null } }, ["submitter_not_linked"]],
  // 7. operational
  ["envio demo", { input: { isDemo: true } }, ["demo_submission"]],
  ["autoPublishEnabled false", { settings: { autoPublishEnabled: false } }, ["auto_publish_disabled"]],
  ["porta de publicação ausente", { input: { publisherAvailable: false } }, ["publisher_unavailable"]],
  ["contexto ausente", { input: { context: null } }, ["context_unavailable"]],
  ["settings ausentes", { settings: null }, ["settings_unavailable"]],
  // resultado inválido / formato demo
  ["resultado inválido (não objeto)", { input: { result: "lixo" } }, ["invalid_extraction_result"]],
  ["resultado inválido (sem items)", { input: { result: { overallConfidence: 0.9, warnings: [] } } }, ["invalid_extraction_result"]],
  ["resultado inválido (confiança NaN)", { result: { overallConfidence: Number.NaN } }, ["invalid_extraction_result"]],
  ["resultado nulo", { input: { result: null } }, ["invalid_extraction_result"]],
  ["requiresReview ausente é ignorado", { result: { requiresReview: undefined } }, []],
];

describe("tabela: uma mudança por linha, conjunto exato de códigos", () => {
  it.each(rows)("%s", (_name, mut, expected) => {
    const { verdict } = run(mut);
    expect(verdict.reasons).toEqual(expected);
    expect(verdict.outcome).toBe(expected.length === 0 ? "auto_publish" : "human_review");
    expect(verdict.justification).toBe(expected[0] ?? "rules_passed");
  });

  it("resultado no formato demo da S07 (sem metadados da S08)", () => {
    const demo = { items: [{ name: "Caderno", quantity: 2, unit: "un", confidence: 0.95 }], overallConfidence: 0.95, warnings: [] };
    const { verdict } = run({ input: { result: demo } });
    expect(verdict.reasons).toEqual(["item_incomplete", "extraction_metadata_missing"]);
    expect(verdict.outcome).toBe("human_review");
  });

  it("invalid_school_grade_year bloqueia com e sem estar nos críticos (e só a regra 5 o cobre quando não crítico)", () => {
    expect(run({ result: { alerts: ["invalid_school_grade_year"] }, settings: { criticalAlerts: [] } }).verdict.reasons).toEqual(["school_grade_year_mismatch"]);
    expect(run({ result: { alerts: ["invalid_school_grade_year"] } }).verdict.reasons).toEqual(["critical_alert", "school_grade_year_mismatch"]);
  });
});

describe("regra por regra (funções isoladas)", () => {
  it("cada regra devolve só os códigos da sua responsabilidade", () => {
    const owners: Record<string, ReasonCode[]> = {
      overallScore: ["overall_below_threshold", "low_confidence_extraction"],
      noCriticalAlert: ["critical_alert"],
      noPendingItem: ["empty_list", "item_below_threshold", "item_without_quantity", "item_flagged"],
      requiredFields: ["missing_school", "missing_grade", "missing_school_year", "item_incomplete", "extraction_metadata_missing", "invalid_extraction_result"],
      validSchoolGradeYear: ["school_not_found", "school_not_verified", "school_suspended", "municipality_not_enabled", "grade_unresolved", "school_year_invalid", "school_grade_year_mismatch", "list_archived"],
      officialSource: ["parent_submission", "submitter_not_linked"],
      operational: ["demo_submission", "auto_publish_disabled", "publisher_unavailable", "context_unavailable", "settings_unavailable"],
    };
    // tudo errado ao mesmo tempo: cada regra só emite os seus.
    const bad = baseInput();
    bad.source = "parent";
    bad.isDemo = true;
    bad.grade = null;
    bad.schoolYear = 2031;
    bad.result = { items: [], overallConfidence: 0.1, warnings: [], lowConfidence: true, alerts: ["invalid_school_grade_year"], criticalAlerts: ["handwritten"] };
    bad.context = { school: { verification: "suspended", municipalityEnabled: false }, gradeSlug: null, validSchoolYears: [2026], submitterLinked: false, currentList: { listId: "30000000-0000-4000-8000-000000000001", status: "archived", currentVersionId: null } };
    for (const [name, rule] of Object.entries(RULES)) {
      const got = rule(bad, { ...baseSettings(), autoPublishEnabled: false });
      for (const c of got) expect(owners[name], `${name} emitiu ${c}`).toContain(c);
      expect(got.length, name).toBeGreaterThan(0);
    }
  });
});

describe("composição do veredito", () => {
  it("várias falhas juntas: todos os códigos na ordem canônica, justificativa = o primeiro", () => {
    const { verdict } = run({
      result: { overallConfidence: 0.1, lowConfidence: true },
      items: [],
      input: { source: "parent", isDemo: true },
      ctx: { school: { verification: "suspended", municipalityEnabled: false } },
      settings: { autoPublishEnabled: false },
    });
    const expected: ReasonCode[] = ["overall_below_threshold", "low_confidence_extraction", "empty_list", "school_suspended", "municipality_not_enabled", "parent_submission", "demo_submission", "auto_publish_disabled"];
    expect(verdict.reasons).toEqual(expected);
    expect(verdict.justification).toBe("overall_below_threshold");
    expect(verdict.outcome).toBe("human_review");
    const idx = verdict.reasons.map((r) => REASON_CODES.indexOf(r));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  it("nada de curto-circuito: uma falha não esconde a de outra regra", () => {
    const { verdict } = run({ input: { schoolId: null, isDemo: true }, result: { lowConfidence: true } });
    expect(verdict.reasons).toEqual(["low_confidence_extraction", "missing_school", "demo_submission"]);
  });

  it("limiares vindos de settings mudam o veredito sem mudar código", () => {
    const mid = { result: { overallConfidence: 0.85 } };
    expect(run(mid).verdict.outcome).toBe("auto_publish");
    expect(run({ ...mid, settings: { confidenceThreshold: 0.9 } }).verdict.reasons).toEqual(["overall_below_threshold"]);
    const it65 = withItems({ confidence: 0.65 });
    expect(run(it65).verdict.outcome).toBe("auto_publish");
    expect(run({ ...it65, settings: { itemConfidenceThreshold: 0.7 } }).verdict.reasons).toEqual(["item_below_threshold"]);
    const hw = { result: { alerts: ["handwritten"] } };
    expect(run({ ...hw, settings: { criticalAlerts: [] } }).verdict.outcome).toBe("auto_publish");
    expect(run(hw).verdict.reasons).toEqual(["critical_alert"]);
  });

  it("limiares gravados no resultado da extração não valem: só os das settings atuais", () => {
    // lowConfidence:false e criticalAlerts:[] são o julgamento da extração com os limiares DAQUELE momento.
    const low = run({ result: { overallConfidence: 0.5, lowConfidence: false, criticalAlerts: [] } });
    expect(low.verdict.reasons).toEqual(["overall_below_threshold"]);
    const crit = run({ result: { alerts: ["handwritten"], criticalAlerts: [], lowConfidence: false }, settings: { criticalAlerts: ["handwritten"] } });
    expect(crit.verdict.reasons).toEqual(["critical_alert"]);
    // e o inverso: extração acusou crítico e settings atuais aliviaram; o resultado continua bloqueando (Ruling).
    expect(run({ result: { criticalAlerts: ["handwritten"] }, settings: { criticalAlerts: [] } }).verdict.reasons).toEqual(["critical_alert"]);
  });

  it("monotonicidade: piorar nunca vira human_review em auto_publish (merge explícito)", () => {
    const worse: Mut[] = [
      { result: { alerts: ["handwritten"] } },
      { result: { overallConfidence: 0.1 } },
      withItems({ confidence: 0.1 }),
      withItems({ alerts: ["ambiguous_item"] }),
      { result: { alerts: ["possible_collective_item"] }, settings: { criticalAlerts: ["possible_collective_item"] } },
    ];
    const bads: Mut[] = [{ input: { source: "parent" } }, { input: { isDemo: true } }, { result: { lowConfidence: true } }, { items: [] }, { ctx: { submitterLinked: false } }, { settings: { autoPublishEnabled: false } }];
    const merge = (a: Mut, b: Mut): Mut => ({
      input: { ...a.input, ...b.input },
      result: { ...a.result, ...b.result },
      ctx: { ...a.ctx, ...b.ctx },
      settings: a.settings === null || b.settings === null ? null : { ...a.settings, ...b.settings },
      items: b.items ?? a.items,
    });
    for (const bad of bads) {
      expect(run(bad).verdict.outcome).toBe("human_review");
      for (const w of worse) expect(run(merge(bad, w)).verdict.outcome, JSON.stringify([bad, w])).toBe("human_review");
    }
  });

  it("a partir da base auto_publish, cada tipo de piora isolada nunca resulta em auto_publish", () => {
    expect(run().verdict.outcome).toBe("auto_publish");
    const worse: Mut[] = [
      { result: { overallConfidence: T - 0.001 } },
      { result: { lowConfidence: true } },
      { result: { alerts: ["handwritten"] } },
      { result: { criticalAlerts: ["handwritten"] } },
      withItems({ confidence: TI - 0.001 }),
      withItems({ alerts: ["ambiguous_item"] }),
      withItems({ quantity: null }),
      { items: [] },
      { input: { schoolId: null } },
      { input: { schoolYear: null } },
      { input: { source: "parent" } },
      { input: { isDemo: true } },
      { input: { publisherAvailable: false } },
      { ctx: { submitterLinked: false } },
      { ctx: { school: { verification: "claimed", municipalityEnabled: true } } },
      { settings: { autoPublishEnabled: false } },
      { settings: null },
    ];
    for (const w of worse) expect(run(w).verdict.outcome, JSON.stringify(w)).toBe("human_review");
  });

  it("veredito só é auto_publish com reasons vazio", () => {
    for (const [, mut, expected] of rows) expect(run(mut).verdict.outcome === "auto_publish").toBe(expected.length === 0);
  });
});
