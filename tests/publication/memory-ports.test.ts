import { describe, expect, it } from "vitest";
import { MemoryListPublisher, MemoryPublicationContextReader, parsePublicationFixture } from "../../supabase/functions/_shared/publication/memory";
import { runListPublisherContract, request } from "./list-publisher.contract";

runListPublisherContract("MemoryListPublisher", () => {
  const publisher = new MemoryListPublisher();
  return { publisher, archiveList: (t) => publisher.archive(t) };
});

const SCHOOL = "50000000-0000-4000-8000-0000000000c1";
const MEMBER = "00000000-0000-4000-8000-000000000002";
const FIXTURE = JSON.stringify({
  schools: [{ id: SCHOOL, verification: "verified", municipalityEnabled: true, linkedProfiles: [MEMBER] }],
  grades: { "4º ano": "ef-4" },
  validSchoolYears: [2027],
});

describe("parsePublicationFixture", () => {
  it("aceita fixture válida e recusa ausente, JSON quebrado e formato inválido", () => {
    expect(parsePublicationFixture(FIXTURE)).not.toBeNull();
    expect(parsePublicationFixture(undefined)).toBeNull();
    expect(parsePublicationFixture("  ")).toBeNull();
    expect(parsePublicationFixture("{nao json")).toBeNull();
    expect(parsePublicationFixture(JSON.stringify({ schools: [{ id: "x" }] }))).toBeNull();
    expect(parsePublicationFixture(JSON.stringify({ schools: [], grades: {}, validSchoolYears: ["2027"] }))).toBeNull();
    expect(parsePublicationFixture(JSON.stringify({ schools: [], grades: {}, validSchoolYears: [], extra: 1 }))).toBeNull();
  });
});

describe("MemoryPublicationContextReader", () => {
  const reader = () => new MemoryPublicationContextReader(parsePublicationFixture(FIXTURE)!, new MemoryListPublisher());
  it("resolve escola, série, ano e vínculo a partir da fixture", async () => {
    expect(await reader().load({ schoolId: SCHOOL, grade: "4º ano", schoolYear: 2027, submittedBy: MEMBER })).toEqual({
      school: { verification: "verified", municipalityEnabled: true },
      gradeSlug: "ef-4",
      validSchoolYears: [2027],
      submitterLinked: true,
      currentList: null,
    });
  });
  it("escola desconhecida, série fora do mapa e remetente sem vínculo: nulos/falsos, nunca adivinha", async () => {
    const r = reader();
    expect((await r.load({ schoolId: "50000000-0000-4000-8000-0000000000ff", grade: "Educação infantil", schoolYear: 2027, submittedBy: MEMBER }))).toMatchObject({ school: null, gradeSlug: null, submitterLinked: false });
    expect((await r.load({ schoolId: SCHOOL, grade: "4º ano", schoolYear: 2027, submittedBy: "00000000-0000-4000-8000-0000000000ff" })).submitterLinked).toBe(false);
    expect((await r.load({ schoolId: null, grade: null, schoolYear: null, submittedBy: MEMBER })).school).toBeNull();
  });
  it("currentList reflete a lista da porta (arquivada)", async () => {
    const publisher = new MemoryListPublisher();
    const r = new MemoryPublicationContextReader(parsePublicationFixture(FIXTURE)!, publisher);
    await publisher.publish(request({ schoolId: SCHOOL }));
    expect((await r.load({ schoolId: SCHOOL, grade: "4º ano", schoolYear: 2027, submittedBy: MEMBER })).currentList?.status).toBe("published");
    publisher.archive({ schoolId: SCHOOL, gradeSlug: "ef-4", schoolYear: 2027 });
    expect((await r.load({ schoolId: SCHOOL, grade: "4º ano", schoolYear: 2027, submittedBy: MEMBER })).currentList?.status).toBe("archived");
  });
});
