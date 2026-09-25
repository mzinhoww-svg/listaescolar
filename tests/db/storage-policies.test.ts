import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { attempt, cleanupUsers, IDS, seedUsers, withClaims, withSuperuser } from "./helpers";

const OWN = `${IDS.parent}/sub-1/lista.pdf`;
const OTHER = `${IDS.school_member}/sub-2/lista.pdf`;
const put = (name: string) => `insert into storage.objects (bucket_id, name, owner_id) values ('list-uploads', '${name}', '${IDS.parent}')`;

// storage.protect_delete bloqueia DELETE direto; o flag abre a exceção só nesta transação de limpeza.
async function wipe(c: Client): Promise<void> {
  await c.query("begin");
  await c.query("select set_config('storage.allow_delete_query', 'true', true)");
  await c.query("delete from storage.objects where bucket_id = 'list-uploads'");
  await c.query("commit");
}

describe("bucket list-uploads e storage.objects", () => {
  beforeAll(async () => {
    await seedUsers();
    await withSuperuser(async (c) => {
      await wipe(c);
      await c.query("insert into storage.objects (bucket_id, name) values ('list-uploads', $1), ('list-uploads', $2)", [OWN, OTHER]);
    });
  });
  afterAll(async () => {
    await withSuperuser(wipe);
    await cleanupUsers();
  });

  it("bucket privado, 10 MiB, tipos permitidos", async () => {
    await withSuperuser(async (c) => {
      const r = await c.query<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(
        "select public, file_size_limit::text, allowed_mime_types from storage.buckets where id = 'list-uploads'",
      );
      expect(r.rows[0]?.public).toBe(false);
      expect(r.rows[0]?.file_size_limit).toBe("10485760");
      expect([...(r.rows[0]?.allowed_mime_types ?? [])].sort()).toEqual(
        ["application/pdf", "image/heic", "image/jpeg", "image/png", "image/webp"],
      );
    });
  });

  it("dono envia e lê na própria pasta", async () => {
    await withClaims("parent", async (c) => {
      const ins = await attempt(c, put(`${IDS.parent}/sub-9/foto.jpg`));
      expect(ins.error).toBeNull();
      const sel = await c.query("select name from storage.objects where bucket_id = 'list-uploads' order by name");
      expect(sel.rows.map((r) => r.name)).toContain(OWN);
      expect(sel.rows.map((r) => r.name)).not.toContain(OTHER);
    });
  });

  it("outro usuário não envia na pasta alheia nem lê", async () => {
    await withClaims("school_member", async (c) => {
      const ins = await attempt(c, put(OWN.replace("sub-1", "sub-8")));
      expect(ins.error).not.toBeNull();
      const sel = await c.query("select name from storage.objects where bucket_id = 'list-uploads'");
      expect(sel.rows.map((r) => r.name)).toEqual([OTHER]);
    });
  });

  it("caminho com traversal ou fora da pasta do usuário é recusado", async () => {
    await withClaims("parent", async (c) => {
      for (const name of [`../${IDS.school_member}/x.pdf`, `x/${IDS.parent}/a.pdf`, "a.pdf"]) {
        const r = await attempt(c, put(name));
        expect(r.error, name).not.toBeNull();
      }
    });
  });

  it("anon não envia nem lê", async () => {
    await withClaims("anon", async (c) => {
      expect((await attempt(c, put(OWN))).error).not.toBeNull();
      const sel = await attempt(c, "select name from storage.objects where bucket_id = 'list-uploads'");
      expect(sel.error !== null || sel.rowCount === 0).toBe(true);
    });
  });

  it("papéis sem permissão de envio (stationery_member) não enviam", async () => {
    await withClaims("stationery_member", async (c) => {
      const r = await attempt(c, `insert into storage.objects (bucket_id, name, owner_id) values ('list-uploads', '${IDS.stationery_member}/s/a.pdf', '${IDS.stationery_member}')`);
      expect(r.error).not.toBeNull();
    });
  });

  it("admin e system leem tudo", async () => {
    for (const who of ["admin", "system"] as const) {
      await withClaims(who, async (c) => {
        const sel = await c.query("select name from storage.objects where bucket_id = 'list-uploads'");
        expect(sel.rows.map((r) => r.name).sort()).toEqual([OWN, OTHER].sort());
      });
    }
  });

  it("usuário não altera nem apaga objetos (inclusive os próprios)", async () => {
    await withClaims("parent", async (c) => {
      expect((await attempt(c, "update storage.objects set name = name || 'x' where bucket_id = 'list-uploads'")).rowCount).toBe(0);
      expect((await attempt(c, "delete from storage.objects where bucket_id = 'list-uploads'")).rowCount).toBe(0);
    });
  });

  it("nenhuma política de storage.objects deste bucket se aplica a public/anon", async () => {
    await withSuperuser(async (c) => {
      const r = await c.query<{ polname: string; roles: string[] }>(
        `select polname, array(select rolname::text from pg_roles where oid = any(polroles)) roles
           from pg_policy where polrelid = 'storage.objects'::regclass and polname like 'list_uploads%'`,
      );
      expect(r.rowCount).toBeGreaterThanOrEqual(2);
      for (const p of r.rows) expect(p.roles).toEqual(["authenticated"]);
    });
  });
});
