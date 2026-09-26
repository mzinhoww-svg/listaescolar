import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionActor } from "@/features/auth/actor";
import { B2bServiceError } from "@/features/b2b/errors";
import { generateApiKey } from "@/features/b2b/keys/format";
import { hashSecret } from "@/features/b2b/keys/hash";
import type { AdminPartnerRow, PartnerOverview } from "@/features/b2b/repository";
import { B2bService, type B2bRepository, type B2bServiceDeps } from "@/features/b2b/service";

const PEPPER = "pepper-de-teste-com-mais-de-32-caracteres-0001";

function actorOf(role: SessionActor["role"], userId = "11111111-1111-4111-8111-111111111111"): SessionActor {
  return { userId, role } as unknown as SessionActor;
}

function makeRepo(overrides: Partial<{ [K in keyof B2bRepository]: B2bRepository[K] }> = {}): B2bRepository {
  return {
    applyPartner: vi.fn(async () => ({ partnerId: "p1" })),
    myPartnerId: vi.fn(async () => "p1"),
    getMyPartner: vi.fn(async () => null),
    getKeyEnvironment: vi.fn(async () => "test" as const),
    createKey: vi.fn(async () => ({ keyId: "k1" })),
    rotateKey: vi.fn(async () => ({ keyId: "k2" })),
    revokeKey: vi.fn(async () => undefined),
    listPartners: vi.fn(async () => [] as AdminPartnerRow[]),
    getPartner: vi.fn(async () => null as PartnerOverview | null),
    decide: vi.fn(async () => "active"),
    adminRevokeKey: vi.fn(async () => undefined),
    ...overrides,
  };
}

function makeDeps(repo: B2bRepository, overrides: Partial<B2bServiceDeps> = {}): B2bServiceDeps {
  return {
    repo,
    generateKey: generateApiKey,
    hashSecret,
    pepper: () => PEPPER,
    now: () => new Date("2026-09-26T12:00:00Z"),
    ...overrides,
  };
}

const VALID_APPLY = {
  tradeName: "Papelaria Exemplo",
  legalName: "Papelaria Exemplo LTDA",
  cnpj: "11444777000161", // CNPJ válido (DV correto)
  contactName: "Fulano de Tal",
  partnerType: "retailer",
  termsAccepted: true,
};

describe("B2bService.applyPartner", () => {
  it("sem consentimento -> consent_required, sem chamar o repositório", async () => {
    const repo = makeRepo();
    const svc = new B2bService(makeDeps(repo));
    await expect(svc.applyPartner(actorOf("parent"), { ...VALID_APPLY, termsAccepted: false })).rejects.toMatchObject({ code: "consent_required" });
    expect(repo.applyPartner).not.toHaveBeenCalled();
  });

  it("com consentimento e dados válidos -> chama o repositório com CNPJ normalizado", async () => {
    const repo = makeRepo();
    const svc = new B2bService(makeDeps(repo));
    await svc.applyPartner(actorOf("parent"), VALID_APPLY);
    expect(repo.applyPartner).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ cnpj: "11444777000161" }), expect.any(String));
  });

  it("CNPJ com DV inválido -> invalid_input, sem chamar o repositório", async () => {
    const repo = makeRepo();
    const svc = new B2bService(makeDeps(repo));
    await expect(svc.applyPartner(actorOf("parent"), { ...VALID_APPLY, cnpj: "11111111111111" })).rejects.toMatchObject({ code: "invalid_input" });
    expect(repo.applyPartner).not.toHaveBeenCalled();
  });
});

