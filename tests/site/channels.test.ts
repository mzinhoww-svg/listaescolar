import { describe, expect, it } from "vitest";

import { getPurchaseChannels, type ChannelsClient } from "@/features/site/channels";

type Result = { data: unknown; error: { code: string } | null };

function fake(tables: Record<string, Result>) {
  const calls: { table: string; ops: string[] }[] = [];
  const client = {
    from(table: string) {
      const rec = { table, ops: [] as string[] };
      calls.push(rec);
      const b: Record<string, unknown> = {};
      for (const op of ["select", "eq", "order", "limit"]) {
        b[op] = (...a: unknown[]) => {
          rec.ops.push(`${op}:${a.join(",")}`);
          return b;
        };
      }
      b.then = (res: (v: Result) => unknown) => Promise.resolve(tables[table] as Result).then(res);
      return b;
    },
  } as unknown as ChannelsClient;
  return { client, calls };
}

describe("getPurchaseChannels", () => {
  it("devolve varejistas ativos por nome e hasStationeries pelo limit 1", async () => {
    const { client, calls } = fake({
      retailers: { data: [{ slug: "amazon", name: "Amazon" }, { slug: "mercado-livre", name: "Mercado Livre" }], error: null },
      stationery_public: { data: [{ id: "x" }], error: null },
    });
    const r = await getPurchaseChannels({ client });
    expect(r).toEqual({
      retailers: [{ slug: "amazon", name: "Amazon" }, { slug: "mercado-livre", name: "Mercado Livre" }],
      hasStationeries: true,
    });
    const ret = calls.find((c) => c.table === "retailers");
    expect(ret?.ops).toContain("eq:is_active,true");
    expect(ret?.ops).toContain("order:name");
    expect(calls.find((c) => c.table === "stationery_public")?.ops).toContain("limit:1");
  });

  it("sem papelarias → hasStationeries false", async () => {
    const { client } = fake({
      retailers: { data: [], error: null },
      stationery_public: { data: [], error: null },
    });
    expect(await getPurchaseChannels({ client })).toEqual({ retailers: [], hasStationeries: false });
  });

  it("erro em qualquer consulta → null", async () => {
    const a = fake({ retailers: { data: null, error: { code: "42501" } }, stationery_public: { data: [], error: null } });
    expect(await getPurchaseChannels({ client: a.client })).toBeNull();
    const b = fake({ retailers: { data: [], error: null }, stationery_public: { data: null, error: { code: "x" } } });
    expect(await getPurchaseChannels({ client: b.client })).toBeNull();
  });
});
