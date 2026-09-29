import { describe, expect, it } from "vitest";

import { getAnalyticsConfig, SEND_BEFORE_CONSENT } from "@/lib/analytics/config";
import { buildEvent, looksLikePersonalData } from "@/lib/analytics/sanitize";
import { EVENTS, type EventName } from "@/lib/analytics/schema";

const UUID = "3f2b8c1e-5a4d-4e7b-9c0a-1d2e3f4a5b6c";
const COMMON = { is_internal: false, app_env: "production", role: "anonymous" };

/** Um exemplo válido por evento: cada evento do tracking-plan tem um caso. */
const VALID: Record<EventName, Record<string, unknown>> = {
  landing_viewed: { path: "/", utm_source: "instagram", utm_medium: "social", utm_campaign: "volta_as_aulas", referrer_domain: "instagram.com" },
  school_searched: { query_length: 7, results_count: 3, has_filters: false },
  school_viewed: { school_inep: "51012345", verification_status: "registered" },
  list_viewed: { school_inep: "51012345", grade_slug: "5-ano", school_year: 2027, list_version_id: UUID, items_count: 22, has_alerts: true },
  purchase_clicked: { canal: "carrinho", list_version_id: UUID, school_inep: "51012345", grade_slug: "5-ano", retailer_slug: "papelaria-central" },
  list_upload_started: { source: "parent", mime_type: "image/jpeg", size_bucket: "1-5MB", has_school: true },
  ocr_completed: { duracao_ms: 4200, fila: "async", status: "accepted", items_count: 20, model_route: "vision", attempts: 1 },
  list_auto_approved: { overall_score_bucket: "gte_90", rules_version: "2026-09" },
  list_published: { school_inep: "51012345", grade_slug: "5-ano", school_year: 2027, origin: "auto", is_first_version: true },
  stationery_registered: { municipality_ibge: "5103403", offers_pickup: true, offers_delivery: false },
  catalog_activated: { catalog_items_count: 120, days_since_registered: 3 },
  lead_received: { billing_source: "free_lead", items_count_bucket: "6-15", school_inep: "51012345" },
  lead_converted: { signals: ["stationery", "parent"], hours_to_convert: 30 },
  login_started: { method: "magic_link" },
  login_completed: { method: "google" },
  list_shared: { channel: "whatsapp", school_inep: "51012345", grade_slug: "5-ano" },
  cart_options_viewed: { list_version_id: UUID, options_count: 3 },
  stationery_onboarding_step: { step: "catalog", status: "completed" },
};

describe("esquema de eventos", () => {
  it("todo evento tem exemplo válido e todo exemplo tem evento", () => {
    expect(Object.keys(VALID).sort()).toEqual(Object.keys(EVENTS).sort());
  });

  it.each(Object.keys(VALID) as EventName[])("%s: exemplo válido passa", (name) => {
    const r = buildEvent(name, VALID[name], COMMON);
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });

  it.each(Object.keys(VALID) as EventName[])("%s: propriedade fora do esquema é descartada e o evento passa", (name) => {
    const r = buildEvent(name, { ...VALID[name], email: "a@b.com", apelido: "Duda", nickname: "Duda", student_grade: "5o", text: "x", query: "caderno" }, COMMON);
    expect(r.ok).toBe(true);
    if (r.ok) {
      for (const k of ["email", "apelido", "nickname", "student_grade", "text", "query"]) expect(r.properties).not.toHaveProperty(k);
    }
  });

  it.each(Object.keys(VALID) as EventName[])("%s: nenhum esquema tem campo de texto livre nem chave de PII", (name) => {
    const keys = Object.keys(EVENTS[name].shape);
    for (const k of ["email", "phone", "telefone", "nome", "name", "apelido", "nickname", "cpf", "cnpj", "text", "query", "message"]) {
      expect(keys).not.toContain(k);
    }
  });

  it("chaves do protótipo não passam como propriedade", () => {
    const r = buildEvent("school_searched", { ...VALID.school_searched, constructor: "x", toString: "y" }, COMMON);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.properties).sort()).toEqual(["app_env", "has_filters", "is_internal", "query_length", "results_count", "role"]);
  });

  it("school_searched com query (texto) tem a chave descartada; query_length só aceita inteiro", () => {
    const r = buildEvent("school_searched", { ...VALID.school_searched, query: "Escola Maria" }, COMMON);
    expect(r.ok && "query" in r.properties).toBe(false);
    expect(buildEvent("school_searched", { ...VALID.school_searched, query_length: 7.5 }, COMMON)).toEqual({ ok: false, reason: "schema" });
    expect(buildEvent("school_searched", { ...VALID.school_searched, query_length: "7" }, COMMON)).toEqual({ ok: false, reason: "schema" });
    expect(buildEvent("school_searched", { ...VALID.school_searched, query_length: -1 }, COMMON)).toEqual({ ok: false, reason: "schema" });
  });

  it("valor fora do domínio derruba o evento por esquema", () => {
    expect(buildEvent("purchase_clicked", { ...VALID.purchase_clicked, canal: "outro" }, COMMON)).toEqual({ ok: false, reason: "schema" });
    expect(buildEvent("list_viewed", { ...VALID.list_viewed, list_version_id: "nao-e-uuid" }, COMMON)).toEqual({ ok: false, reason: "schema" });
    expect(buildEvent("list_viewed", { ...VALID.list_viewed, school_inep: "123" }, COMMON)).toEqual({ ok: false, reason: "schema" });
    expect(buildEvent("landing_viewed", { path: "/" }, { app_env: "production" })).toEqual({ ok: false, reason: "schema" });
  });

  it("propriedade comum fora do esquema comum é descartada", () => {
    const r = buildEvent("login_started", VALID.login_started, { ...COMMON, email: "a@b.com", ip: "1.2.3.4" });
    expect(r.ok && Object.keys(r.properties)).not.toContain("email");
  });
});

