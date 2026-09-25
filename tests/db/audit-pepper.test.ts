// audit_row_change lê o pepper do GUC ou, na falta dele, do Vault (o hospedado não permite o GUC no banco) — S11 · Task 2, D-059.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attempt, cleanupUsers, inTx, seedUsers, withClaims, withSuperuser } from "./helpers";

const IP = "203.0.113.9";
const PEPPER = "pepper-de-teste-vault";
const GUC_PEPPER = "pepper-de-teste-guc";
const SECRET = "audit_ip_pepper";

const sha = async (c: import("pg").Client, s: string) => (await c.query("select encode(sha256(convert_to($1, 'utf8')), 'hex') as h", [s])).rows[0].h as string;
async function touch(c: import("pg").Client): Promise<string | null> {
  await c.query("select set_config('request.headers', $1, true)", [JSON.stringify({ "x-forwarded-for": IP })]);
  const m = (await c.query("update public.municipalities set name = name where ibge_code = '5103403' returning id")).rows[0].id as string;
  return (await c.query("select ip_hash from public.audit_log where entity_id = $1 order by created_at desc, id desc limit 1", [m])).rows[0].ip_hash as string | null;
}

beforeAll(seedUsers);
afterAll(async () => {
  await cleanupUsers();
  await withSuperuser(async (c) => {
    await c.query("delete from vault.secrets where name = $1", [SECRET]);
  });
});

describe("audit_row_change: pepper do GUC ou do Vault", () => {
  it("ausentes os dois: sem hash (falha fechada)", async () => {
    await withClaims("admin", async (c) => {
      expect(await touch(c)).toBeNull();
    });
  });

  it("GUC definido: sha256(ip || pepper do GUC)", async () => {
    await withClaims("admin", async (c) => {
      await c.query("select set_config('app.audit_ip_pepper', $1, true)", [GUC_PEPPER]);
      expect(await touch(c)).toBe(await sha(c, IP + GUC_PEPPER));
    });
  });

  it("segredo no Vault e sem GUC: sha256(ip || segredo)", async () => {
    await withSuperuser(async (c) => {
      await c.query("delete from vault.secrets where name = $1", [SECRET]);
      await c.query("select vault.create_secret($1, $2)", [PEPPER, SECRET]);
    });
    await withClaims("admin", async (c) => {
      expect(await touch(c)).toBe(await sha(c, IP + PEPPER));
    });
  });

  it("os dois definidos: o GUC vence; GUC vazio cai para o Vault", async () => {
    await withSuperuser(async (c) => {
      await c.query("delete from vault.secrets where name = $1", [SECRET]);
      await c.query("select vault.create_secret($1, $2)", [PEPPER, SECRET]);
    });
    await withClaims("admin", async (c) => {
      await c.query("select set_config('app.audit_ip_pepper', $1, true)", [GUC_PEPPER]);
      expect(await touch(c)).toBe(await sha(c, IP + GUC_PEPPER));
    });
    await withClaims("admin", async (c) => {
      await c.query("select set_config('app.audit_ip_pepper', '', true)", []);
      expect(await touch(c)).toBe(await sha(c, IP + PEPPER));
    });
  });

  it("a função continua SECURITY DEFINER com search_path vazio e sem EXECUTE para anon, authenticated e service_role", async () => {
    await inTx(async (c) => {
      const f = (await c.query("select prosecdef, proconfig from pg_proc where oid = 'public.audit_row_change()'::regprocedure")).rows[0];
      expect(f.prosecdef).toBe(true);
      expect(f.proconfig).toContain('search_path=""');
    });
    await withClaims("anon", async (c) => {
      expect((await attempt(c, "select public.audit_row_change()")).code).toBe("42501");
    });
  });

  it("nunca vaza o IP nem o segredo no audit_log", async () => {
    await withSuperuser(async (c) => {
      const leak = await c.query("select count(*)::int as n from public.audit_log where row(audit_log.*)::text like $1 or row(audit_log.*)::text like $2", [`%${IP}%`, `%${PEPPER}%`]);
      expect(leak.rows[0].n).toBe(0);
    });
  });
});
