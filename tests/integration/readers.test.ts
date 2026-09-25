import { beforeEach, describe, expect, it, vi } from "vitest";

const currentUser = vi.fn();
const currentRole = vi.fn();
vi.mock("@/features/auth/queries", () => ({ getCurrentUser: () => currentUser(), getCurrentRole: () => currentRole() }));

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSessionActor, isSessionActor, type SessionActor } from "@/features/auth/actor";
import { composeLeadContextReader, composeListReader } from "@/features/integration/compose";
import { SupabaseLeadListContextReader } from "@/features/integration/lead-context";
import { SupabaseListReader } from "@/features/integration/list-reader";
import { SupabaseSchoolLabelReader } from "@/features/integration/school-labels";
import { IntegrationReadError } from "@/features/integration/rpc";
import { DEMO_LIST_ID } from "@/features/cart/memory-list-reader";
import * as stationeriesActor from "@/features/stationeries/actor";

const ME = "00000000-0000-4000-8000-000000000001";
const LIST = "40000000-0000-4000-8000-0000000000a1";
const SCHOOL = "50000000-0000-4000-8000-0000000000c1";
type Fake = Pick<SupabaseClient, "rpc"> & { spy: ReturnType<typeof vi.fn> };
const fake = (data: unknown, error: unknown = null): Fake => {
  const spy = vi.fn<(...args: unknown[]) => unknown>(() => ({ then: (r: (v: unknown) => unknown) => r({ data, error }) }));
  return { rpc: spy as never, spy };
};
const snapshot = { kind: "official", isDemo: false, items: [{ id: "i1", name: "Caderno", quantity: 2 }] };

let actor: SessionActor;
beforeEach(async () => {
  currentUser.mockResolvedValue({ id: ME });
  currentRole.mockResolvedValue("parent");
  actor = (await getSessionActor())!;
});

describe("SessionActor único (D-046)", () => {
  it("a mesma implementação e a mesma marca nas duas trilhas", async () => {
    expect(stationeriesActor.getSessionActor).toBe(getSessionActor);
    expect(stationeriesActor.isSessionActor).toBe(isSessionActor);
    const minted = (await stationeriesActor.getSessionActor())!;
    expect(isSessionActor(minted)).toBe(true);
    expect(stationeriesActor.isSessionActor(actor)).toBe(true);
    expect(isSessionActor({ userId: ME, role: "admin" })).toBe(false);
  });
});

describe("SupabaseListReader", () => {
  it("entrega o ator da sessão à função e devolve itens, origem e isDemo", async () => {
    const client = fake(snapshot);
    const r = await new SupabaseListReader(client).getList(LIST, { actor });
    expect(r).toEqual(snapshot);
    expect(client.spy).toHaveBeenCalledWith("list_reader_get", { p_list_id: LIST, p_actor_id: ME });
  });
  it("sem ator: p_actor_id nulo (só o público)", async () => {
    const client = fake(null);
    expect(await new SupabaseListReader(client).getList(LIST)).toBeNull();
    expect(client.spy).toHaveBeenCalledWith("list_reader_get", { p_list_id: LIST, p_actor_id: null });
  });
  it("ator forjado (objeto comum) e id inválido: null e nenhuma chamada ao banco", async () => {
    const client = fake(snapshot);
    const reader = new SupabaseListReader(client);
    expect(await reader.getList(LIST, { actor: { userId: ME, role: "admin" } as never })).toBeNull();
    expect(await reader.getList("x", { actor })).toBeNull();
    expect(client.spy).not.toHaveBeenCalled();
  });
  it("erro do banco e resposta fora do formato viram IntegrationReadError (nunca 'lista vazia')", async () => {
    await expect(new SupabaseListReader(fake(null, { message: "x" })).getList(LIST, { actor })).rejects.toMatchObject({ code: "unavailable" });
    await expect(new SupabaseListReader(fake({ ...snapshot, kind: "demo" })).getList(LIST, { actor })).rejects.toBeInstanceOf(IntegrationReadError);
    await expect(new SupabaseListReader(fake({ ...snapshot, items: [{ id: "i", name: "x", quantity: 1.5 }] })).getList(LIST, { actor })).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("getItems = itens do getList", async () => {
    expect(await new SupabaseListReader(fake(snapshot)).getItems(LIST, { actor })).toEqual(snapshot.items);
  });
});

describe("SupabaseLeadListContextReader", () => {
  const ctx = { schoolName: "Escola Modelo", gradeLabel: "4º ano", schoolYear: 2027, items: [{ name: "Caderno", quantity: 2 }], isDemo: false, municipalityId: "60000000-0000-4000-8000-0000000000b1" };
  it("passa o ator e devolve o contexto real (escola, série, ano, município)", async () => {
    const client = fake(ctx);
    expect(await new SupabaseLeadListContextReader(client).getContext(LIST, { actorId: ME })).toEqual(ctx);
    expect(client.spy).toHaveBeenCalledWith("lead_list_context", { p_list_id: LIST, p_actor_id: ME });
  });
  it("cópia do pai sem escola: null (cotação indisponível), nada inventado; erro não vira null", async () => {
    expect(await new SupabaseLeadListContextReader(fake(null)).getContext(LIST, { actorId: ME })).toBeNull();
    await expect(new SupabaseLeadListContextReader(fake(null, { message: "x" })).getContext(LIST)).rejects.toMatchObject({ code: "unavailable" });
    await expect(new SupabaseLeadListContextReader(fake({ ...ctx, schoolName: "" })).getContext(LIST)).rejects.toMatchObject({ code: "invalid_response" });
  });
});

describe("SupabaseSchoolLabelReader", () => {
  it("filtra ids inválidos, deduplica e só devolve nome e INEP", async () => {
    const client = fake({ [SCHOOL]: { name: "Escola Modelo", inep: "51000001" } });
    const r = await new SupabaseSchoolLabelReader(client).labels([SCHOOL, SCHOOL, "lixo"]);
    expect(r).toEqual({ [SCHOOL]: { name: "Escola Modelo", inep: "51000001" } });
    expect(client.spy).toHaveBeenCalledWith("school_labels", { p_ids: [SCHOOL] });
    expect(await new SupabaseSchoolLabelReader(client).labels(["lixo"])).toEqual({});
  });
  it("coluna não pública na resposta é recusada", async () => {
    await expect(new SupabaseSchoolLabelReader(fake({ [SCHOOL]: { name: "x", inep: "51000001", email: "a@b.c" } })).labels([SCHOOL])).rejects.toMatchObject({ code: "invalid_response" });
  });
});

describe("composição: banco real primeiro; demonstração só atrás da flag (fail-closed)", () => {
  const OFF = { DEMO_RETAILERS: undefined } as never;
  const ON = { DEMO_RETAILERS: "1", VERCEL_ENV: "development" } as never;
  it("lista oficial vence; a demo só existe com a flag", async () => {
    expect((await composeListReader(fake(snapshot), OFF).getList(LIST, { actor }))?.kind).toBe("official");
    expect(await composeListReader(fake(null), OFF).getList(DEMO_LIST_ID, { actor })).toBeNull();
    expect((await composeListReader(fake(null), ON).getList(DEMO_LIST_ID, { actor }))).toMatchObject({ kind: "demo", isDemo: true });
  });
  it("contexto do lead: real primeiro, demo atrás da flag", async () => {
    expect(await composeLeadContextReader(fake(null), OFF).getContext(DEMO_LIST_ID)).toBeNull();
    expect((await composeLeadContextReader(fake(null), ON).getContext(DEMO_LIST_ID))?.isDemo).toBe(true);
  });
});
