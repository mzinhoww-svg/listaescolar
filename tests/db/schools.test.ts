import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attempt, cleanupUsers, seedUsers, withClaims, withSuperuser, type Identity } from "./helpers";

const DISABLED_IBGE = "5208707"; // Goiânia, desabilitada (fixture)
const ENABLED_INEP = "51000001";
const DISABLED_INEP = "52000001";

const READERS_ENABLED_ONLY: Identity[] = ["anon", "parent", "school_member", "stationery_member", "orphan"];
const READERS_ALL: Identity[] = ["admin", "system"];
const WRITERS_DENIED: Identity[] = ["anon", "parent", "school_member", "stationery_member", "orphan"];
const WRITERS: Identity[] = ["admin", "system"];

const dbRole = (who: Identity) => (who === "anon" ? "anon" : who === "system" ? "service_role" : "authenticated");

const SEED_SCHOOL = `insert into public.schools (inep, name, normalized_name, network, municipality_id)
  select $1, $2, $3, 'municipal', m.id from public.municipalities m where m.ibge_code = $4`;

/** Semeia como superuser dentro da transação do withClaims e devolve ao papel de teste. */
async function seed(c: Client, who: Identity, rows: [string, string, string, string][]): Promise<void> {
  await c.query("reset role");
  for (const r of rows) await c.query(SEED_SCHOOL, r);
  await c.query(`set local role ${dbRole(who)}`);
}

