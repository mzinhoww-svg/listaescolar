// @vitest-environment node
// Roda em `pnpm test:db` (Postgres local): chama as funções SQL como service_role via um gateway `pg`.
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { importInepFile } from "@/features/schools/import-service";
import { createSchoolsRepository, type AdminGateway } from "@/features/schools/repository";
import { DATABASE_URL, withSuperuser } from "../db/helpers";

const FIXTURE = readFileSync("tests/fixtures/inep-demo.csv");
const INEPS = ["99001001", "99001002", "99001003", "99001004", "99001007", "99001008", "51000101"];

let client: Client;
const gateway: AdminGateway = {
  async rpc(fn, args) {
    if (fn === "import_claim_batch") {
      const r = await client.query("select * from public.import_claim_batch($1,$2,$3,$4)", [
        args.p_file_hash,
        args.p_file_name,
        args.p_imported_by,
        args.p_is_demo,
      ]);
      return r.rows;
    }
    const r = await client.query("select public.import_apply_rows($1, $2::jsonb) as r", [
      args.p_batch_id,
      JSON.stringify(args.p_rows),
    ]);
    return r.rows[0]?.r;
  },
  async finishBatch(id, status) {
    await client.query(
      "update public.import_batches set status = $2::public.import_status, finished_at = now() where id = $1 and status <> 'completed'",
      [id, status],
    );
  },
  async selectBatch(id) {
    const r = await client.query(
      "select id,status,is_demo,total_rows,inserted_count,updated_count,duplicate_count,rejected_count,unchanged_count from public.import_batches where id = $1",
      [id],
    );
    return r.rows[0] ?? null;
  },
  async selectErrorRows(id, offset, limit) {
    const r = await client.query(
      `select row_number, action, errors, raw from public.import_rows
        where batch_id = $1 and (action = 'rejected' or (action = 'duplicate' and not unchanged))
        order by row_number offset $2 limit $3`,
      [id, offset, limit],
    );
    return r.rows;
  },
  async countWarningRows(id) {
    const r = await client.query(
      `select count(*)::int as n from public.import_rows where batch_id = $1
         and (errors @> '[{"code":"municipality_changed"}]'::jsonb or errors @> '[{"code":"municipality_change_ignored"}]'::jsonb)`,
      [id],
    );
    return r.rows[0]?.n ?? 0;
  },
  async countSchools() {
    const r = await client.query(
      "select count(*) filter (where not is_demo)::int as real, count(*) filter (where is_demo)::int as demo from public.schools",
    );
    return { real: r.rows[0]?.real ?? 0, demo: r.rows[0]?.demo ?? 0 };
  },
};

async function clean(): Promise<void> {
  await withSuperuser(async (c) => {
    await c.query("delete from public.import_batches where file_name like 'repo-test%'");
    await c.query("delete from public.schools where inep = any($1::text[])", [INEPS]);
  });
}

beforeAll(async () => {
  client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query("set role service_role");
  await clean();
});
afterAll(async () => {
  await client.query("reset role");
  await client.end();
  await clean();
});
beforeEach(async () => {
  await client.query("reset role");
  await clean();
  await client.query("set role service_role");
});

const run = (buffer: Buffer, name = "repo-test.csv", isDemo = true) =>
  importInepFile({ fileName: name, buffer, importedBy: null, isDemo }, { repo: createSchoolsRepository(gateway), chunkSize: 3 });