describe("B2bService.createKey / rotateKey — texto claro fora do log", () => {
  it("cria a chave e devolve o texto claro só no retorno; nenhum console.* recebe o segredo", async () => {
    const repo = makeRepo();
    const spies = [vi.spyOn(console, "log").mockImplementation(() => undefined), vi.spyOn(console, "error").mockImplementation(() => undefined), vi.spyOn(console, "warn").mockImplementation(() => undefined), vi.spyOn(console, "info").mockImplementation(() => undefined)];
    const svc = new B2bService(makeDeps(repo));
    const key = await svc.createKey(actorOf("parent"), { environment: "test", scopes: ["schools:read"] });
    expect(key.plaintext).toContain(key.secret);
    for (const spy of spies) {
      for (const call of spy.mock.calls) {
        expect(call.join(" ")).not.toContain(key.secret);
        expect(call.join(" ")).not.toContain(key.plaintext);
      }
      spy.mockRestore();
    }
  });

  it("sem pepper configurado -> service_unavailable, sem gerar nem gravar chave", async () => {
    const repo = makeRepo();
    const svc = new B2bService(makeDeps(repo, { pepper: () => undefined }));
    await expect(svc.createKey(actorOf("parent"), { environment: "test", scopes: ["schools:read"] })).rejects.toMatchObject({ code: "service_unavailable" });
    expect(repo.createKey).not.toHaveBeenCalled();
  });

  it("ator sem parceiro (myPartnerId null) -> not_found", async () => {
    const repo = makeRepo({ myPartnerId: vi.fn(async () => null) });
    const svc = new B2bService(makeDeps(repo));
    await expect(svc.createKey(actorOf("parent"), { environment: "test", scopes: ["schools:read"] })).rejects.toMatchObject({ code: "not_found" });
  });

  it("rotação: gera a nova chave no MESMO ambiente da antiga", async () => {
    const repo = makeRepo({ getKeyEnvironment: vi.fn(async () => "live" as const) });
    const svc = new B2bService(makeDeps(repo));
    const key = await svc.rotateKey(actorOf("parent"), { keyId: "33333333-3333-4333-8333-333333333333" });
    expect(key.environment).toBe("live");
    expect(key.plaintext.startsWith("lc_live_")).toBe(true);
  });

  it("rotação de chave inexistente -> not_found, sem chamar o repositório de rotação", async () => {
    const repo = makeRepo({ getKeyEnvironment: vi.fn(async () => null) });
    const svc = new B2bService(makeDeps(repo));
    await expect(svc.rotateKey(actorOf("parent"), { keyId: "44444444-4444-4444-8444-444444444444" })).rejects.toMatchObject({ code: "not_found" });
    expect(repo.rotateKey).not.toHaveBeenCalled();
  });
});

describe("B2bService — membro de outro parceiro é not_found (igual a inexistente)", () => {
  it("createKey sobre um repositório que recusa (chave/parceiro alheio) propaga not_found, não forbidden", async () => {
    // O repositório real (repository.ts) já remapeia `forbidden` do SQL para `not_found` (failMasked); aqui
    // confirmamos que o serviço não reintroduz `forbidden` no caminho.
    const repo = makeRepo({ createKey: vi.fn(async () => { throw new B2bServiceError("chave de outro parceiro", "not_found"); }) });
    const svc = new B2bService(makeDeps(repo));
    await expect(svc.createKey(actorOf("parent"), { environment: "test", scopes: ["schools:read"] })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("B2bService — admin só com role = 'admin'", () => {
  let repo: B2bRepository;
  let svc: B2bService;
  beforeEach(() => {
    repo = makeRepo();
    svc = new B2bService(makeDeps(repo));
  });

  it("listPartners: não-admin é recusado ANTES de chamar o repositório", async () => {
    for (const role of ["parent", "school_member", "stationery_member"] as const) {
      await expect(svc.listPartners(actorOf(role))).rejects.toMatchObject({ code: "forbidden" });
    }
    expect(repo.listPartners).not.toHaveBeenCalled();
    await svc.listPartners(actorOf("admin"));
    expect(repo.listPartners).toHaveBeenCalledTimes(1);
  });

  it("getPartner: não-admin é recusado antes do repositório", async () => {
    await expect(svc.getPartner(actorOf("parent"), "p1")).rejects.toMatchObject({ code: "forbidden" });
    expect(repo.getPartner).not.toHaveBeenCalled();
  });

  it("decidePartner: não-admin é recusado antes do repositório", async () => {
    await expect(svc.decidePartner(actorOf("stationery_member"), "p1", { to: "active" })).rejects.toMatchObject({ code: "forbidden" });
    expect(repo.decide).not.toHaveBeenCalled();
    await svc.decidePartner(actorOf("admin"), "p1", { to: "active" });
    expect(repo.decide).toHaveBeenCalledTimes(1);
  });

  it("adminRevokeKey: não-admin é recusado antes do repositório", async () => {
    await expect(svc.adminRevokeKey(actorOf("parent"), "k1")).rejects.toMatchObject({ code: "forbidden" });
    expect(repo.adminRevokeKey).not.toHaveBeenCalled();
  });
});