describe("schools e importações: schema", () => {
  beforeAll(async () => {
    await seedUsers();
    await withSuperuser((c) =>
      c.query(
        `insert into public.municipalities (ibge_code, uf, name, is_enabled)
         values ($1, 'GO', 'Goiânia', false) on conflict do nothing`,
        [DISABLED_IBGE],
      ),
    );
  });
  afterAll(async () => {
    await withSuperuser((c) => c.query("delete from public.municipalities where ibge_code = $1", [DISABLED_IBGE]));
    await cleanupUsers();
  });

  for (const [name, values] of Object.entries({
    school_network: ["federal", "state", "municipal", "private"],
    import_status: ["pending", "processing", "completed", "failed"],
    import_row_action: ["inserted", "updated", "duplicate", "rejected"],
  })) {
    it(`enum ${name} tem os valores exatos, em ordem`, async () => {
      const labels = await withSuperuser(async (c) => {
        const r = await c.query<{ enumlabel: string }>(
          `select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
           join pg_namespace n on n.oid = t.typnamespace
           where n.nspname = 'public' and t.typname = $1 order by e.enumsortorder`,
          [name],
        );
        return r.rows.map((x) => x.enumlabel);
      });
      expect(labels).toEqual(values);
    });
  }

  const COLUMNS: Record<string, string[]> = {
    schools: [
      "id", "inep", "name", "normalized_name", "network", "neighborhood", "address", "cep", "phone", "email",
      "municipality_id", "verification_status", "registry_source", "source_batch_id", "is_demo",
      "created_at", "updated_at",
    ],
    import_batches: [
      "id", "file_name", "file_hash", "source", "total_rows", "inserted_count", "updated_count",
      "duplicate_count", "rejected_count", "unchanged_count", "file_errors", "status", "imported_by", "started_at", "finished_at", "is_demo",
      "created_at", "updated_at",
    ],
    import_rows: ["id", "batch_id", "row_number", "raw", "normalized", "errors", "action", "unchanged", "created_at", "updated_at"],
  };
  for (const [table, cols] of Object.entries(COLUMNS)) {
    it(`${table} tem RLS habilitada e as colunas esperadas`, async () => {
      const { rls, got } = await withSuperuser(async (c) => {
        const a = await c.query<{ relrowsecurity: boolean }>(
          "select relrowsecurity from pg_class where oid = ('public.' || $1)::regclass",
          [table],
        );
        const b = await c.query<{ column_name: string }>(
          "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1",
          [table],
        );
        return { rls: a.rows[0]?.relrowsecurity, got: b.rows.map((x) => x.column_name) };
      });
      expect(rls).toBe(true);
      expect(got.sort()).toEqual([...cols].sort());
    });
  }

  it("schools: defaults registered / inep_import / is_demo false", async () => {
    await withClaims("system", async (c) => {
      const r = await attempt(
        c,
        `${SEED_SCHOOL} returning verification_status, registry_source, is_demo`,
        [ENABLED_INEP, "Escola A", "escola a", "5103403"],
      );
      expect(r.error).toBeNull();
      expect(r.rows[0]).toEqual({ verification_status: "registered", registry_source: "inep_import", is_demo: false });
    });
  });

  it("schools: inep é único e tem exatamente 8 dígitos", async () => {
    await withClaims("system", async (c) => {
      expect((await attempt(c, SEED_SCHOOL, [ENABLED_INEP, "A", "a", "5103403"])).error).toBeNull();
      const dup = await attempt(c, SEED_SCHOOL, [ENABLED_INEP, "B", "b", "5103403"]);
      expect(dup.code).toBe("23505");
      for (const bad of ["1234567", "123456789", "abcdefgh", "1234567a"]) {
        const r = await attempt(c, SEED_SCHOOL, [bad, "C", "c", "5103403"]);
        expect(r.code, bad).toBe("23514");
      }
    });
  });

  it("schools: updated_at muda em UPDATE", async () => {
    await withClaims("system", async (c) => {
      await c.query(SEED_SCHOOL, [ENABLED_INEP, "A", "a", "5103403"]);
      await c.query("update public.schools set updated_at = now() - interval '1 day' where inep = $1", [ENABLED_INEP]);
      const r = await c.query<{ ok: boolean }>(
        `update public.schools set name = 'A2' where inep = $1
         returning updated_at > now() - interval '1 hour' as ok`,
        [ENABLED_INEP],
      );
      expect(r.rows[0]?.ok).toBe(true);
    });
  });

  it("auditoria de schools grava INSERT/UPDATE sem email nem phone", async () => {
    await withClaims("system", async (c) => {
      await c.query(
        `insert into public.schools (inep, name, normalized_name, network, municipality_id, email, phone)
         select $1, 'Escola Audit', 'escola audit', 'state', m.id, 'contato@escola.invalid', '65999990000'
         from public.municipalities m where m.ibge_code = '5103403'`,
        [ENABLED_INEP],
      );
      await c.query("update public.schools set email = 'novo@escola.invalid', name = 'Escola Audit 2' where inep = $1", [
        ENABLED_INEP,
      ]);
      await c.query("reset role");
      const r = await c.query<{ action: string; before: Record<string, unknown> | null; after: Record<string, unknown> }>(
        `select action, before, after from public.audit_log
         where entity_table = 'schools' and after ->> 'inep' = $1 order by created_at`,
        [ENABLED_INEP],
      );
      expect(r.rows.map((x) => x.action)).toEqual(["INSERT", "UPDATE"]);
      for (const row of r.rows) {
        for (const snap of [row.before, row.after]) {
          if (!snap) continue;
          expect(snap).not.toHaveProperty("email");
          expect(snap).not.toHaveProperty("phone");
        }
      }
      expect(r.rows[1]?.after.name).toBe("Escola Audit 2");
    });
  });

  for (const who of READERS_ENABLED_ONLY) {
    it(`${who} lê apenas escolas de município habilitado`, async () => {
      await withClaims(who, async (c) => {
        await seed(c, who, [
          [ENABLED_INEP, "Escola Habilitada", "escola habilitada", "5103403"],
          [DISABLED_INEP, "Escola Desabilitada", "escola desabilitada", DISABLED_IBGE],
        ]);
        const r = await attempt(c, "select inep from public.schools where inep in ($1, $2)", [ENABLED_INEP, DISABLED_INEP]);
        expect(r.error).toBeNull();
        expect(r.rows.map((x) => x.inep)).toEqual([ENABLED_INEP]);
      });
    });
  }

  for (const who of READERS_ALL) {
    it(`${who} lê escolas de municípios desabilitados também`, async () => {
      await withClaims(who, async (c) => {
        await seed(c, who, [
          [ENABLED_INEP, "Escola Habilitada", "escola habilitada", "5103403"],
          [DISABLED_INEP, "Escola Desabilitada", "escola desabilitada", DISABLED_IBGE],
        ]);
        const r = await attempt(c, "select inep from public.schools where inep in ($1, $2) order by inep", [
          ENABLED_INEP,
          DISABLED_INEP,
        ]);
        expect(r.rows.map((x) => x.inep)).toEqual([ENABLED_INEP, DISABLED_INEP]);
      });
    });
  }

  for (const who of WRITERS_DENIED) {
    it(`${who} não escreve em schools`, async () => {
      await withClaims(who, async (c) => {
        await seed(c, who, [[ENABLED_INEP, "Escola", "escola", "5103403"]]);
        const ins = await attempt(c, SEED_SCHOOL, ["51000002", "X", "x", "5103403"]);
        expect(ins.error).not.toBeNull();
        const upd = await attempt(c, "update public.schools set name = 'Hack' where inep = $1", [ENABLED_INEP]);
        expect(upd.error !== null || upd.rowCount === 0).toBe(true);
        const del = await attempt(c, "delete from public.schools where inep = $1", [ENABLED_INEP]);
        expect(del.error !== null || del.rowCount === 0).toBe(true);
      });
    });
  }

  for (const who of WRITERS) {
    it(`${who} insere, atualiza e apaga em schools`, async () => {
      await withClaims(who, async (c) => {
        expect((await attempt(c, SEED_SCHOOL, [ENABLED_INEP, "A", "a", "5103403"])).error).toBeNull();
        const upd = await attempt(c, "update public.schools set name = 'B' where inep = $1", [ENABLED_INEP]);
        expect(upd.rowCount).toBe(1);
        const del = await attempt(c, "delete from public.schools where inep = $1", [ENABLED_INEP]);
        expect(del.rowCount).toBe(1);
      });
    });
  }

  const BATCH = `insert into public.import_batches (file_name, file_hash) values ('a.csv', $1) returning id`;
  for (const who of ["anon", "parent", "school_member", "stationery_member", "orphan"] as Identity[]) {
    it(`${who} não lê nem escreve import_batches/import_rows`, async () => {
      await withClaims(who, async (c) => {
        await c.query("reset role");
        const b = await c.query<{ id: string }>(BATCH, [`hash-${who}`]);
        await c.query(
          "insert into public.import_rows (batch_id, row_number, raw, normalized, errors, action) values ($1, 1, '{}', '{}', '[]', 'inserted')",
          [b.rows[0]?.id],
        );
        await c.query(`set local role ${dbRole(who)}`);
        for (const t of ["import_batches", "import_rows"]) {
          const r = await attempt(c, `select 1 from public.${t}`);
          expect(r.error !== null || r.rowCount === 0, t).toBe(true);
        }
        const w = await attempt(c, BATCH, ["outro-hash"]);
        expect(w.error).not.toBeNull();
      });
    });
  }

  for (const who of WRITERS) {
    it(`${who} lê import_batches e import_rows`, async () => {
      await withClaims(who, async (c) => {
        await c.query("reset role");
        const b = await c.query<{ id: string }>(BATCH, [`hash-${who}`]);
        await c.query(
          "insert into public.import_rows (batch_id, row_number, raw, normalized, errors, action) values ($1, 1, '{}', '{}', '[]', 'inserted')",
          [b.rows[0]?.id],
        );
        await c.query(`set local role ${dbRole(who)}`);
        expect((await attempt(c, "select 1 from public.import_batches")).rowCount).toBeGreaterThan(0);
        expect((await attempt(c, "select 1 from public.import_rows")).rowCount).toBeGreaterThan(0);
      });
    });
  }

  it("import_rows: (batch_id, row_number) é único", async () => {
    await withClaims("system", async (c) => {
      const b = await c.query<{ id: string }>(BATCH, ["hash-uniq"]);
      const ins = "insert into public.import_rows (batch_id, row_number, action) values ($1, 7, 'inserted')";
      expect((await attempt(c, ins, [b.rows[0]?.id])).error).toBeNull();
      expect((await attempt(c, ins, [b.rows[0]?.id])).code).toBe("23505");
    });
  });
});
