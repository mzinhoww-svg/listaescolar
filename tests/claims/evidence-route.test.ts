import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ actor: null as unknown }));
const repo = vi.hoisted(() => ({ evidenceSignedUrl: vi.fn() }));
vi.mock("@/features/auth/actor", () => ({ getSessionActor: async () => session.actor }));
vi.mock("@/features/claims/action-support", () => ({ serviceClaimsRepository: () => repo }));

import { GET } from "@/app/admin/reivindicacoes/evidencia/[id]/route";

const ID = "3f2b8c1e-5d4a-4b6f-9c3d-1a2b3c4d5e6f";
const call = (id: string) => GET(new Request("http://localhost/x"), { params: Promise.resolve({ id }) });

beforeEach(() => {
  session.actor = null;
  repo.evidenceSignedUrl.mockReset();
});

describe("GET /admin/reivindicacoes/evidencia/[id]", () => {
  it("sem sessão, pai e outros papéis: 404 no-store sem chamar o repositório", async () => {
    for (const actor of [null, { userId: ID, role: "parent" }, { userId: ID, role: "school_member" }]) {
      session.actor = actor;
      const r = await call(ID);
      expect(r.status).toBe(404);
      expect(r.headers.get("cache-control")).toBe("no-store");
    }
    expect(repo.evidenceSignedUrl).not.toHaveBeenCalled();
  });
  it("UUID inválido: 404 no-store", async () => {
    session.actor = { userId: ID, role: "admin" };
    const r = await call("nao-e-uuid");
    expect(r.status).toBe(404);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(repo.evidenceSignedUrl).not.toHaveBeenCalled();
  });
  it("erro do repositório: 404 sem detalhe", async () => {
    session.actor = { userId: ID, role: "admin" };
    repo.evidenceSignedUrl.mockRejectedValue(new Error("segredo interno"));
    const r = await call(ID);
    expect(r.status).toBe(404);
    expect(await r.text()).toBe("");
  });
  it("admin: 307 para a URL assinada, no-store e sem referrer", async () => {
    session.actor = { userId: ID, role: "admin" };
    repo.evidenceSignedUrl.mockResolvedValue("http://127.0.0.1:54321/storage/v1/object/sign/claim-evidence/a?token=t");
    const r = await call(ID);
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toContain("/object/sign/claim-evidence/");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
  });
});
