import { describe, expect, it } from "vitest";

import { academicYears, defaultAcademicYear, findGrade, GRADES, parseGradeSelection } from "@/features/grades/catalog";
import { buildSchoolJsonLd, serializeJsonLd } from "@/features/schools/search/jsonld";
import { buildSchoolMetadata, buildSearchMetadata, isIndexableSchool } from "@/features/schools/search/seo";
import { statusLabel } from "@/features/schools/search/status";
import type { SchoolProfile, VerificationStatus } from "@/features/schools/search/types";
import { parseSearchParams } from "@/features/schools/search/params";

const school = (over: Partial<SchoolProfile> = {}): SchoolProfile => ({
  id: "3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b",
  inep: "51001234",
  name: "Escola Municipal Antônio Silva",
  network: "municipal",
  neighborhood: "Centro Sul",
  address: "Rua das Flores, 100",
  phone: "6533334444",
  municipalityId: "3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6c",
  municipalityName: "Cuiabá",
  uf: "MT",
  verificationStatus: "verified",
  isDemo: false,
  ...over,
});

describe("statusLabel", () => {
  const cases: [VerificationStatus, boolean, string, boolean][] = [
    ["registered", false, "Cadastrada", false],
    ["claimed", false, "Reivindicada", false],
    ["verified", false, "Escola verificada", true],
    ["suspended", false, "Suspensa", false],
    ["registered", true, "Cadastrada", false],
  ];
  it.each(cases)("%s demo=%s -> %s", (status, demo, label, verified) => {
    const r = statusLabel(status, demo);
    expect(r.label).toBe(label);
    expect(r.verified).toBe(verified);
    expect(r.demoLabel).toBe(demo ? "Demonstração" : null);
  });

  it("registered nunca sugere verificação", () => {
    const r = statusLabel("registered", false);
    expect(`${r.label} ${r.description}`.toLowerCase()).not.toMatch(/verificad/);
    expect(r.description).toContain("não indica verificação");
  });

  it("claimed não é apresentada como verificada", () => {
    expect(statusLabel("claimed", false).label.toLowerCase()).not.toContain("verificad");
  });

  it("suspensa avisa", () => {
    expect(statusLabel("suspended", false).description).toMatch(/suspens/);
  });
});

describe("buildSchoolMetadata", () => {
  const cases: [string, Partial<SchoolProfile>, boolean][] = [
    ["verificada", { verificationStatus: "verified" }, true],
    ["reivindicada", { verificationStatus: "claimed" }, true],
    ["cadastrada", { verificationStatus: "registered" }, false],
    ["suspensa", { verificationStatus: "suspended" }, false],
    ["verificada demo", { verificationStatus: "verified", isDemo: true }, false],
    ["reivindicada demo", { verificationStatus: "claimed", isDemo: true }, false],
  ];
  it.each(cases)("%s -> index=%s", (_n, over, index) => {
    const m = buildSchoolMetadata(school(over));
    expect(m.robots.index).toBe(index);
    expect(isIndexableSchool(school(over))).toBe(index);
    expect(m.alternates.canonical).toBe("/escolas/51001234");
    expect(m.title).toBe(
      over.isDemo ? "Escola Municipal Antônio Silva (Demonstração) · ListaCerta" : "Escola Municipal Antônio Silva · ListaCerta",
    );
    expect(m.description.includes("Demonstração")).toBe(Boolean(over.isDemo));
  });

  it("Open Graph replica título, descrição e canonical", () => {
    const m = buildSchoolMetadata(school({ verificationStatus: "verified" }));
    expect(m.openGraph).toMatchObject({
      type: "website",
      url: m.alternates.canonical,
      siteName: "ListaCerta",
      locale: "pt_BR",
      title: m.title,
      description: m.description,
    });
  });

  it("suspensa não segue links", () => {
    expect(buildSchoolMetadata(school({ verificationStatus: "suspended" })).robots.follow).toBe(false);
  });

  it("descrição sem bairro ausente nem afirmação jurídica", () => {
    const d = buildSchoolMetadata(school({ neighborhood: null })).description;
    expect(d).not.toMatch(/bairro|null|undefined|N\/A/);
    expect(d).toContain("Cuiabá/MT");
    expect(d).not.toMatch(/conform|oficial|garant/i);
  });
});

describe("buildSearchMetadata", () => {
  it.each([
    ["sem filtros", {}, true],
    ["com q", { q: "objetivo" }, false],
    ["com rede", { rede: "privada" }, false],
    ["página 2", { pagina: "2" }, false],
    ["q curto (ignorado)", { q: "a" }, false],
    ["pagina inválida", { pagina: "abc" }, false],
    ["rede inválida", { rede: "xyz" }, false],
    ["param vazio", { q: "" }, false],
    ["sem params", {}, true],
  ])("%s", (_n, raw, index) => {
    const m = buildSearchMetadata(parseSearchParams(raw));
    expect(m.robots.index).toBe(index);
    expect(m.alternates.canonical).toBe("/escolas");
  });
});

