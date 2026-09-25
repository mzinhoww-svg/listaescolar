import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseSearchParams } from "@/features/schools/search/params";
import {
  getDefaultMunicipalityId,
  getSchoolByInep,
  SchoolSearchError,
  searchSchools,
  type PublicClient,
} from "@/features/schools/search/repository";

const ID = "3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b";
const MUN = "3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6c";

type Reply = { data: unknown; error: unknown };
type Calls = { orders: string[]; rpc: unknown[] };

/** Cliente falso: `from(...)` é encadeável e termina numa promessa; `rpc` devolve a resposta dada. */
function fakeClient(replies: { from?: Reply; rpc?: Reply }): { client: PublicClient; calls: Calls } {
  const calls: Calls = { orders: [], rpc: [] };
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = self;
  chain.eq = self;
  chain.limit = () => Promise.resolve(replies.from);
  chain.maybeSingle = () => Promise.resolve(replies.from);
  chain.order = (col: string) => {
    calls.orders.push(col);
    return chain;
  };
  const client = {
    from: () => chain,
    rpc: (...args: unknown[]) => {
      calls.rpc.push(args);
      return Promise.resolve(replies.rpc);
    },
  } as unknown as PublicClient;
  return { client, calls };
}

const row = (over: Record<string, unknown> = {}) => ({
  id: ID,
  inep: "51001234",
  name: "Escola Teste",
  network: "municipal",
  neighborhood: null,
  municipality_id: MUN,
  municipality_name: "Cuiabá",
  verification_status: "registered",
  is_demo: false,
  rank: 0.5,
  total_count: 45,
  ...over,
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("searchSchools (cliente falso)", () => {
  it("erro do rpc vira SchoolSearchError genérico com cause e code, sem vazar a mensagem", async () => {
    const dbError = { message: "connection to 10.0.0.5 refused, user=secret", code: "08006" };
    const { client } = fakeClient({ from: { data: [{ id: MUN }], error: null }, rpc: { data: null, error: dbError } });
    const err = await searchSchools(parseSearchParams({ q: "escola" }), { client }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SchoolSearchError);
    const e = err as SchoolSearchError;
    expect(e.message).toBe("school_search_failed");
    expect(e.message).not.toContain("secret");
    expect(e.code).toBe("search_rpc_failed");
    expect(e.cause).toBe(dbError);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret");
  });

  it("resposta fora do formato (Zod) vira erro com issues só de caminho/código, sem valores", async () => {
    const bad = row({ verification_status: "hacked", name: "NOME-PESSOAL" });
    const { client } = fakeClient({ from: { data: [{ id: MUN }], error: null }, rpc: { data: [bad], error: null } });
    const err = (await searchSchools(parseSearchParams({ q: "escola" }), { client }).catch((e: unknown) => e)) as SchoolSearchError;
    expect(err).toBeInstanceOf(SchoolSearchError);
    expect(err.code).toBe("search_invalid_shape");
    expect(err.issues.length).toBeGreaterThan(0);
    expect(err.issues.join(" ")).not.toContain("hacked");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("NOME-PESSOAL");
  });

  it("pagina > 1 sem linhas é page_out_of_range", async () => {
    const { client } = fakeClient({ from: { data: [{ id: MUN }], error: null }, rpc: { data: [], error: null } });
    const r = await searchSchools(parseSearchParams({ q: "escola", pagina: "9" }), { client });
    expect(r).toEqual({ kind: "page_out_of_range", page: 9 });
  });

  it("pagina 1 sem linhas é busca vazia (schools [] e total 0)", async () => {
    const { client } = fakeClient({ from: { data: [{ id: MUN }], error: null }, rpc: { data: [], error: null } });
    expect(await searchSchools(parseSearchParams({ q: "escola" }), { client })).toEqual({
      kind: "results",
      schools: [],
      total: 0,
      page: 1,
      pageCount: 0,
    });
  });

  it("total e pageCount vêm do banco; offset segue a página", async () => {
    const { client, calls } = fakeClient({ from: { data: [{ id: MUN }], error: null }, rpc: { data: [row()], error: null } });
    const r = await searchSchools(parseSearchParams({ q: "escola", pagina: "2" }), { client });
    expect(r).toMatchObject({ kind: "results", total: 45, pageCount: 3, page: 2 });
    expect(calls.rpc[0]).toEqual(["search_schools", expect.objectContaining({ p_offset: 20, p_limit: 20 })]);
  });
});

describe("getDefaultMunicipalityId / getSchoolByInep (cliente falso)", () => {
  it("ordena por nome e depois id", async () => {
    const { client, calls } = fakeClient({ from: { data: [{ id: MUN }], error: null } });
    expect(await getDefaultMunicipalityId({ client })).toBe(MUN);
    expect(calls.orders).toEqual(["name", "id"]);
  });

  it("falha do banco no município padrão é SchoolSearchError", async () => {
    const { client } = fakeClient({ from: { data: null, error: { message: "x" } } });
    await expect(getDefaultMunicipalityId({ client })).rejects.toBeInstanceOf(SchoolSearchError);
  });

  it("perfil com formato inválido lança SchoolSearchError", async () => {
    const { client } = fakeClient({ from: { data: { id: "não-uuid" }, error: null } });
    await expect(getSchoolByInep("51001234", { client })).rejects.toMatchObject({ code: "profile_invalid_shape" });
  });
});
