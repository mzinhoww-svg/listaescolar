// Os contratos novos rodando contra as implementações EM MEMÓRIA (o real roda em tests/db/integration-ports-real.test.ts).
import { InMemoryLeadListContextReader } from "@/features/leads/memory-context-reader";
import { createDemoLeadListContextReader, DEMO_SCHOOL_NAME } from "@/features/leads/demo-context-reader";
import { createCompositeListReader, createDemoListReader, DEMO_LIST_ID, InMemoryListReader } from "@/features/cart/memory-list-reader";
import { MemorySchoolLabelReader } from "@/features/review/school-labels";
import { MemoryListPublisher, MemoryPublicationContextReader, parsePublicationFixture } from "../../supabase/functions/_shared/publication/memory";
import { runLeadContextContract } from "./lead-context.contract";
import { runListReaderContract } from "./list-reader.contract";
import { runPublicationContextContract } from "./publication-context.contract";
import { runSchoolLabelsContract } from "./school-labels.contract";

const ENV = { DEMO_RETAILERS: "1", VERCEL_ENV: "development" } as never;
const SCHOOL = "50000000-0000-4000-8000-0000000000c1";
const MEMBER = "00000000-0000-4000-8000-000000000002";
const PARENT = "00000000-0000-4000-8000-000000000001";

runListReaderContract("memória (demonstração)", () => {
  const demo = createDemoListReader(ENV)!;
  return {
    reader: createCompositeListReader([demo]),
    known: { listId: DEMO_LIST_ID, kind: "demo", isDemo: true, itemNames: ["Caderno 96 folhas", "Lápis preto HB", "Borracha branca", "Cola branca 90g", "Tesoura sem ponta"] },
  };
});
runListReaderContract("InMemoryListReader", () => ({
  reader: new InMemoryListReader(new Map([["11111111-1111-4111-8111-111111111111", [{ id: "i1", name: "Régua", quantity: 1 }]]])),
  known: { listId: "11111111-1111-4111-8111-111111111111", kind: "demo", isDemo: true, itemNames: ["Régua"] },
}));

runLeadContextContract("memória (demonstração)", () => ({
  reader: createDemoLeadListContextReader(ENV)!,
  known: { listId: DEMO_LIST_ID, expected: { schoolName: DEMO_SCHOOL_NAME, gradeLabel: "5º ano", schoolYear: 2027, isDemo: true } },
}));
runLeadContextContract("InMemoryLeadListContextReader", () => ({
  reader: new InMemoryLeadListContextReader(new Map([["11111111-1111-4111-8111-111111111111", { schoolName: "Escola X", gradeLabel: "4º ano", schoolYear: 2027, items: [], isDemo: true }]])),
  known: { listId: "11111111-1111-4111-8111-111111111111", expected: { schoolName: "Escola X", isDemo: true } },
}));

const FIXTURE = JSON.stringify({
  schools: [{ id: SCHOOL, verification: "verified", municipalityEnabled: true, linkedProfiles: [MEMBER], label: { name: "Escola Modelo", inep: "51000001" } }],
  grades: { "4º ano": "ef-4" },
  validSchoolYears: [2027, 2028],
});
runPublicationContextContract("memória (fixture)", () => ({
  reader: new MemoryPublicationContextReader(parsePublicationFixture(FIXTURE)!, new MemoryListPublisher()),
  school: { id: SCHOOL, verification: "verified", municipalityEnabled: true },
  gradeLabel: "4º ano",
  gradeSlug: "ef-4",
  schoolYear: 2027,
  linkedProfile: MEMBER,
  unlinkedProfile: PARENT,
  unknownSchoolId: "50000000-0000-4000-8000-0000000000ff",
}));
runSchoolLabelsContract("memória", () => ({
  reader: new MemorySchoolLabelReader(new Map([[SCHOOL, { name: "Escola Modelo", inep: "51000001" }]])),
  known: { id: SCHOOL, name: "Escola Modelo", inep: "51000001" },
  unknownId: "50000000-0000-4000-8000-0000000000ff",
}));