function ld(over: Partial<SchoolProfile> = {}, base?: string): Record<string, unknown> {
  const j = buildSchoolJsonLd(school(over), base);
  if (!j) throw new Error("esperava JSON-LD");
  return j;
}

describe("JSON-LD", () => {
  it.each([
    ["demo", { isDemo: true }],
    ["cadastrada", { verificationStatus: "registered" as const }],
    ["suspensa", { verificationStatus: "suspended" as const }],
  ])("sem JSON-LD para escola %s", (_n, over) => {
    expect(buildSchoolJsonLd(school(over))).toBeNull();
  });

  it("só campos existentes e sem e-mail", () => {
    const j = ld({}, "https://listacerta.example/");
    expect(j).toMatchObject({
      "@context": "https://schema.org",
      "@type": "School",
      name: "Escola Municipal Antônio Silva",
      identifier: "51001234",
      telephone: "+556533334444",
      url: "https://listacerta.example/escolas/51001234",
      address: { addressLocality: "Cuiabá", addressRegion: "MT", streetAddress: "Rua das Flores, 100", addressCountry: "BR" },
    });
    expect(JSON.stringify(j)).not.toMatch(/email|@[a-z]+\./i);
  });

  it("omite telefone, endereço e url ausentes", () => {
    const j = ld({ phone: null, address: null });
    expect(j).not.toHaveProperty("telephone");
    expect(j).not.toHaveProperty("url");
    expect(j.address as object).not.toHaveProperty("streetAddress");
    expect(JSON.stringify(j)).not.toMatch(/null|undefined|""/);
  });

  it("escapa < na serialização", () => {
    const s = serializeJsonLd(ld({ name: "</script><script>alert(1)</script>" }));
    expect(s).not.toContain("<");
    expect(JSON.parse(s).name).toBe("</script><script>alert(1)</script>");
  });
});

describe("catálogo de séries", () => {
  it("slugs únicos e estáveis", () => {
    const slugs = GRADES.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toEqual([
      "ei-maternal-1", "ei-maternal-2", "ei-pre-1", "ei-pre-2",
      "ef-1", "ef-2", "ef-3", "ef-4", "ef-5", "ef-6", "ef-7", "ef-8", "ef-9",
      "em-1", "em-2", "em-3",
    ]);
    expect(findGrade("ef-4")?.label).toBe("4º ano");
    expect(findGrade("em-2")?.label).toBe("2ª série");
    expect(findGrade("xx")).toBeNull();
    expect(findGrade(undefined)).toBeNull();
  });

  it("anos derivados de now", () => {
    expect(academicYears(new Date("2026-09-25T12:00:00Z"))).toEqual([2026, 2027]);
    expect(academicYears(new Date("2031-01-01T12:00:00Z"))).toEqual([2031, 2032]);
  });

  it.each([
    // [instante UTC, [ano corrente, próximo], ano padrão] — fuso America/Cuiaba (UTC-4)
    ["2026-01-15T12:00:00Z", [2026, 2027], 2026],
    ["2026-07-31T23:59:00Z", [2026, 2027], 2026],
    ["2026-08-01T03:59:00Z", [2026, 2027], 2026], // 31/07 23:59 em Cuiabá: ainda antes do corte
    ["2026-08-01T04:00:00Z", [2026, 2027], 2027], // 01/08 00:00 em Cuiabá: corte
    ["2026-09-25T12:00:00Z", [2026, 2027], 2027],
    ["2026-12-31T12:00:00Z", [2026, 2027], 2027],
    ["2027-01-01T03:30:00Z", [2026, 2027], 2027], // 31/12 23:30 em Cuiabá: ainda 2026 (UTC já é 2027)
    ["2027-01-01T04:00:00Z", [2027, 2028], 2027], // virada do ano em Cuiabá: padrão volta ao corrente
    ["2027-03-10T12:00:00Z", [2027, 2028], 2027],
  ] as const)("%s → anos %j, padrão %i", (iso, years, def) => {
    const now = new Date(iso);
    expect(academicYears(now)).toEqual(years);
    expect(defaultAcademicYear(now)).toBe(def);
  });

  it("seleção valida série e ano", () => {
    const now = new Date("2026-09-25T00:00:00Z");
    expect(parseGradeSelection("ef-4", "2027", now)).toMatchObject({ grade: { slug: "ef-4" }, year: 2027 });
    expect(parseGradeSelection("ef-4", "2030", now)).toEqual({ grade: expect.anything(), year: null });
    expect(parseGradeSelection("zzz", "abc", now)).toEqual({ grade: null, year: null });
  });
});
