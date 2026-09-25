import { describe, expect, it } from "vitest";
import { createSchoolLabelReader } from "@/features/review/school-labels";
import { parsePublicationFixture } from "@/supabase/functions/_shared/publication/memory";
import { FIXTURE, SCHOOL } from "./support";

const env = { NODE_ENV: "development", APP_ENV: "local", FAKE_PUBLICATION_FIXTURE: FIXTURE };

describe("SchoolLabelReader", () => {
  it("em memória: rótulo da fixture (label opcional); id desconhecido não aparece", async () => {
    const r = createSchoolLabelReader(env)!;
    expect(await r.labels([SCHOOL, "60000000-0000-4000-8000-0000000000ff"])).toEqual({ [SCHOOL]: { name: "Escola Sintética", inep: "51000001" } });
  });
  it("sem portas (produção, preview/staging, sem fixture): nulo", () => {
    expect(createSchoolLabelReader({ ...env, APP_ENV: "staging" })).toBeNull();
    expect(createSchoolLabelReader({ ...env, APP_ENV: "production" })).toBeNull();
    expect(createSchoolLabelReader({ ...env, VERCEL_ENV: "preview" })).toBeNull();
    expect(createSchoolLabelReader({ NODE_ENV: "development", APP_ENV: "local" })).toBeNull();
  });
  it("a fixture continua strict: label malformado invalida tudo", () => {
    const bad = JSON.stringify({ ...JSON.parse(FIXTURE), schools: [{ id: SCHOOL, verification: "verified", municipalityEnabled: true, linkedProfiles: [], label: { name: "X", inep: "12" } }] });
    expect(parsePublicationFixture(bad)).toBeNull();
    const extra = JSON.stringify({ ...JSON.parse(FIXTURE), schools: [{ id: SCHOOL, verification: "verified", municipalityEnabled: true, linkedProfiles: [], label: { name: "X", inep: "12345678", extra: 1 } }] });
    expect(parsePublicationFixture(extra)).toBeNull();
  });
});
