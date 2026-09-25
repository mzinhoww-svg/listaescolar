import { describe, expect, it, vi } from "vitest";
import { createPublicationDeps, type PublicationEnv } from "../../supabase/functions/_shared/publication/composition";
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
  it.each(["development", "preview", "staging"])("APP_ENV=%s também liga", (APP_ENV) => {
    expect(build({ APP_ENV, FAKE_PUBLICATION_FIXTURE: FIXTURE }).publisher).not.toBeNull();
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
