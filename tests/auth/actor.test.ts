import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const getCurrentRole = vi.fn();
vi.mock("@/features/auth/queries", () => ({
  getCurrentUser: () => getCurrentUser(),
  getCurrentRole: () => getCurrentRole(),
}));

import { getSessionActor, isSessionActor } from "@/features/auth/actor";

const USER = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  getCurrentUser.mockReset();
  getCurrentRole.mockReset();
});

describe("SessionActor (features/auth)", () => {
  it("sai só de getCurrentUser + papel do perfil, congelado e reconhecido", async () => {
    getCurrentUser.mockResolvedValue({ id: USER });
    getCurrentRole.mockResolvedValue("parent");
    const actor = await getSessionActor();
    expect(actor).toMatchObject({ userId: USER, role: "parent" });
    expect(Object.isFrozen(actor)).toBe(true);
    expect(isSessionActor(actor)).toBe(true);
  });
  it("sem sessão ou sem papel: null", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await getSessionActor()).toBeNull();
    getCurrentUser.mockResolvedValue({ id: USER });
    getCurrentRole.mockResolvedValue(null);
    expect(await getSessionActor()).toBeNull();
  });
  it("recusa objeto forjado (mesmo formato, cast ou clone)", async () => {
    getCurrentUser.mockResolvedValue({ id: USER });
    getCurrentRole.mockResolvedValue("admin");
    const real = (await getSessionActor())!;
    expect(isSessionActor({ userId: USER, role: "admin" })).toBe(false);
    expect(isSessionActor({ ...real })).toBe(false);
    expect(isSessionActor(null)).toBe(false);
    expect(isSessionActor("admin")).toBe(false);
  });
});
