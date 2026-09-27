import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const getCurrentRole = vi.fn();
vi.mock("@/features/auth/queries", () => ({
  getCurrentUser: () => getCurrentUser(),
  getCurrentRole: () => getCurrentRole(),
}));

import { getSessionActor } from "@/features/auth/actor";
import { ReportsService } from "@/features/reports/service";
import type { ReportsRepository } from "@/features/reports/repository";

const USER = "22222222-2222-4222-8222-222222222222";
const REPORT_ID = "4f2b8c1e-5d4a-4b6f-9c3d-1a2b3c4d5e6f";
const LIST_ID = "3f2b8c1e-5d4a-4b6f-9c3d-1a2b3c4d5e6f";

function fakeStore(): ReportsRepository {
  return {
    create: vi.fn().mockResolvedValue(REPORT_ID),
    listQueue: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
    resolve: vi.fn().mockResolvedValue(undefined),
  } as unknown as ReportsRepository;
}

beforeEach(() => {
  getCurrentUser.mockReset();
  getCurrentRole.mockReset();
});

describe("ReportsService", () => {
  it("qualquer autenticado denuncia; reporterId sempre vem do ator, nunca do input", async () => {
    getCurrentUser.mockResolvedValue({ id: USER });
    getCurrentRole.mockResolvedValue("parent");
    const actor = (await getSessionActor())!;
    const store = fakeStore();
    const svc = new ReportsService({ store });
    await svc.submit(actor, { targetType: "school_list", targetId: LIST_ID, reason: "preco_incorreto" });
    expect(store.create).toHaveBeenCalledWith(expect.objectContaining({ reporterId: USER }));
  });

  it("parent não lê a fila nem resolve; admin sim", async () => {
    getCurrentUser.mockResolvedValue({ id: USER });
    getCurrentRole.mockResolvedValue("parent");
    const parent = (await getSessionActor())!;
    const store = fakeStore();
    const svc = new ReportsService({ store });
    await expect(svc.listQueue(parent)).rejects.toThrow();
    await expect(svc.resolve(parent, { reportId: REPORT_ID, status: "reviewing" })).rejects.toThrow();

    getCurrentUser.mockResolvedValue({ id: USER });
    getCurrentRole.mockResolvedValue("admin");
    const admin = (await getSessionActor())!;
    await expect(svc.listQueue(admin)).resolves.toEqual([]);
    await svc.resolve(admin, { reportId: REPORT_ID, status: "reviewing" });
    expect(store.resolve).toHaveBeenCalledWith(expect.objectContaining({ reportId: REPORT_ID, resolvedBy: USER }));
  });

  it("recusa ator forjado (não vem de getSessionActor)", async () => {
    const store = fakeStore();
    const svc = new ReportsService({ store });
    const forged = { userId: USER, role: "admin" } as unknown as Parameters<typeof svc.listQueue>[0];
    await expect(svc.listQueue(forged)).rejects.toThrow();
  });
});