describe("PII derruba o evento", () => {
  const cases: [string, string][] = [
    ["e-mail", "mae@exemplo.com.br"],
    ["telefone com máscara", "(65) 99999-1234"],
    ["telefone sem máscara", "65999991234"],
    ["telefone com DDI", "+55 65 99999-1234"],
    ["CPF pontuado", "123.456.789-09"],
    ["CPF cru", "12345678909"],
    ["CNPJ", "12.345.678/0001-90"],
    ["CNPJ cru", "12345678000190"],
  ];
  for (const [label, value] of cases) {
    it(`${label} em campo string de qualquer evento (utm_content, path, retailer_slug, referrer_domain)`, () => {
      expect(buildEvent("landing_viewed", { ...VALID.landing_viewed, utm_content: value }, COMMON)).toMatchObject({ ok: false });
      expect(buildEvent("landing_viewed", { ...VALID.landing_viewed, referrer_domain: value }, COMMON)).toMatchObject({ ok: false });
      expect(buildEvent("landing_viewed", { ...VALID.landing_viewed, path: `/x/${value}` }, COMMON)).toMatchObject({ ok: false });
      expect(buildEvent("purchase_clicked", { ...VALID.purchase_clicked, retailer_slug: value }, COMMON)).toMatchObject({ ok: false });
    });
    it(`${label} numa propriedade comum derruba o evento`, () => {
      expect(buildEvent("login_started", VALID.login_started, { ...COMMON, municipality_ibge: value })).toMatchObject({ ok: false });
    });
  }

  it("reason pii quando o valor passa no formato mas parece dado pessoal", () => {
    // utm_* é texto restrito por formato; e-mail e telefone caem por esquema ou por PII, nunca saem.
    const r = buildEvent("landing_viewed", { ...VALID.landing_viewed, utm_source: "65999991234" }, COMMON);
    expect(r).toEqual({ ok: false, reason: "pii" });
  });

  it("uuid, INEP de 8 dígitos e IBGE de 7 dígitos não são PII", () => {
    expect(looksLikePersonalData(UUID)).toBe(false);
    expect(looksLikePersonalData("51012345")).toBe(false);
    expect(looksLikePersonalData("5103403")).toBe(false);
    expect(looksLikePersonalData("mae@exemplo.com")).toBe(true);
    expect(looksLikePersonalData(["ok", "mae@exemplo.com"])).toBe(true);
    expect(looksLikePersonalData(5511999991234)).toBe(false);
  });

  it("apelido de aluno e série+escola de menor não têm campo: chaves são descartadas", () => {
    const r = buildEvent("list_viewed", { ...VALID.list_viewed, student_nickname: "Duda", student_id: UUID, child_grade: "5o ano", student_school: "51012345" }, COMMON);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.properties).filter((k) => /student|child|nick|apelido/.test(k))).toEqual([]);
    }
  });
});

describe("configuração", () => {
  it("sem NEXT_PUBLIC_POSTHOG_KEY fica desligado", () => {
    expect(getAnalyticsConfig({})).toEqual({ enabled: false });
    expect(getAnalyticsConfig({ NEXT_PUBLIC_POSTHOG_KEY: "" })).toEqual({ enabled: false });
    expect(getAnalyticsConfig({ NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com" })).toEqual({ enabled: false });
  });

  it("com chave liga; host padrão só de config; ambiente derivado", () => {
    const c = getAnalyticsConfig({ NEXT_PUBLIC_POSTHOG_KEY: "phc_x", NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com", APP_ENV: "staging" });
    expect(c).toMatchObject({ enabled: true, key: "phc_x", host: "https://eu.i.posthog.com", appEnv: "staging" });
    const d = getAnalyticsConfig({ NEXT_PUBLIC_POSTHOG_KEY: "phc_x" });
    expect(d).toMatchObject({ enabled: true, host: "https://us.i.posthog.com", appEnv: "local" });
  });

  it("host inválido (não https) desliga em vez de enviar para lugar incerto", () => {
    expect(getAnalyticsConfig({ NEXT_PUBLIC_POSTHOG_KEY: "phc_x", NEXT_PUBLIC_POSTHOG_HOST: "http://evil.example" })).toEqual({ enabled: false });
    expect(getAnalyticsConfig({ NEXT_PUBLIC_POSTHOG_KEY: "phc_x", NEXT_PUBLIC_POSTHOG_HOST: "lixo" })).toEqual({ enabled: false });
  });

  it("nada é enviado antes do consentimento (Ruling da S28)", () => {
    expect(SEND_BEFORE_CONSENT).toBe(false);
  });
});
