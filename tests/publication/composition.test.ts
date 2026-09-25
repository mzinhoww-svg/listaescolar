import { describe, expect, it, vi } from "vitest";
import { createPublicationDeps, resetMemoryPublishers, type PublicationEnv } from "../../supabase/functions/_shared/publication/composition";
import { MemoryListPublisher, MemoryPublicationContextReader } from "../../supabase/functions/_shared/publication/memory";
import { FakeClock } from "../helpers/fake-clock";

const FIXTURE = JSON.stringify({
  schools: [{ id: "50000000-0000-4000-8000-0000000000c1", verification: "verified", municipalityEnabled: true, linkedProfiles: [] }],
  grades: { "4º ano": "ef-4" },
  validSchoolYears: [2027],
});
const rpc = { rpc: vi.fn(async () => ({ data: null, error: null })) };
const build = (env: PublicationEnv) => createPublicationDeps({ env, rpc, clock: new FakeClock() });

describe("createPublicationDeps: portas em memória só com fixture e ambiente explicitamente não produtivo", () => {
  it("fixture válida + APP_ENV=local: liga as portas em memória", () => {
    const d = build({ APP_ENV: "local", FAKE_PUBLICATION_FIXTURE: FIXTURE });
    expect(d.publisher).toBeInstanceOf(MemoryListPublisher);
    expect(d.context).toBeInstanceOf(MemoryPublicationContextReader);
  });
  it("APP_ENV=development também liga", () => {
    expect(build({ APP_ENV: "development", FAKE_PUBLICATION_FIXTURE: FIXTURE }).publisher).not.toBeNull();
  });
  it.each(["preview", "staging"])("APP_ENV=%s NÃO liga (staging é o Supabase real e ai_decisions é append-only)", (APP_ENV) => {
    const d = build({ APP_ENV, FAKE_PUBLICATION_FIXTURE: FIXTURE });
    expect(d.publisher).toBeNull();
    expect(d.context).toBeNull();
  });
  it("duas composições sucessivas com a mesma fixture compartilham o publicador (estado entre requisições)", async () => {
    resetMemoryPublishers();
    const env = { APP_ENV: "local", FAKE_PUBLICATION_FIXTURE: FIXTURE };
    const a = build(env);
    const req = { submissionId: "10000000-0000-4000-8000-0000000000d1", schoolId: "50000000-0000-4000-8000-0000000000c1", gradeSlug: "ef-4", schoolYear: 2027, source: "school_upload" as const, actor: { kind: "system" as const }, items: [{ position: 1, originalName: "Caderno", normalizedName: "caderno", category: "papelaria", quantity: 2, unit: "un", confidence: 0.9 }] };
    const first = await a.publisher!.publish({ ...req, idempotencyKey: req.submissionId });
    const b = build(env); // outra "requisição"
    expect(b.publisher).toBe(a.publisher);
    const ctx = await b.context!.load({ schoolId: req.schoolId, grade: "4º ano", schoolYear: 2027, submittedBy: "00000000-0000-4000-8000-000000000002" });
    expect(ctx.currentList).toEqual({ listId: first.listId, status: "published", currentVersionId: first.newVersionId });
    const id2 = "10000000-0000-4000-8000-0000000000d2";
    const second = await b.publisher!.publish({ ...req, submissionId: id2, idempotencyKey: id2 });
    expect(second.previousVersionId).toBe(first.newVersionId);
    expect(await b.publisher!.publish({ ...req, idempotencyKey: req.submissionId })).toEqual(first); // idempotência entre requisições
    expect(build({ APP_ENV: "local", FAKE_PUBLICATION_FIXTURE: FIXTURE.replace("ef-4", "ef-9") }).publisher).not.toBe(a.publisher); // outra fixture, outro publicador
    resetMemoryPublishers();
  });
  it("sem a fixture: portas nulas", () => {
    const d = build({ APP_ENV: "local" });
    expect(d.publisher).toBeNull();
    expect(d.context).toBeNull();
  });
  it("fixture sem APP_ENV explícito: portas nulas", () => {
    expect(build({ FAKE_PUBLICATION_FIXTURE: FIXTURE }).publisher).toBeNull();
    expect(build({ APP_ENV: "", FAKE_PUBLICATION_FIXTURE: FIXTURE }).context).toBeNull();
  });
  it.each([
    { APP_ENV: "production" },
    { APP_ENV: "local", VERCEL_ENV: "production" },
    { NODE_ENV: "production" },
    { APP_ENV: "outro" },
  ])("ambiente produtivo ou desconhecido %j: portas nulas", (env) => {
    const d = build({ ...env, FAKE_PUBLICATION_FIXTURE: FIXTURE });
    expect(d.publisher).toBeNull();
    expect(d.context).toBeNull();
  });
  it("fixture inválida: portas nulas", () => {
    for (const raw of ["{", JSON.stringify({ schools: 1 }), JSON.stringify({ schools: [], grades: {}, validSchoolYears: [], x: 1 })]) {
      const d = build({ APP_ENV: "local", FAKE_PUBLICATION_FIXTURE: raw });
      expect(d.publisher).toBeNull();
      expect(d.context).toBeNull();
    }
  });
  it("sempre entrega store, settings e relógio", () => {
    const d = build({});
    expect(d.store).toBeDefined();
    expect(d.settings).toBeDefined();
    expect(d.clock).toBeDefined();
  });
});