describe("repositório real (service_role) + fixture demo", () => {
  it("importa o fixture: 3 inseridas, 2 duplicadas, 3 rejeitadas; erros e contagem do banco", async () => {
    const repo = createSchoolsRepository(gateway);
    const r = await run(FIXTURE);
    expect(r).toMatchObject({ alreadyExisted: false, status: "completed", fileErrors: [] });
    expect(r.totals).toEqual({ total: 8, inserted: 3, updated: 0, duplicate: 2, rejected: 3, unchanged: 0 });
    const errs = await repo.getErrorRows(r.batchId);
    expect(errs.map((e) => [e.rowNumber, e.action, e.errors[0]?.code])).toEqual([
      [5, "duplicate", "duplicate_inep_in_file"],
      [6, "duplicate", "duplicate_name_municipality"],
      [7, "rejected", "invalid_inep"],
      [8, "rejected", "municipality_not_enabled"],
      [9, "rejected", "invalid_network"],
    ]);
    expect(errs[0]?.raw).toMatchObject({ CO_ENTIDADE: "99001001" });
    const b = await repo.getBatch(r.batchId);
    expect(b).toMatchObject({ status: "completed", isDemo: true, totals: r.totals });
    const s = await client.query("select is_demo, verification_status, phone from public.schools where inep = '99001003'");
    expect(s.rows[0]).toMatchObject({ is_demo: true, verification_status: "registered", phone: "65999990003" });
    expect((await repo.countSchools()).demo).toBeGreaterThanOrEqual(3);
  });

  it("segunda execução do mesmo arquivo é idempotente", async () => {
    const first = await run(FIXTURE);
    const before = await client.query("select count(*)::int as n from public.schools");
    const second = await run(FIXTURE);
    expect(second).toMatchObject({ batchId: first.batchId, alreadyExisted: true, status: "completed" });
    expect(second.totals).toEqual(first.totals);
    expect((await client.query("select count(*)::int as n from public.schools")).rows[0]?.n).toBe(before.rows[0]?.n);
    expect((await client.query("select count(*)::int as n from public.import_batches where file_name like 'repo-test%'")).rows[0]?.n).toBe(1);
  });

  it("arquivo novo atualiza sem duplicar e preserva verification_status", async () => {
    await run(FIXTURE);
    await withSuperuser((c) => c.query("update public.schools set verification_status = 'verified' where inep = '99001001'"));
    const changed = Buffer.from(FIXTURE.toString("utf8").replace("Escola Demonstração 1;5103403", "Escola Demonstração Um;5103403"));
    const r = await run(changed, "repo-test-2.csv");
    expect(r.totals.updated).toBe(1);
    const s = await client.query("select name, verification_status from public.schools where inep = '99001001'");
    expect(s.rows[0]).toMatchObject({ name: "Escola Demonstração Um", verification_status: "verified" });
  });

  it("arquivo sem coluna obrigatória: failed, sem tocar em escolas", async () => {
    const before = await client.query("select count(*)::int as n from public.schools");
    const r = await run(Buffer.from("CO_ENTIDADE;NO_ENTIDADE\n51000101;X\n"));
    expect(r.status).toBe("failed");
    expect(r.fileErrors.length).toBe(2);
    expect((await client.query("select count(*)::int as n from public.schools")).rows[0]?.n).toBe(before.rows[0]?.n);
    expect((await client.query("select status from public.import_batches where id = $1", [r.batchId])).rows[0]?.status).toBe("failed");
  });

  it("falha no meio do lote: failed parcial e retomada completa", async () => {
    let calls = 0;
    const flaky: AdminGateway = {
      ...gateway,
      async rpc(fn, args) {
        if (fn === "import_apply_rows" && ++calls === 2) throw new Error("queda simulada");
        return gateway.rpc(fn, args);
      },
    };
    const input = { fileName: "repo-test-flaky.csv", buffer: FIXTURE, importedBy: null, isDemo: true };
    const failed = await importInepFile(input, { repo: createSchoolsRepository(flaky), chunkSize: 3 });
    expect(failed.status).toBe("failed");
    expect(failed.totals.total).toBe(3);
    const resumed = await importInepFile(input, { repo: createSchoolsRepository(gateway), chunkSize: 3 });
    expect(resumed).toMatchObject({ batchId: failed.batchId, alreadyExisted: true, status: "completed" });
    expect(resumed.totals).toEqual({ total: 8, inserted: 3, updated: 0, duplicate: 2, rejected: 3, unchanged: 0 });
  });
  it("uploads concorrentes do mesmo arquivo: só um processa, o outro recebe o lote existente", async () => {
    const [a, b] = await Promise.all([run(FIXTURE, "repo-test-conc.csv"), run(FIXTURE, "repo-test-conc.csv")]);
    expect(a.batchId).toBe(b.batchId);
    expect([a.alreadyExisted, b.alreadyExisted].filter(Boolean)).toHaveLength(1);
    const r = [a, b].find((x) => !x.alreadyExisted);
    expect(r).toMatchObject({ status: "completed", resumed: false });
    expect(r?.totals).toEqual({ total: 8, inserted: 3, updated: 0, duplicate: 2, rejected: 3, unchanged: 0 });
    const n = await client.query("select count(*)::int as n from public.import_rows where batch_id = $1", [a.batchId]);
    expect(n.rows[0]?.n).toBe(8);
    const bt = await client.query("select status, total_rows, inserted_count from public.import_batches where id = $1", [a.batchId]);
    expect(bt.rows[0]).toEqual({ status: "completed", total_rows: 8, inserted_count: 3 });
  });

  it("lote processing parado há mais de 10 min é retomado; recente não", async () => {
    const claim = createSchoolsRepository(gateway).claimBatch;
    const hash = "repo-test-stale-hash";
    const first = await claim({ fileHash: hash, fileName: "repo-test-stale.csv", importedBy: null, isDemo: true });
    expect(first).toMatchObject({ owner: true, alreadyExisted: false, status: "processing" });
    const fresh = await claim({ fileHash: hash, fileName: "repo-test-stale.csv", importedBy: null, isDemo: true });
    expect(fresh).toMatchObject({ owner: false, alreadyExisted: true, status: "processing" });
    await withSuperuser(async (c) => {
      // o trigger de updated_at sobrescreve o valor: desligado só nesta sessão.
      await c.query("set session_replication_role = replica");
      await c.query("update public.import_batches set updated_at = now() - interval '11 minutes' where id = $1", [first.batchId]);
    });
    const stale = await claim({ fileHash: hash, fileName: "repo-test-stale.csv", importedBy: null, isDemo: true });
    expect(stale).toMatchObject({ owner: true, alreadyExisted: true, batchId: first.batchId });
  });

  it("mesmo arquivo com marcação demo diferente: não reprocessa e sinaliza demo_flag_mismatch", async () => {
    const first = await run(FIXTURE, "repo-test-flag.csv", true);
    const again = await run(FIXTURE, "repo-test-flag.csv", false);
    expect(again).toMatchObject({ batchId: first.batchId, alreadyExisted: true });
    expect(again.fileErrors.map((e) => e.code)).toEqual(["demo_flag_mismatch"]);
  });
});
