import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attempt, cleanupUsers, IDS, seedUsers, withClaims, withSuperuser } from "./helpers";

const IP = "203.0.113.42";
const PEPPER = "pimenta-de-teste";

async function touchMunicipality(c: import("pg").Client): Promise<string> {
  const m = await c.query<{ id: string }>(
    "update public.municipalities set name = 'Cuiabá' where ibge_code = '5103403' returning id",
  );
  return m.rows[0]?.id ?? "";
}

async function lastHash(c: import("pg").Client, id: string): Promise<string | null> {
  const r = await c.query<{ ip_hash: string | null }>(
    "select ip_hash from public.audit_log where entity_id = $1 order by created_at desc, id desc limit 1",
    [id],
  );
  return r.rows[0]?.ip_hash ?? null;
}

async function sha(c: import("pg").Client, text: string): Promise<string> {
  const r = await c.query<{ h: string }>("select encode(sha256(convert_to($1, 'utf8')), 'hex') as h", [text]);
  return r.rows[0]?.h ?? "";
}

describe("hardening da auditoria e dos grants", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("audit_log nunca contém display_name (PII)", async () => {
    await withClaims("admin", async (c) => {
      await c.query("update public.profiles set display_name = 'Nome Secreto' where id = $1", [IDS.parent]);
      await c.query("update public.profiles set role = 'school_member' where id = $1", [IDS.parent]);
    });
    await withSuperuser(async (c) => {
      await c.query("update public.profiles set display_name = 'Outro Nome' where id = $1", [IDS.parent]);
      const r = await c.query(
        `select count(*)::int as n from public.audit_log
          where entity_table = 'profiles' and entity_id = any($1::uuid[])
            and (before::text like '%display_name%' or after::text like '%display_name%'
                 or before::text like '%Teste %' or after::text like '%Teste %'
                 or after::text like '%Nome%')`,
        [Object.values(IDS)],
      );
      expect(r.rows[0]?.n).toBe(0);
      const all = await c.query(
        "select count(*)::int as n from public.audit_log where entity_table = 'profiles' and entity_id = any($1::uuid[])",
        [Object.values(IDS)],
      );
      expect(all.rows[0]?.n).toBeGreaterThan(0);
    });
  });

  for (const table of ["municipalities", "profiles"]) {
    it(`system não consegue TRUNCATE em ${table}`, async () => {
      await withClaims("system", async (c) => {
        const r = await attempt(c, `truncate public.${table} cascade`);
        expect(r.error).toMatch(/permission denied/i);
      });
    });
  }

  it("ip_hash é NULL sem pepper, mesmo com IP", async () => {
    await withClaims("admin", async (c) => {
      await c.query("select set_config('request.headers', $1, true)", [JSON.stringify({ "x-forwarded-for": IP })]);
      const id = await touchMunicipality(c);
      expect(await lastHash(c, id)).toBeNull();
    });
  });

  it("com pepper: sha256(ip || pepper), 64 hex, difere do sha256 puro, IP nunca em claro", async () => {
    await withClaims("admin", async (c) => {
      await c.query("select set_config('app.audit_ip_pepper', $1, true)", [PEPPER]);
      await c.query("select set_config('request.headers', $1, true)", [JSON.stringify({ "x-forwarded-for": IP })]);
      const id = await touchMunicipality(c);
      const hash = await lastHash(c, id);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hash).toBe(await sha(c, IP + PEPPER));
      expect(hash).not.toBe(await sha(c, IP));
      const leak = await c.query(
        "select count(*)::int as n from public.audit_log where entity_id = $1 and row(audit_log.*)::text like $2",
        [id, `%${IP}%`],
      );
      expect(leak.rows[0]?.n).toBe(0);
    });
  });

  it("usa o ÚLTIMO valor de x-forwarded-for", async () => {
    await withClaims("admin", async (c) => {
      await c.query("select set_config('app.audit_ip_pepper', $1, true)", [PEPPER]);
      await c.query("select set_config('request.headers', $1, true)", [
        JSON.stringify({ "x-forwarded-for": `198.51.100.7, ${IP}` }),
      ]);
      const id = await touchMunicipality(c);
      expect(await lastHash(c, id)).toBe(await sha(c, IP + PEPPER));
    });
  });

  it("session_replication_role = replica não desliga append-only nem auditoria", async () => {
    await withSuperuser(async (c) => {
      await c.query("begin");
      await c.query("set local session_replication_role = replica");
      const del = await attempt(c, "delete from public.audit_log");
      expect(del.error).not.toBeNull();
      const before = await c.query("select count(*)::int as n from public.audit_log");
      await c.query("update public.municipalities set name = 'Cuiabá' where ibge_code = '5103403'");
      const after = await c.query("select count(*)::int as n from public.audit_log");
      await c.query("rollback");
      expect(after.rows[0]?.n).toBe((before.rows[0]?.n ?? 0) + 1);
    });
  });

  it("funções de trigger não são executáveis por anon/authenticated/service_role", async () => {
    await withSuperuser(async (c) => {
      for (const fn of [
        "audit_row_change()",
        "audit_log_block_mutation()",
        "profiles_guard_role()",
        "set_updated_at()",
      ]) {
        for (const role of ["anon", "authenticated", "service_role"]) {
          const r = await c.query<{ ok: boolean }>("select has_function_privilege($1, $2, 'execute') as ok", [
            role,
            `public.${fn}`,
          ]);
          expect(r.rows[0]?.ok, `${role} em ${fn}`).toBe(false);
        }
      }
      const r = await c.query<{ ok: boolean }>(
        "select has_function_privilege('authenticated', 'public.auth_role()', 'execute') as ok",
      );
      expect(r.rows[0]?.ok).toBe(true);
    });
  });

  it("claim service_role sob role de banco authenticated NÃO vira system", async () => {
    await withSuperuser(async (c) => {
      await c.query("begin");
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ role: "service_role" }),
      ]);
      const r = await c.query("select public.auth_role()::text as role");
      await c.query("rollback");
      expect(r.rows[0]?.role).toBeNull();
    });
  });
});
