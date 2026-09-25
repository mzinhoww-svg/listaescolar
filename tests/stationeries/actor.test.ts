import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const getCurrentRole = vi.fn();
vi.mock("@/features/auth/queries", () => ({
  getCurrentUser: () => getCurrentUser(),
  getCurrentRole: () => getCurrentRole(),
}));

import { getSessionActor, type SessionActor } from "@/features/stationeries/actor";
import { StationeryRepositoryError, transition, upsertCatalogItems } from "@/features/stationeries/repository";

const USER = "22222222-2222-4222-8222-222222222222";
const STAT = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  getCurrentUser.mockReset();
  getCurrentRole.mockReset();
});

describe("SessionActor (I3)", () => {
  it("sai só de getCurrentUser + papel do perfil", async () => {
    getCurrentUser.mockResolvedValue({ id: USER });
    getCurrentRole.mockResolvedValue("parent");
    const actor = await getSessionActor();
    expect(actor).toMatchObject({ userId: USER, role: "parent" });
    expect(Object.isFrozen(actor)).toBe(true);
  });
  it("sem sessão ou sem papel: null", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await getSessionActor()).toBeNull();
    getCurrentUser.mockResolvedValue({ id: USER });
    getCurrentRole.mockResolvedValue(null);
    expect(await getSessionActor()).toBeNull();
  });
});

describe("contrato: input do usuário não vira actor", () => {
  const rpc = vi.fn();
  const client = { rpc, from: vi.fn() } as unknown as SupabaseClient;
  const forged = { userId: USER, role: "admin" };

  it("tipo: objeto comum não é SessionActor (falha de compilação)", () => {
    const compileOnly = () => {
      // @ts-expect-error objeto literal não tem a marca de SessionActor
      void transition(client, forged, { id: STAT, to: "active" });
      // @ts-expect-error nem um cast estrutural do mesmo formato
      void upsertCatalogItems(client, { userId: USER, role: "parent" } satisfies { userId: string; role: string }, STAT, []);
    };
    expect(typeof compileOnly).toBe("function");
  });

  it("runtime: ator forjado (cast) é recusado antes de qualquer chamada ao banco", async () => {
    const err = await transition(client, forged as unknown as SessionActor, { id: STAT, to: "active" }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(StationeryRepositoryError);
    expect((err as StationeryRepositoryError).code).toBe("forbidden");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("ator de sessão real passa: papel de admin vira ator admin; parent, owner", async () => {
    rpc.mockResolvedValue({ data: "approved", error: null });
    getCurrentUser.mockResolvedValue({ id: USER });
    getCurrentRole.mockResolvedValue("admin");
    const admin = (await getSessionActor())!;
    await transition(client, admin, { id: STAT, to: "approved" });
    expect(rpc).toHaveBeenLastCalledWith("stationery_transition", expect.objectContaining({ p_actor_id: USER, p_actor_role: "admin" }));
    getCurrentRole.mockResolvedValue("parent");
    const parent = (await getSessionActor())!;
    await transition(client, parent, { id: STAT, to: "accreditation" });
    expect(rpc).toHaveBeenLastCalledWith("stationery_transition", expect.objectContaining({ p_actor_role: "owner" }));
    getCurrentRole.mockResolvedValue("school_member");
    const school = (await getSessionActor())!;
    await expect(transition(client, school, { id: STAT, to: "accreditation" })).rejects.toMatchObject({ code: "forbidden" });
  });
});
