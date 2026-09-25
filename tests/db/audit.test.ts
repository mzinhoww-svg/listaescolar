import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attempt, cleanupUsers, IDS, seedUsers, withClaims, withSuperuser, type Identity } from "./helpers";

describe("audit_log", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  async function makeAuditRow(): Promise<void> {
    // Linha commitada, fora de rollback, para os testes de UPDATE/DELETE terem alvo real.
    await withSuperuser((c) =>
      c.query("update public.municipalities set name = 'Cuiabá' where ibge_code = '5103403'"),
    );
  }

  for (const who of ["admin", "system"] as const) {
    it(`${who} lê o audit_log`, async () => {
      await makeAuditRow();
      await withClaims(who, async (c) => {
        const r = await c.query("select id from public.audit_log limit 1");
        expect(r.rowCount).toBe(1);
      });
    });
  }

  for (const who of ["anon", "parent", "school_member", "stationery_member", "orphan"] as const) {
    it(`${who} não lê o audit_log`, async () => {
      await makeAuditRow();
      await withClaims(who, async (c) => {
        const r = await attempt(c, "select id from public.audit_log");
        expect(r.rows).toEqual([]);
      });
    });
  }

  for (const who of ["admin", "system", "parent", "anon"] as const satisfies Identity[]) {
    it(`${who} não altera nem apaga o audit_log`, async () => {
      await makeAuditRow();
      const before = await withSuperuser(async (c) => (await c.query("select count(*)::int as n from public.audit_log")).rows[0]);
      await withClaims(who, async (c) => {
        const upd = await attempt(c, "update public.audit_log set action = 'x'");
        expect(upd.error !== null || upd.rowCount === 0).toBe(true);
        const del = await attempt(c, "delete from public.audit_log");
        expect(del.error !== null || del.rowCount === 0).toBe(true);
        const trunc = await attempt(c, "truncate public.audit_log");
        expect(trunc.error).not.toBeNull();
        const ins = await attempt(
          c,
          "insert into public.audit_log (action, entity_table) values ('forjado', 'x')",
        );
        expect(ins.error).not.toBeNull();
      });
      const after = await withSuperuser(async (c) => (await c.query("select count(*)::int as n from public.audit_log")).rows[0]);
      expect(after).toEqual(before);
    });
  }

  it("mesmo o dono da tabela não altera nem apaga (trigger append-only)", async () => {
    await makeAuditRow();
    await withSuperuser(async (c) => {
      await c.query("begin");
      const upd = await attempt(c, "update public.audit_log set action = 'x'");
      const del = await attempt(c, "delete from public.audit_log");
      await c.query("rollback");
      expect(upd.error).not.toBeNull();
      expect(del.error).not.toBeNull();
    });
  });

  it("update em municipalities gera linha com ação, entidade, antes/depois e ator", async () => {
    await withClaims("admin", async (c) => {
      const m = await c.query<{ id: string }>(
        "update public.municipalities set name = 'Cuiabá (teste)' where ibge_code = '5103403' returning id",
      );
      const id = m.rows[0]?.id;
      const r = await c.query(
        `select action, entity_table, entity_id, before, after, actor_id, actor_role
         from public.audit_log where entity_table = 'municipalities' and entity_id = $1
         order by created_at desc, id desc limit 1`,
        [id],
      );
      const row = r.rows[0];
      expect(row.action).toBe("UPDATE");
      expect(row.entity_table).toBe("municipalities");
      expect(row.before.name).toBe("Cuiabá");
      expect(row.after.name).toBe("Cuiabá (teste)");
      expect(row.actor_id).toBe(IDS.admin);
      expect(row.actor_role).toBe("admin");
    });
  });

  it("INSERT e DELETE também são auditados; system aparece como actor_role system", async () => {
    await withClaims("system", async (c) => {
      const ins = await c.query<{ id: string }>(
        "insert into public.municipalities (ibge_code, uf, name) values ('3550308', 'SP', 'São Paulo') returning id",
      );
      const id = ins.rows[0]?.id;
      await c.query("delete from public.municipalities where id = $1", [id]);
      const r = await c.query(
        "select action, before is null as no_before, after is null as no_after, actor_role from public.audit_log where entity_id = $1 order by created_at, id",
        [id],
      );
      expect(r.rows).toEqual([
        { action: "INSERT", no_before: true, no_after: false, actor_role: "system" },
        { action: "DELETE", no_before: false, no_after: true, actor_role: "system" },
      ]);
    });
  });

  it("mudança em profiles é auditada", async () => {
    await withClaims("admin", async (c) => {
      await c.query("update public.profiles set role = 'school_member' where id = $1", [IDS.parent]);
      const r = await c.query(
        "select before->>'role' as b, after->>'role' as a from public.audit_log where entity_table = 'profiles' and entity_id = $1 and action = 'UPDATE' order by created_at desc, id desc limit 1",
        [IDS.parent],
      );
      expect(r.rows).toEqual([{ b: "parent", a: "school_member" }]);
    });
  });

  it("ip_hash é sha256 do IP e nunca contém o IP em claro", async () => {
    const ip = "203.0.113.42";
    await withClaims("admin", async (c) => {
      await c.query("select set_config('request.headers', $1, true)", [
        JSON.stringify({ "x-forwarded-for": `${ip}, 10.0.0.1` }),
      ]);
      await c.query("update public.municipalities set name = 'Cuiabá' where ibge_code = '5103403'");
      const r = await c.query<{ ip_hash: string | null }>(
        "select ip_hash from public.audit_log order by created_at desc, id desc limit 1",
      );
      const hash = r.rows[0]?.ip_hash;
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hash).not.toContain(ip);
      expect(hash).not.toContain("203");
    });
  });

  it("ip_hash é NULL quando não há cabeçalho", async () => {
    await withClaims("admin", async (c) => {
      await c.query("update public.municipalities set name = 'Cuiabá' where ibge_code = '5103403'");
      const r = await c.query("select ip_hash from public.audit_log order by created_at desc, id desc limit 1");
      expect(r.rows[0]?.ip_hash).toBeNull();
    });
  });
});
