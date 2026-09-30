import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asServiceCommitted, IDS, cleanupUsers, seedUsers, withSuperuser } from "./helpers";

const KEY = "8a1f0c52-3b0e-4b7a-9f1d-2c6e5d4b3a11";
const call = (id: string, key: string | null) =>
  asServiceCommitted((c) =>
    c.query(
      `select public.submissions_create($1::uuid, $2::uuid, 'parent', null, '5º ano', 2027, $3, 'lista.pdf', 'application/pdf', 100, false, 'list_upload', 'v', $4::uuid)`,
      [id, IDS.parent, `${IDS.parent}/${id}/lista.pdf`, key],
    ),
  );
const count = (sql: string) => withSuperuser(async (c) => Number((await c.query(sql, [IDS.parent])).rows[0].n));

async function purge() {
  await withSuperuser(async (c) => {
    await c.query("delete from public.jobs where submission_id in (select id from public.list_submissions where submitted_by = $1)", [IDS.parent]);
    await c.query("delete from public.list_submissions where submitted_by = $1", [IDS.parent]);
    await c.query("delete from public.consents where profile_id = $1", [IDS.parent]);
  });
}

beforeAll(async () => {
  await seedUsers();
  await purge();
});
afterAll(async () => {
  await purge();
  await cleanupUsers();
});

describe("submissions_create idempotente por (dono, chave) (S29 T14)", () => {
  it("duas criações simultâneas com a mesma chave: um envio, um job e um consentimento", async () => {
    const results = await Promise.allSettled([
      call("00000000-0000-4000-8000-0000000e0001", KEY),
      call("00000000-0000-4000-8000-0000000e0002", KEY),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((lost.reason as { code?: string }).code).toBe("23505");
    expect(await count("select count(*) n from public.list_submissions where submitted_by = $1")).toBe(1);
    expect(await count("select count(*) n from public.jobs where submission_id in (select id from public.list_submissions where submitted_by = $1)")).toBe(1);
    expect(await count("select count(*) n from public.consents where profile_id = $1")).toBe(1);
  });

  it("sem chave (nula) não há unicidade: envios antigos e outros caminhos continuam livres", async () => {
    await purge();
    await call("00000000-0000-4000-8000-0000000e0003", null);
    await call("00000000-0000-4000-8000-0000000e0004", null);
    expect(await count("select count(*) n from public.list_submissions where submitted_by = $1")).toBe(2);
  });
});
